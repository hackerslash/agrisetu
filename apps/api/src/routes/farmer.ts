import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireFarmer } from "../middleware/auth.js";
import { success, error } from "../lib/response.js";
import {
  assignOrderToCluster,
  checkAndTransitionPayment,
  createNewClusterAndAssignOrder,
  findJoinableClusters,
} from "../services/cluster.js";
import {
  ClusterStatus,
  GigStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";
import { isValidCoordinate, isWithinRadiusKm } from "../lib/geo.js";
import {
  extractVoiceOrderFromTranscript,
  type GigContext,
} from "../services/ai-order-parser.js";
import { transcribeAudioBuffer } from "../services/transcribe.js";

const router = Router();
router.use(authenticate, requireFarmer);
const FARMER_CLUSTER_RADIUS_KM = 50;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function isGigServiceableForFarmer(params: {
  farmerLatitude?: number | null;
  farmerLongitude?: number | null;
  farmerState?: string | null;
  vendorLatitude?: number | null;
  vendorLongitude?: number | null;
  vendorState?: string | null;
  serviceRadiusKm?: number | null;
}) {
  const {
    farmerLatitude,
    farmerLongitude,
    farmerState,
    vendorLatitude,
    vendorLongitude,
    vendorState,
    serviceRadiusKm,
  } = params;

  const farmerHasCoords = isValidCoordinate(farmerLatitude, farmerLongitude);
  const vendorHasCoords = isValidCoordinate(vendorLatitude, vendorLongitude);

  if (farmerHasCoords && vendorHasCoords) {
    const radiusKm =
      typeof serviceRadiusKm === "number" && serviceRadiusKm > 0
        ? serviceRadiusKm
        : 0;
    if (radiusKm <= 0) return false;
    return isWithinRadiusKm(
      { latitude: farmerLatitude as number, longitude: farmerLongitude as number },
      { latitude: vendorLatitude as number, longitude: vendorLongitude as number },
      radiusKm,
    );
  }

  if (farmerState && vendorState) {
    return farmerState.toLowerCase() === vendorState.toLowerCase();
  }

  return true;
}

async function getAvailableGigContextForFarmer(
  farmerId: string,
): Promise<{
  farmerLanguage: string | null;
  gigs: GigContext[];
}> {
  const farmer = await prisma.farmer.findUnique({
    where: { id: farmerId },
    select: {
      language: true,
      state: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!farmer) {
    throw new Error("Farmer profile not found");
  }

  const gigs = await prisma.gig.findMany({
    where: {
      status: GigStatus.PUBLISHED,
      availableQuantity: { gt: 0 },
    },
    include: {
      vendor: {
        select: {
          businessName: true,
          state: true,
          latitude: true,
          longitude: true,
          serviceRadiusKm: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 120,
  });

  const serviceableGigs = gigs
    .filter((gig) =>
      isGigServiceableForFarmer({
        farmerLatitude: farmer.latitude,
        farmerLongitude: farmer.longitude,
        farmerState: farmer.state,
        vendorLatitude: gig.vendor.latitude,
        vendorLongitude: gig.vendor.longitude,
        vendorState: gig.vendor.state,
        serviceRadiusKm: gig.vendor.serviceRadiusKm,
      }),
    )
    .slice(0, 60)
    .map((gig) => ({
      id: gig.id,
      cropName: gig.cropName,
      unit: gig.unit,
      minQuantity: gig.minQuantity,
      pricePerUnit: gig.pricePerUnit,
      vendorBusinessName: gig.vendor.businessName,
      vendorState: gig.vendor.state,
    }));

  return {
    farmerLanguage: farmer.language,
    gigs: serviceableGigs,
  };
}

// ─── Profile ──────────────────────────────────────────────────────────────────

router.get("/profile", async (req, res) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
    });
    if (!farmer) {
      error(res, "Farmer not found", 404);
      return;
    }
    success(res, farmer);
  } catch (e) {
    error(res, "Internal server error", 500);
  }
});

const updateProfileSchema = z.object({
  name: z.string().optional(),
  village: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  locationAddress: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  landArea: z.number().optional(),
  cropsGrown: z.array(z.string()).optional(),
  upiId: z.string().optional(),
  language: z.string().optional(),
  aadhaarLinked: z.boolean().optional(),
});

router.patch("/profile", async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const farmer = await prisma.farmer.update({
      where: { id: req.user!.id },
      data: parsed.data,
    });
    success(res, farmer);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const voiceOrderSchema = z.object({
  transcript: z.string().trim().min(2).max(1000).optional(),
  languageCode: z.string().trim().min(2).max(16).optional(),
});

router.post("/voice/parse-order", upload.single("audio"), async (req, res) => {
  const parsed = voiceOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  const audioFile = req.file;
  let transcript = parsed.data.transcript?.trim() ?? "";
  let detectedLanguageCode: string | null = null;

  if (!audioFile && transcript.length === 0) {
    error(
      res,
      "Provide either voice audio file or transcript text",
      422,
    );
    return;
  }

  try {
    const context = await getAvailableGigContextForFarmer(req.user!.id);
    const languageCode = parsed.data.languageCode;

    if (audioFile) {
      const transcribed = await transcribeAudioBuffer({
        audioBuffer: audioFile.buffer,
        fileName: audioFile.originalname,
        mimeType: audioFile.mimetype,
        languageCode: languageCode ?? undefined,
      });
      transcript = transcribed.transcript;
      detectedLanguageCode = transcribed.detectedLanguageCode;
    }

    const extraction = await extractVoiceOrderFromTranscript({
      transcript,
      gigs: context.gigs,
      farmerLanguage: context.farmerLanguage,
    });

    success(res, {
      transcript,
      extraction,
      context: {
        availableGigCount: context.gigs.length,
        transcribedFromAudio: Boolean(audioFile),
        detectedLanguageCode,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Unable to process voice order";
    error(res, message, 500);
  }
});

// ─── Orders ───────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  cropName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z
    .string()
    .min(1)
    .transform((v) => v.toLowerCase().trim()),
  matchedGigId: z.string().trim().min(1).optional(),
  deliveryDate: z.string().optional(),
});

router.post("/orders", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
      select: {
        district: true,
        state: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!farmer) {
      error(res, "Farmer profile not found", 404);
      return;
    }

    let resolvedCropName = parsed.data.cropName.trim();
    let resolvedUnit = parsed.data.unit;

    if (parsed.data.matchedGigId) {
      const matchedGig = await prisma.gig.findFirst({
        where: {
          id: parsed.data.matchedGigId,
          status: GigStatus.PUBLISHED,
          availableQuantity: { gt: 0 },
        },
        include: {
          vendor: {
            select: {
              state: true,
              latitude: true,
              longitude: true,
              serviceRadiusKm: true,
            },
          },
        },
      });

      if (
        matchedGig &&
        isGigServiceableForFarmer({
          farmerLatitude: farmer.latitude,
          farmerLongitude: farmer.longitude,
          farmerState: farmer.state,
          vendorLatitude: matchedGig.vendor.latitude,
          vendorLongitude: matchedGig.vendor.longitude,
          vendorState: matchedGig.vendor.state,
          serviceRadiusKm: matchedGig.vendor.serviceRadiusKm,
        })
      ) {
        resolvedCropName = matchedGig.cropName;
        resolvedUnit = matchedGig.unit.toLowerCase().trim();
      }
    }

    const order = await prisma.order.create({
      data: {
        farmerId: req.user!.id,
        cropName: resolvedCropName,
        quantity: parsed.data.quantity,
        unit: resolvedUnit,
        deliveryDate: parsed.data.deliveryDate
          ? new Date(parsed.data.deliveryDate)
          : null,
      },
    });

    const availableClusters = await findJoinableClusters(
      resolvedCropName,
      resolvedUnit,
      farmer.district ?? undefined,
      farmer.latitude ?? undefined,
      farmer.longitude ?? undefined,
    );

    success(res, { ...order, availableClusters }, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/orders", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { farmerId: req.user!.id },
      include: { clusterMember: { include: { cluster: true } } },
      orderBy: { createdAt: "desc" },
    });
    success(res, orders);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/orders/:id/cluster-options", async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, farmerId: req.user!.id },
      select: {
        id: true,
        cropName: true,
        unit: true,
        status: true,
      },
    });
    if (!order) {
      error(res, "Order not found", 404);
      return;
    }
    if (order.status !== OrderStatus.PENDING) {
      error(res, "Cluster selection is only available for pending orders", 400);
      return;
    }

    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
      select: { district: true, latitude: true, longitude: true },
    });

    const clusters = await findJoinableClusters(
      order.cropName,
      order.unit,
      farmer?.district ?? undefined,
      farmer?.latitude ?? undefined,
      farmer?.longitude ?? undefined,
    );
    success(res, clusters);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const assignClusterSchema = z
  .object({
    clusterId: z.string().optional(),
    createNew: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.clusterId) || Boolean(v.createNew), {
    message: "Either clusterId or createNew must be provided",
  })
  .refine((v) => !(v.clusterId && v.createNew), {
    message: "Provide either clusterId or createNew, not both",
  });

router.post("/orders/:id/assign-cluster", async (req, res) => {
  const parsed = assignClusterSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, farmerId: req.user!.id },
      select: {
        id: true,
        cropName: true,
        quantity: true,
        unit: true,
        status: true,
      },
    });

    if (!order) {
      error(res, "Order not found", 404);
      return;
    }
    if (order.status !== OrderStatus.PENDING) {
      error(res, "Order is already assigned to a cluster", 400);
      return;
    }

    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
      select: {
        district: true,
        state: true,
        locationAddress: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!farmer) {
      error(res, "Farmer profile not found", 404);
      return;
    }

    if (parsed.data.clusterId) {
      const cluster = await prisma.cluster.findUnique({
        where: { id: parsed.data.clusterId },
        select: {
          id: true,
          cropName: true,
          unit: true,
          district: true,
          status: true,
          latitude: true,
          longitude: true,
        },
      });

      if (
        !cluster ||
        (cluster.status !== ClusterStatus.FORMING &&
          cluster.status !== ClusterStatus.VOTING)
      ) {
        error(res, "Selected cluster is not available", 400);
        return;
      }

      const sameCrop =
        cluster.cropName.toLowerCase() === order.cropName.toLowerCase();
      const sameUnit = cluster.unit.toLowerCase() === order.unit.toLowerCase();
      const sameDistrict =
        !farmer.district ||
        !cluster.district ||
        farmer.district.toLowerCase() === cluster.district.toLowerCase();
      const hasGeoContext =
        isValidCoordinate(farmer.latitude, farmer.longitude) &&
        isValidCoordinate(cluster.latitude, cluster.longitude);
      const sameGeo = hasGeoContext
        ? isWithinRadiusKm(
            {
              latitude: farmer.latitude as number,
              longitude: farmer.longitude as number,
            },
            {
              latitude: cluster.latitude as number,
              longitude: cluster.longitude as number,
            },
            FARMER_CLUSTER_RADIUS_KM,
          )
        : null;

      if (
        !sameCrop ||
        !sameUnit ||
        !((sameGeo ?? false) || (!hasGeoContext && sameDistrict))
      ) {
        error(res, "Selected cluster does not match this order", 400);
        return;
      }

      await assignOrderToCluster({
        clusterId: cluster.id,
        farmerId: req.user!.id,
        orderId: order.id,
        quantity: order.quantity,
      });
    } else {
      await createNewClusterAndAssignOrder({
        farmerId: req.user!.id,
        orderId: order.id,
        cropName: order.cropName,
        quantity: order.quantity,
        unit: order.unit,
        district: farmer.district ?? undefined,
        state: farmer.state ?? undefined,
        locationAddress: farmer.locationAddress ?? undefined,
        latitude: farmer.latitude ?? undefined,
        longitude: farmer.longitude ?? undefined,
      });
    }

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        clusterMember: {
          include: {
            cluster: {
              include: {
                members: { include: { farmer: true, order: true } },
                bids: { include: { vendor: true, vendorVotes: true } },
                delivery: true,
                vendor: true,
                ratings: {
                  where: { farmerId: req.user!.id },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    success(res, updatedOrder);
  } catch (e) {
    if (
      e instanceof Error &&
      e.message === "Cluster not available for joining"
    ) {
      error(res, e.message, 400);
      return;
    }
    error(res, "Internal server error", 500);
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, farmerId: req.user!.id },
      include: {
        clusterMember: {
          include: {
            cluster: {
              include: {
                bids: {
                  include: {
                    vendor: true,
                    vendorVotes: { where: { farmerId: req.user!.id } },
                  },
                  orderBy: { votes: "desc" },
                },
                vendor: true,
                delivery: true,
                ratings: {
                  where: { farmerId: req.user!.id },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!order) {
      error(res, "Order not found", 404);
      return;
    }
    success(res, order);
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Clusters ─────────────────────────────────────────────────────────────────

router.get("/clusters", async (req, res) => {
  const { crop } = req.query;
  try {
    const clusters = await prisma.cluster.findMany({
      where: {
        members: { some: { farmerId: req.user!.id } },
        status: { notIn: [ClusterStatus.COMPLETED, ClusterStatus.FAILED] },
        ...(crop
          ? { cropName: { contains: crop as string, mode: "insensitive" } }
          : {}),
      },
      include: {
        members: true,
        bids: { include: { vendor: true } },
      },
      distinct: ["id"],
      orderBy: { createdAt: "desc" },
    });
    success(res, clusters);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post("/clusters/:id/join", async (req, res) => {
  const joinSchema = z.object({
    orderId: z.string(),
    quantity: z.number().positive(),
  });
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const order = await prisma.order.findFirst({
      where: { id: parsed.data.orderId, farmerId: req.user!.id },
      select: {
        id: true,
        cropName: true,
        quantity: true,
        unit: true,
        status: true,
      },
    });
    if (!order) {
      error(res, "Order not found", 404);
      return;
    }
    if (order.status !== OrderStatus.PENDING) {
      error(res, "Order is already assigned to a cluster", 400);
      return;
    }

    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
      select: { district: true, latitude: true, longitude: true },
    });

    const cluster = await prisma.cluster.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        cropName: true,
        unit: true,
        district: true,
        status: true,
        latitude: true,
        longitude: true,
      },
    });
    if (
      !cluster ||
      (cluster.status !== ClusterStatus.FORMING &&
        cluster.status !== ClusterStatus.VOTING)
    ) {
      error(res, "Cluster not available for joining", 400);
      return;
    }

    const sameCrop =
      cluster.cropName.toLowerCase() === order.cropName.toLowerCase();
    const sameUnit = cluster.unit.toLowerCase() === order.unit.toLowerCase();
    const sameDistrict =
      !farmer?.district ||
      !cluster.district ||
      farmer.district.toLowerCase() === cluster.district.toLowerCase();
    const hasGeoContext =
      isValidCoordinate(farmer?.latitude, farmer?.longitude) &&
      isValidCoordinate(cluster.latitude, cluster.longitude);
    const sameGeo = hasGeoContext
      ? isWithinRadiusKm(
          {
            latitude: farmer?.latitude as number,
            longitude: farmer?.longitude as number,
          },
          {
            latitude: cluster.latitude as number,
            longitude: cluster.longitude as number,
          },
          FARMER_CLUSTER_RADIUS_KM,
        )
      : null;
    if (
      !sameCrop ||
      !sameUnit ||
      !((sameGeo ?? false) || (!hasGeoContext && sameDistrict))
    ) {
      error(res, "Cluster does not match this order", 400);
      return;
    }

    const assignedCluster = await assignOrderToCluster({
      clusterId: req.params.id,
      farmerId: req.user!.id,
      orderId: order.id,
      quantity: order.quantity,
    });

    success(res, assignedCluster, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/clusters/:id", async (req, res) => {
  try {
    const cluster = await prisma.cluster.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { farmer: true, order: true } },
        bids: { include: { vendor: true, vendorVotes: true } },
        delivery: true,
      },
    });
    if (!cluster) {
      error(res, "Cluster not found", 404);
      return;
    }
    success(res, cluster);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const voteSchema = z.object({
  vendorBidId: z.string(),
});

router.post("/clusters/:id/vote", async (req, res) => {
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const cluster = await prisma.cluster.findUnique({
      where: { id: req.params.id },
    });
    if (!cluster || cluster.status !== ClusterStatus.VOTING) {
      error(res, "Voting is not active for this cluster", 400);
      return;
    }

    // Check existing vote
    const existingVote = await prisma.vendorVote.findUnique({
      where: {
        clusterId_farmerId: {
          clusterId: req.params.id,
          farmerId: req.user!.id,
        },
      },
    });
    if (existingVote) {
      error(res, "You have already voted", 400);
      return;
    }

    // Verify the bid belongs to this cluster
    const bid = await prisma.vendorBid.findFirst({
      where: { id: parsed.data.vendorBidId, clusterId: req.params.id },
    });
    if (!bid) {
      error(res, "Bid not found for this cluster", 404);
      return;
    }

    const vote = await prisma.vendorVote.create({
      data: {
        clusterId: req.params.id,
        farmerId: req.user!.id,
        vendorBidId: parsed.data.vendorBidId,
      },
    });

    // Increment bid votes
    await prisma.vendorBid.update({
      where: { id: parsed.data.vendorBidId },
      data: { votes: { increment: 1 } },
    });

    // Transition cluster to PAYMENT only once ALL members have voted
    const members = await prisma.clusterMember.findMany({
      where: { clusterId: req.params.id },
      select: { farmerId: true, orderId: true },
    });
    const totalVotes = await prisma.vendorVote.count({
      where: { clusterId: req.params.id },
    });
    const uniqueFarmerCount = new Set(members.map((m) => m.farmerId)).size;

    if (totalVotes >= uniqueFarmerCount) {
      // All members voted — find the winning bid (most votes)
      const winningBid = await prisma.vendorBid.findFirst({
        where: { clusterId: req.params.id },
        orderBy: { votes: "desc" },
      });

      if (winningBid) {
        await prisma.cluster.update({
          where: { id: req.params.id },
          data: {
            status: ClusterStatus.PAYMENT,
            vendorId: winningBid.vendorId,
            gigId: winningBid.gigId,
          },
        });
        // Update all member orders to PAYMENT_PENDING
        await prisma.order.updateMany({
          where: { id: { in: members.map((m) => m.orderId) } },
          data: { status: OrderStatus.PAYMENT_PENDING },
        });
      }
    }

    success(res, vote, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Payments ─────────────────────────────────────────────────────────────────

const initiatePaymentSchema = z.object({
  clusterId: z.string(),
});

router.post("/payments/initiate", async (req, res) => {
  const parsed = initiatePaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const members = await prisma.clusterMember.findMany({
      where: {
        clusterId: parsed.data.clusterId,
        farmerId: req.user!.id,
      },
    });
    if (members.length === 0) {
      error(res, "You are not a member of this cluster", 400);
      return;
    }
    if (members.every((m) => m.hasPaid)) {
      error(res, "Payment already completed for this cluster", 400);
      return;
    }

    const cluster = await prisma.cluster.findUnique({
      where: { id: parsed.data.clusterId },
      include: {
        bids: { orderBy: { votes: "desc" }, take: 1 },
      },
    });
    if (!cluster) {
      error(res, "Cluster not found", 404);
      return;
    }
    if (cluster.status !== ClusterStatus.PAYMENT) {
      error(res, "Cluster is not ready for payment", 400);
      return;
    }

    const pricePerUnit = cluster.bids[0]?.pricePerUnit ?? 0;
    const totalQuantity = members.reduce((sum, m) => sum + m.quantity, 0);
    const amount = totalQuantity * pricePerUnit;
    const upiRef = `UPI_MOCK_${Date.now()}`;
    const existingPending = await prisma.payment.findFirst({
      where: {
        clusterId: parsed.data.clusterId,
        farmerId: req.user!.id,
        status: PaymentStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingPending) {
      await prisma.payment.update({
        where: { id: existingPending.id },
        data: { amount, upiRef },
      });
    } else {
      await prisma.payment.create({
        data: {
          clusterId: parsed.data.clusterId,
          farmerId: req.user!.id,
          amount,
          upiRef,
          status: PaymentStatus.PENDING,
        },
      });
    }

    success(res, { upiRef, amount, clusterId: parsed.data.clusterId });
  } catch {
    error(res, "Internal server error", 500);
  }
});

const confirmPaymentSchema = z.object({
  clusterId: z.string(),
  upiRef: z.string(),
});

router.post("/payments/confirm", async (req, res) => {
  const parsed = confirmPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  if (!parsed.data.upiRef.startsWith("UPI_MOCK_")) {
    error(res, "Invalid UPI reference", 400);
    return;
  }
  try {
    const payment = await prisma.payment.updateMany({
      where: {
        clusterId: parsed.data.clusterId,
        farmerId: req.user!.id,
        upiRef: parsed.data.upiRef,
      },
      data: { status: PaymentStatus.SUCCESS },
    });
    if (payment.count === 0) {
      error(res, "Payment not found", 404);
      return;
    }

    // Mark member as paid
    await prisma.clusterMember.updateMany({
      where: {
        clusterId: parsed.data.clusterId,
        farmerId: req.user!.id,
      },
      data: { hasPaid: true, paidAt: new Date() },
    });

    // Update all this farmer's orders in the cluster to PAID.
    const members = await prisma.clusterMember.findMany({
      where: { clusterId: parsed.data.clusterId, farmerId: req.user!.id },
      select: { orderId: true },
    });
    if (members.length > 0) {
      await prisma.order.updateMany({
        where: { id: { in: members.map((m) => m.orderId) } },
        data: { status: OrderStatus.PAID },
      });
    }

    // Check if all members paid → transition cluster
    await checkAndTransitionPayment(parsed.data.clusterId);

    success(res, { confirmed: true, payment });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/payments", async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { farmerId: req.user!.id },
      include: { cluster: true },
      orderBy: { createdAt: "desc" },
    });
    success(res, payments);
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Delivery ─────────────────────────────────────────────────────────────────

router.get("/delivery/:clusterId", async (req, res) => {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { clusterId: req.params.clusterId },
      include: { cluster: true },
    });
    if (!delivery) {
      error(res, "Delivery not found", 404);
      return;
    }
    success(res, delivery);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post("/delivery/:clusterId/confirm", async (req, res) => {
  try {
    const cluster = await prisma.cluster.findUnique({
      where: { id: req.params.clusterId },
      select: { status: true },
    });
    if (!cluster) {
      error(res, "Cluster not found", 404);
      return;
    }
    if (
      cluster.status !== ClusterStatus.DISPATCHED &&
      cluster.status !== ClusterStatus.OUT_FOR_DELIVERY &&
      cluster.status !== ClusterStatus.COMPLETED
    ) {
      error(
        res,
        "Delivery can only be confirmed after the order is dispatched",
        400,
      );
      return;
    }

    const memberRows = await prisma.clusterMember.findMany({
      where: { clusterId: req.params.clusterId },
      include: {
        order: {
          select: { id: true, status: true },
        },
      },
    });

    const myMembers = memberRows.filter((m) => m.farmerId === req.user!.id);
    if (myMembers.length === 0) {
      error(res, "You are not a member of this cluster", 403);
      return;
    }

    // Mark only current farmer's orders as delivered.
    await prisma.order.updateMany({
      where: {
        id: { in: myMembers.map((m) => m.orderId) },
        status: {
          notIn: [
            OrderStatus.DELIVERED,
            OrderStatus.REJECTED,
            OrderStatus.FAILED,
          ],
        },
      },
      data: { status: OrderStatus.DELIVERED },
    });

    const updatedMembers = await prisma.clusterMember.findMany({
      where: { clusterId: req.params.clusterId },
      include: {
        order: {
          select: { status: true },
        },
      },
    });

    const farmerDelivery = new Map<
      string,
      { totalOrders: number; deliveredOrders: number }
    >();
    for (const member of updatedMembers) {
      const existing = farmerDelivery.get(member.farmerId) ?? {
        totalOrders: 0,
        deliveredOrders: 0,
      };
      existing.totalOrders += 1;
      if (member.order?.status === OrderStatus.DELIVERED) {
        existing.deliveredOrders += 1;
      }
      farmerDelivery.set(member.farmerId, existing);
    }

    const totalFarmers = farmerDelivery.size;
    const deliveredFarmers = Array.from(farmerDelivery.values()).filter(
      (f) => f.totalOrders > 0 && f.deliveredOrders === f.totalOrders,
    ).length;
    const allFarmersDelivered =
      totalFarmers > 0 && deliveredFarmers === totalFarmers;

    const nowIso = new Date().toISOString();

    if (allFarmersDelivered) {
      await prisma.cluster.update({
        where: { id: req.params.clusterId },
        data: { status: ClusterStatus.COMPLETED },
      });

      await prisma.delivery.upsert({
        where: { clusterId: req.params.clusterId },
        create: {
          clusterId: req.params.clusterId,
          confirmedAt: new Date(),
          trackingSteps: [
            {
              step: "Order Received",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Processing",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Dispatched",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Delivered",
              status: "completed",
              timestamp: nowIso,
            },
          ],
        },
        update: {
          confirmedAt: new Date(),
          trackingSteps: [
            {
              step: "Order Received",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Processing",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Dispatched",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Delivered",
              status: "completed",
              timestamp: nowIso,
            },
          ],
        },
      });
    } else {
      if (cluster.status === ClusterStatus.COMPLETED) {
        await prisma.cluster.update({
          where: { id: req.params.clusterId },
          data: { status: ClusterStatus.DISPATCHED },
        });
      }

      await prisma.delivery.upsert({
        where: { clusterId: req.params.clusterId },
        create: {
          clusterId: req.params.clusterId,
          confirmedAt: null,
          trackingSteps: [
            {
              step: "Order Received",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Processing",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Dispatched",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Delivered",
              status: deliveredFarmers > 0 ? "in_progress" : "pending",
              timestamp: deliveredFarmers > 0 ? nowIso : null,
            },
          ],
        },
        update: {
          confirmedAt: null,
          trackingSteps: [
            {
              step: "Order Received",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Processing",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Dispatched",
              status: "completed",
              timestamp: nowIso,
            },
            {
              step: "Delivered",
              status: deliveredFarmers > 0 ? "in_progress" : "pending",
              timestamp: deliveredFarmers > 0 ? nowIso : null,
            },
          ],
        },
      });
    }

    const updatedDelivery = await prisma.delivery.findUnique({
      where: { clusterId: req.params.clusterId },
    });
    success(res, {
      delivery: updatedDelivery,
      allFarmersDelivered,
      deliveredFarmers,
      totalFarmers,
    });
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Ratings ──────────────────────────────────────────────────────────────────

const ratingSchema = z.object({
  vendorId: z.string(),
  clusterId: z.string(),
  score: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
  comment: z.string().nullable().optional(),
});

router.post("/ratings", async (req, res) => {
  const parsed = ratingSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    // Verify farmer was part of this cluster
    const member = await prisma.clusterMember.findFirst({
      where: { clusterId: parsed.data.clusterId, farmerId: req.user!.id },
    });
    if (!member) {
      error(res, "You are not a member of this cluster", 403);
      return;
    }

    // Prevent duplicate ratings
    const existing = await prisma.rating.findFirst({
      where: { clusterId: parsed.data.clusterId, farmerId: req.user!.id },
    });
    if (existing) {
      error(res, "You have already rated this delivery", 400);
      return;
    }

    const rating = await prisma.rating.create({
      data: {
        farmerId: req.user!.id,
        vendorId: parsed.data.vendorId,
        clusterId: parsed.data.clusterId,
        score: parsed.data.score,
        tags: parsed.data.tags ?? [],
        comment: parsed.data.comment,
      },
    });
    success(res, rating, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Mandi Prices ────────────────────────────────────────────────────────────
// Returns mock mandi commodity prices for the farmer's district
// In production this would integrate with Agmarknet / eNAM APIs

router.get("/mandi-prices", async (req, res) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
    });

    // Mock data — replace with real Agmarknet API call in production
    const district = farmer?.district ?? "Delhi";
    const mockPrices = [
      {
        commodity: "Tomato",
        variety: "Local",
        district,
        market: `${district} Mandi`,
        minPrice: 400,
        maxPrice: 900,
        modalPrice: 840,
        unit: "quintal",
        date: new Date().toISOString().split("T")[0],
        changePercent: 12.5,
      },
      {
        commodity: "Onion",
        variety: "Local",
        district,
        market: `${district} Mandi`,
        minPrice: 280,
        maxPrice: 380,
        modalPrice: 320,
        unit: "quintal",
        date: new Date().toISOString().split("T")[0],
        changePercent: -8.2,
      },
      {
        commodity: "Wheat",
        variety: "Local",
        district,
        market: `${district} Mandi`,
        minPrice: 1900,
        maxPrice: 2200,
        modalPrice: 2060,
        unit: "quintal",
        date: new Date().toISOString().split("T")[0],
        changePercent: 3.1,
      },
      {
        commodity: "Rice",
        variety: "Common",
        district,
        market: `${district} Mandi`,
        minPrice: 1600,
        maxPrice: 2000,
        modalPrice: 1780,
        unit: "quintal",
        date: new Date().toISOString().split("T")[0],
        changePercent: 0.0,
      },
      {
        commodity: "Urea",
        variety: "Standard",
        district,
        market: `${district} Agri Store`,
        minPrice: 240,
        maxPrice: 290,
        modalPrice: 266,
        unit: "bag",
        date: new Date().toISOString().split("T")[0],
        changePercent: 0.0,
      },
    ];

    success(res, { district, prices: mockPrices });
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Dashboard Summary ─────────────────────────────────────────────────────────
// Returns a compact summary for the home screen

router.get("/dashboard", async (req, res) => {
  try {
    const farmerId = req.user!.id;

    const [orders, clusters, payments] = await Promise.all([
      prisma.order.findMany({
        where: { farmerId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          clusterMember: {
            include: {
              cluster: {
                include: { vendor: true, bids: true },
              },
            },
          },
        },
      }),
      prisma.cluster.findMany({
        where: {
          members: { some: { farmerId } },
          status: { notIn: ["COMPLETED", "FAILED"] },
        },
        include: {
          members: true,
          bids: { include: { vendor: true } },
          vendor: true,
        },
        distinct: ["id"],
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      prisma.payment.findMany({
        where: { farmerId, status: "SUCCESS" },
      }),
    ]);

    const totalSaved = payments.reduce((sum, p) => sum + p.amount * 0.15, 0); // 15% avg saving
    const deliveredOrders = orders.filter(
      (o) => o.status === "DELIVERED",
    ).length;

    success(res, {
      orders,
      clusters,
      stats: {
        totalSaved: Math.round(totalSaved),
        ordersPlaced: orders.length,
        delivered: deliveredOrders,
        co2Saved: orders.length * 12,
      },
    });
  } catch {
    error(res, "Internal server error", 500);
  }
});

export default router;
