import { vendorSafeSelect, farmerSafeSelect } from "../lib/selects.js";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireFarmer } from "../middleware/auth.js";
import { success, error } from "../lib/response.js";
import {
  assignOrderToCluster,
  autoAssignClusterByRequirement,
  buildClusterPaymentDeadline,
  cancelOrderFromCluster,
  checkAndTransitionPayment,
  createNewClusterAndAssignOrder,
  ensureClusterPaymentDeadline,
  expireClusterIfPaymentWindowElapsed,
  findJoinableClusters,
  reconcileClusterPaymentTimeouts,
  sweepStaleClusters,
} from "../services/cluster.js";
import { resolveRequirement } from "../services/requirement-resolution.js";
import {
  ClusterStatus,
  GigStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";
import { isValidCoordinate, isWithinRadiusKm } from "../lib/geo.js";
import { transcribeAudioBufferStreaming } from "../services/transcribe-streaming.js";
import { transcribeAudioBuffer } from "../services/transcribe.js";
import {
  deleteFarmerAvatarIfManaged,
  uploadFarmerAvatar,
  withFarmerAvatarForClient,
} from "../services/farmer-avatar.js";
import {
  clearAllFarmerPendingOrderDrafts,
} from "../services/conversation-memory.js";
import { processVoiceOrderForFarmer } from "../services/voice-order-processing.js";
import {
  sendPaymentConfirmedNotification,
  sendPaymentPendingNotification,
} from "../services/farmer-notification-events.js";

const router = Router();
router.use(authenticate, requireFarmer);
const FARMER_CLUSTER_RADIUS_KM = 50;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

async function reconcileCurrentFarmerPaymentClusters(farmerId: string) {
  const paymentClusters = await prisma.cluster.findMany({
    where: {
      members: { some: { farmerId } },
      status: ClusterStatus.PAYMENT,
    },
    select: { id: true },
  });

  if (paymentClusters.length === 0) return;
  await reconcileClusterPaymentTimeouts(paymentClusters.map((c) => c.id));
}


type ClusterBidForRanking = {
  id: string;
  vendorId: string;
  pricePerUnit: number;
  votes: number;
  createdAt: Date;
  vendor?: { isVerified: boolean | null } | null;
};

type ClusterRatingForRanking = {
  vendorId: string;
  score: number;
};

function clamp0to100(value: number) {
  return Math.max(0, Math.min(100, value));
}

function median(numbers: number[]) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function bayesianRatingScore(ratings: ClusterRatingForRanking[]) {
  if (ratings.length === 0) return 60;
  const priorMean = 3.5;
  const priorWeight = 5;
  const avg = ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length;
  const bayes =
    (avg * ratings.length + priorMean * priorWeight) /
    (ratings.length + priorWeight);
  return clamp0to100((bayes / 5) * 100);
}

function recentActivityScore(createdAt: Date, now: Date) {
  const ageDays = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 1) return 100;
  if (ageDays <= 7) return 85;
  if (ageDays <= 30) return 70;
  if (ageDays <= 90) return 55;
  return 40;
}

function sortLevel(score: number) {
  if (score >= 80) return 4; // L1
  if (score >= 65) return 3; // L2
  if (score >= 50) return 2; // L3
  return 1; // L4
}

function buildFallbackRequirementKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function scoreAndSortClusterBids<T extends ClusterBidForRanking>(
  bids: T[],
  ratings: ClusterRatingForRanking[],
) {
  if (bids.length === 0) return [];

  const now = new Date();
  const medianPrice = median(bids.map((bid) => bid.pricePerUnit));
  const totalVotes = bids.reduce((sum, bid) => sum + bid.votes, 0);

  const ranked = bids.map((bid) => {
    // SLA/cancellation metrics are not tracked per bid yet, so use neutral defaults.
    const reliability =
      totalVotes >= 10 ? clamp0to100((bid.votes / totalVotes) * 100) : 60;
    const rating = bayesianRatingScore(
      ratings.filter((entry) => entry.vendorId === bid.vendorId),
    );
    const priceFit =
      medianPrice > 0
        ? clamp0to100(50 + ((medianPrice - bid.pricePerUnit) / medianPrice) * 100)
        : 60;
    const responseSla = 50;
    const recentActivity = recentActivityScore(bid.createdAt, now);
    const penalties = 0;

    const score =
      0.4 * reliability +
      0.25 * rating +
      0.2 * priceFit +
      0.1 * responseSla +
      0.05 * recentActivity -
      penalties;

    return {
      bid,
      score: clamp0to100(score),
      level: sortLevel(score),
    };
  });

  ranked.sort((a, b) => {
    if (a.level !== b.level) return b.level - a.level;
    if (a.score !== b.score) return b.score - a.score;

    const aVerified = a.bid.vendor?.isVerified ? 1 : 0;
    const bVerified = b.bid.vendor?.isVerified ? 1 : 0;
    if (aVerified !== bVerified) return bVerified - aVerified;
    if (a.bid.votes !== b.bid.votes) return b.bid.votes - a.bid.votes;
    return b.bid.createdAt.getTime() - a.bid.createdAt.getTime();
  });

  return ranked;
}

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
    success(res, await withFarmerAvatarForClient(farmer));
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
    success(res, await withFarmerAvatarForClient(farmer));
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post(
  "/profile/avatar",
  avatarUpload.single("avatar"),
  async (req, res) => {
    const avatar = req.file;
    if (!avatar) {
      error(res, "Avatar file is required", 422);
      return;
    }

    const mimeType = avatar.mimetype?.toLowerCase();
    if (
      mimeType !== "image/jpeg" &&
      mimeType !== "image/jpg" &&
      mimeType !== "image/png" &&
      mimeType !== "image/webp"
    ) {
      error(res, "Only JPG, PNG, and WEBP avatars are supported", 422);
      return;
    }

    try {
      const existing = await prisma.farmer.findUnique({
        where: { id: req.user!.id },
        select: { avatarUrl: true },
      });
      if (!existing) {
        error(res, "Farmer profile not found", 404);
        return;
      }

      const uploaded = await uploadFarmerAvatar({
        farmerId: req.user!.id,
        avatarBuffer: avatar.buffer,
        fileName: avatar.originalname,
        mimeType: avatar.mimetype,
      });

      const farmer = await prisma.farmer.update({
        where: { id: req.user!.id },
        data: { avatarUrl: uploaded.avatarUrl },
      });

      if (existing.avatarUrl && existing.avatarUrl !== uploaded.avatarUrl) {
        await deleteFarmerAvatarIfManaged(existing.avatarUrl).catch(() => null);
      }

      success(res, await withFarmerAvatarForClient(farmer));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Unable to upload profile avatar";
      error(res, message, 500);
    }
  },
);

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
    const languageCode = parsed.data.languageCode;
    if (audioFile) {
      let transcribed;
      try {
        transcribed = await transcribeAudioBufferStreaming({
          audioBuffer: audioFile.buffer,
          fileName: audioFile.originalname,
          mimeType: audioFile.mimetype,
          languageCode: languageCode ?? undefined,
        });
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("Unsupported audio format")
        ) {
          // Fallback for older client uploads (e.g., webm/aac multipart path).
          transcribed = await transcribeAudioBuffer({
            audioBuffer: audioFile.buffer,
            fileName: audioFile.originalname,
            mimeType: audioFile.mimetype,
            languageCode: languageCode ?? undefined,
          });
        } else {
          throw err;
        }
      }
      transcript = transcribed.transcript;
      detectedLanguageCode = transcribed.detectedLanguageCode;
    }

    const result = await processVoiceOrderForFarmer({
      farmerId: req.user!.id,
      transcript,
      transcribedFromAudio: Boolean(audioFile),
      languageCode: languageCode ?? null,
      detectedLanguageCode,
    });

    success(res, result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Unable to process voice order";
    error(res, message, 500);
  }
});

// ─── Orders ───────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  product: z.string().min(1),
  quantity: z.number().positive(),
  unit: z
    .string()
    .min(1)
    .transform((v) => v.toLowerCase().trim()),
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
        locationAddress: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!farmer) {
      error(res, "Farmer profile not found", 404);
      return;
    }

    // Resolve requirement via AI
    const resolved = await resolveRequirement({
      rawInput: `${parsed.data.product} ${parsed.data.quantity} ${parsed.data.unit}`,
      farmerId: req.user!.id,
    });

    const requirementProduct =
      resolved.requirementProduct || parsed.data.product.trim();
    const requirementKey =
      resolved.requirementKey || buildFallbackRequirementKey(requirementProduct);
    const resolvedUnit = parsed.data.unit;

    const order = await prisma.order.create({
      data: {
        farmerId: req.user!.id,
        product: requirementProduct,
        quantity: parsed.data.quantity,
        unit: resolvedUnit,
        requirement: {
          rawProduct: resolved.rawProduct,
          product: requirementProduct,
          quantity: parsed.data.quantity,
          unit: resolvedUnit,
        },
        requirementKey: requirementKey || null,
        deliveryDate: parsed.data.deliveryDate
          ? new Date(parsed.data.deliveryDate)
          : null,
      },
    });

    // Once an order is successfully created, the pending voice-order draft is stale.
    clearAllFarmerPendingOrderDrafts(req.user!.id);

    let assignedCluster = null;
    try {
      if (requirementKey) {
        assignedCluster = await autoAssignClusterByRequirement({
          farmerId: req.user!.id,
          orderId: order.id,
          requirementKey,
          requirementProduct,
          quantity: parsed.data.quantity,
          unit: resolvedUnit,
          district: farmer.district ?? undefined,
          state: farmer.state ?? undefined,
          locationAddress: farmer.locationAddress ?? undefined,
          latitude: farmer.latitude ?? undefined,
          longitude: farmer.longitude ?? undefined,
        });
      } else {
        // Fallback: use product-based assignment
        assignedCluster = await autoAssignClusterByRequirement({
          farmerId: req.user!.id,
          orderId: order.id,
          requirementKey: buildFallbackRequirementKey(requirementProduct),
          requirementProduct,
          quantity: parsed.data.quantity,
          unit: resolvedUnit,
          district: farmer.district ?? undefined,
          state: farmer.state ?? undefined,
          locationAddress: farmer.locationAddress ?? undefined,
          latitude: farmer.latitude ?? undefined,
          longitude: farmer.longitude ?? undefined,
        });
      }
    } catch {
      // Non-fatal: order is created, cluster assignment failed
    }

    success(res, { ...order, cluster: assignedCluster }, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/orders", async (req, res) => {
  try {
    await reconcileCurrentFarmerPaymentClusters(req.user!.id);
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

router.get("/orders/:id/cluster-options", async (_req, res) => {
  res.status(410).json({ success: false, error: "This endpoint has been removed. Cluster assignment is now automatic." });
});

router.post("/orders/:id/assign-cluster", async (_req, res) => {
  res.status(410).json({ success: false, error: "This endpoint has been removed. Cluster assignment is now automatic." });
});

router.get("/orders/:id", async (req, res) => {
  try {
    await reconcileCurrentFarmerPaymentClusters(req.user!.id);
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, farmerId: req.user!.id },
      include: {
        clusterMember: {
          include: {
            cluster: {
              include: {
                bids: {
                  include: {
                    vendor: { select: vendorSafeSelect },
                    vendorVotes: { where: { farmerId: req.user!.id } },
                  },
                  orderBy: { votes: "desc" },
                },
                vendor: { select: vendorSafeSelect },
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

router.post("/orders/:id/cancel", async (req, res) => {
  try {
    const result = await cancelOrderFromCluster({
      orderId: req.params.id,
      farmerId: req.user!.id,
    });
    success(res, { order: result.order, cluster: result.cluster });
  } catch (e) {
    if (e instanceof Error) {
      const knownErrors = [
        "Order not found",
        "Order cannot be cancelled in its current status",
        "Cluster is too far along to cancel from",
        "Cluster not found",
      ];
      if (knownErrors.includes(e.message)) {
        error(res, e.message, 400);
        return;
      }
    }
    error(res, "Internal server error", 500);
  }
});

// ─── Clusters ─────────────────────────────────────────────────────────────────

router.get("/clusters", async (req, res) => {
  const rawProductQuery = req.query.product;
  const product =
    typeof rawProductQuery === "string" ? rawProductQuery.trim() : "";
  try {
    // Opportunistic stale cluster sweep
    sweepStaleClusters().catch(() => null);

    const fetchClusters = () =>
      prisma.cluster.findMany({
        where: {
          members: { some: { farmerId: req.user!.id } },
          status: { notIn: [ClusterStatus.COMPLETED, ClusterStatus.FAILED] },
          ...(product
            ? { product: { contains: product, mode: "insensitive" } }
            : {}),
        },
        include: {
          members: true,
          bids: { include: { vendor: { select: vendorSafeSelect } } },
        },
        distinct: ["id"],
        orderBy: { createdAt: "desc" },
      });

    let clusters = await fetchClusters();
    const paymentClusterIds = clusters
      .filter((cluster) => cluster.status === ClusterStatus.PAYMENT)
      .map((cluster) => cluster.id);

    if (paymentClusterIds.length > 0) {
      await reconcileClusterPaymentTimeouts(paymentClusterIds);
      clusters = await fetchClusters();
    }

    // Attach myVote (current revision) for each cluster
    const farmerId = req.user!.id;
    const clustersWithVote = await Promise.all(
      clusters.map(async (cluster) => {
        const myVote = await prisma.vendorVote.findFirst({
          where: {
            clusterId: cluster.id,
            farmerId,
            revision: cluster.votingRevision,
          },
          select: { vendorBidId: true, revision: true },
        });
        return { ...cluster, myVote: myVote ?? null };
      }),
    );

    success(res, clustersWithVote);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post("/clusters/:id/join", async (_req, res) => {
  res.status(410).json({ success: false, error: "This endpoint has been removed. Cluster assignment is now automatic." });
});

router.get("/clusters/:id", async (req, res) => {
  try {
    // Opportunistic stale cluster sweep
    sweepStaleClusters().catch(() => null);
    await expireClusterIfPaymentWindowElapsed(req.params.id);
    const cluster = await prisma.cluster.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { farmer: { select: farmerSafeSelect }, order: true } },
        bids: { include: { vendor: { select: vendorSafeSelect }, vendorVotes: true } },
        delivery: true,
        vendor: { select: vendorSafeSelect },
        ratings: true,
      },
    });
    if (!cluster) {
      error(res, "Cluster not found", 404);
      return;
    }
    const rankedBids = scoreAndSortClusterBids(cluster.bids, cluster.ratings);

    // Attach farmer's current-revision vote
    const myVote = await prisma.vendorVote.findFirst({
      where: {
        clusterId: cluster.id,
        farmerId: req.user!.id,
        revision: cluster.votingRevision,
      },
      select: { vendorBidId: true, revision: true },
    });

    success(res, {
      ...cluster,
      bids: rankedBids.map((entry) => entry.bid),
      myVote: myVote ?? null,
    });
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

    // Verify the bid belongs to this cluster
    const bid = await prisma.vendorBid.findFirst({
      where: { id: parsed.data.vendorBidId, clusterId: req.params.id },
    });
    if (!bid) {
      error(res, "Bid not found for this cluster", 404);
      return;
    }

    // Check for existing vote from any revision
    const existingVote = await prisma.vendorVote.findUnique({
      where: {
        clusterId_farmerId: {
          clusterId: req.params.id,
          farmerId: req.user!.id,
        },
      },
    });

    let vote;
    if (existingVote) {
      // Revote: remove old vote and decrement old bid votes
      if (existingVote.vendorBidId !== parsed.data.vendorBidId || existingVote.revision !== cluster.votingRevision) {
        await prisma.vendorBid.update({
          where: { id: existingVote.vendorBidId },
          data: { votes: { decrement: 1 } },
        });
        await prisma.vendorVote.delete({ where: { id: existingVote.id } });

        vote = await prisma.vendorVote.create({
          data: {
            clusterId: req.params.id,
            farmerId: req.user!.id,
            vendorBidId: parsed.data.vendorBidId,
            revision: cluster.votingRevision,
          },
        });

        await prisma.vendorBid.update({
          where: { id: parsed.data.vendorBidId },
          data: { votes: { increment: 1 } },
        });
      } else {
        // Same vote, same revision — no-op
        vote = existingVote;
      }
    } else {
      vote = await prisma.vendorVote.create({
        data: {
          clusterId: req.params.id,
          farmerId: req.user!.id,
          vendorBidId: parsed.data.vendorBidId,
          revision: cluster.votingRevision,
        },
      });

      // Increment bid votes
      await prisma.vendorBid.update({
        where: { id: parsed.data.vendorBidId },
        data: { votes: { increment: 1 } },
      });
    }

    // Transition cluster to PAYMENT only once ALL members have voted for current revision
    const members = await prisma.clusterMember.findMany({
      where: { clusterId: req.params.id },
      select: { farmerId: true, orderId: true },
    });
    // Count only current-revision votes
    const currentRevisionVotes = await prisma.vendorVote.count({
      where: { clusterId: req.params.id, revision: cluster.votingRevision },
    });
    const uniqueFarmerCount = new Set(members.map((m) => m.farmerId)).size;

    if (currentRevisionVotes >= uniqueFarmerCount && uniqueFarmerCount > 0) {
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
            paymentDeadlineAt: buildClusterPaymentDeadline(),
          },
        });
        // Update all member orders to PAYMENT_PENDING
        await prisma.order.updateMany({
          where: { id: { in: members.map((m) => m.orderId) } },
          data: { status: OrderStatus.PAYMENT_PENDING },
        });
        await sendPaymentPendingNotification(req.params.id);
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

    await expireClusterIfPaymentWindowElapsed(parsed.data.clusterId);

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
    if (cluster.status === ClusterStatus.FAILED) {
      error(res, "Payment window expired for this cluster", 400);
      return;
    }
    if (cluster.status !== ClusterStatus.PAYMENT) {
      error(res, "Cluster is not ready for payment", 400);
      return;
    }

    const paymentDeadlineAt = await ensureClusterPaymentDeadline(cluster.id);
    if (!paymentDeadlineAt) {
      error(res, "Cluster payment window is unavailable", 400);
      return;
    }

    if (paymentDeadlineAt.getTime() <= Date.now()) {
      await expireClusterIfPaymentWindowElapsed(parsed.data.clusterId);
      error(res, "Payment window expired for this cluster", 400);
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

    success(res, {
      upiRef,
      amount,
      clusterId: parsed.data.clusterId,
      paymentDeadlineAt: paymentDeadlineAt.toISOString(),
    });
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
    await expireClusterIfPaymentWindowElapsed(parsed.data.clusterId);

    const cluster = await prisma.cluster.findUnique({
      where: { id: parsed.data.clusterId },
      select: { status: true },
    });
    if (!cluster) {
      error(res, "Cluster not found", 404);
      return;
    }
    if (cluster.status === ClusterStatus.FAILED) {
      error(res, "Payment window expired for this cluster", 400);
      return;
    }
    if (cluster.status !== ClusterStatus.PAYMENT) {
      error(res, "Cluster is not accepting payments", 400);
      return;
    }

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
    await sendPaymentConfirmedNotification({
      clusterId: parsed.data.clusterId,
      farmerId: req.user!.id,
    });

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
      select: { district: true },
    });

    const district = farmer?.district ?? "Delhi";
    const today = new Date().toISOString().split("T")[0];

    // Price variation: ±8% random around modal
    const vary = (base: number) =>
      Math.round(base * (1 + (Math.random() - 0.5) * 0.16));

    // Change percent: random realistic swing
    const change = (magnitude: number) =>
      parseFloat(((Math.random() - 0.5) * magnitude).toFixed(1));

    type CommodityDef = {
      commodity: string;
      variety: string;
      modal: number;
      spread: number; // min/max ± spread from modal
      unit: string;
      baseChange: number; // typical % swing magnitude
    };

    const COMMODITIES: CommodityDef[] = [
      // Vegetables
      { commodity: "Tomato",       variety: "Local",      modal: 1100,  spread: 400, unit: "quintal", baseChange: 18 },
      { commodity: "Onion",        variety: "Local",      modal: 2200,  spread: 600, unit: "quintal", baseChange: 12 },
      { commodity: "Potato",       variety: "Jyoti",      modal: 1200,  spread: 300, unit: "quintal", baseChange: 8  },
      { commodity: "Brinjal",      variety: "Local",      modal: 800,   spread: 300, unit: "quintal", baseChange: 14 },
      { commodity: "Cauliflower",  variety: "Local",      modal: 700,   spread: 250, unit: "quintal", baseChange: 12 },
      { commodity: "Cabbage",      variety: "Local",      modal: 500,   spread: 200, unit: "quintal", baseChange: 10 },
      { commodity: "Lady Finger",  variety: "Local",      modal: 1200,  spread: 400, unit: "quintal", baseChange: 15 },
      { commodity: "Green Chilli", variety: "Local",      modal: 2500,  spread: 800, unit: "quintal", baseChange: 20 },
      { commodity: "Bitter Gourd", variety: "Local",      modal: 1100,  spread: 350, unit: "quintal", baseChange: 12 },
      { commodity: "Bottle Gourd", variety: "Local",      modal: 600,   spread: 200, unit: "quintal", baseChange: 10 },
      { commodity: "Peas",         variety: "Green",      modal: 2000,  spread: 600, unit: "quintal", baseChange: 16 },
      { commodity: "Carrot",       variety: "Local",      modal: 900,   spread: 300, unit: "quintal", baseChange: 10 },
      { commodity: "Coriander",    variety: "Fresh",      modal: 1500,  spread: 500, unit: "quintal", baseChange: 18 },
      { commodity: "Garlic",       variety: "Local",      modal: 4500,  spread: 1200, unit: "quintal", baseChange: 14 },
      { commodity: "Ginger",       variety: "Fresh",      modal: 6000,  spread: 2000, unit: "quintal", baseChange: 16 },
      // Grains & Cereals
      { commodity: "Wheat",        variety: "Lok-1",      modal: 2150,  spread: 150, unit: "quintal", baseChange: 3  },
      { commodity: "Paddy",        variety: "Common",     modal: 2300,  spread: 200, unit: "quintal", baseChange: 4  },
      { commodity: "Maize",        variety: "Yellow",     modal: 2000,  spread: 200, unit: "quintal", baseChange: 5  },
      { commodity: "Jowar",        variety: "Local",      modal: 3300,  spread: 300, unit: "quintal", baseChange: 5  },
      { commodity: "Bajra",        variety: "Local",      modal: 2700,  spread: 250, unit: "quintal", baseChange: 4  },
      { commodity: "Ragi",         variety: "Local",      modal: 3850,  spread: 300, unit: "quintal", baseChange: 4  },
      // Pulses
      { commodity: "Tur Dal",      variety: "Local",      modal: 7500,  spread: 800, unit: "quintal", baseChange: 8  },
      { commodity: "Moong Dal",    variety: "Green",      modal: 8500,  spread: 900, unit: "quintal", baseChange: 7  },
      { commodity: "Urad Dal",     variety: "Black",      modal: 7800,  spread: 1000, unit: "quintal", baseChange: 8 },
      { commodity: "Chana",        variety: "Desi",       modal: 5500,  spread: 600, unit: "quintal", baseChange: 6  },
      { commodity: "Masoor",       variety: "Local",      modal: 5200,  spread: 500, unit: "quintal", baseChange: 5  },
      // Oilseeds
      { commodity: "Groundnut",    variety: "Bold",       modal: 5800,  spread: 600, unit: "quintal", baseChange: 6  },
      { commodity: "Mustard",      variety: "Yellow",     modal: 5100,  spread: 500, unit: "quintal", baseChange: 5  },
      { commodity: "Soybean",      variety: "Yellow",     modal: 4300,  spread: 400, unit: "quintal", baseChange: 5  },
      { commodity: "Sunflower",    variety: "Local",      modal: 5600,  spread: 500, unit: "quintal", baseChange: 5  },
      // Fruits
      { commodity: "Banana",       variety: "Robusta",    modal: 1200,  spread: 400, unit: "quintal", baseChange: 10 },
      { commodity: "Papaya",       variety: "Local",      modal: 900,   spread: 300, unit: "quintal", baseChange: 12 },
      { commodity: "Pomegranate",  variety: "Bhagwa",     modal: 7000,  spread: 1500, unit: "quintal", baseChange: 10 },
      { commodity: "Grapes",       variety: "Thompson",   modal: 3500,  spread: 1000, unit: "quintal", baseChange: 12 },
      { commodity: "Watermelon",   variety: "Local",      modal: 600,   spread: 200, unit: "quintal", baseChange: 14 },
      { commodity: "Lemon",        variety: "Local",      modal: 4000,  spread: 1500, unit: "quintal", baseChange: 18 },
      // Spices
      { commodity: "Turmeric",     variety: "Finger",     modal: 9500,  spread: 2000, unit: "quintal", baseChange: 10 },
      { commodity: "Cumin",        variety: "Local",      modal: 22000, spread: 4000, unit: "quintal", baseChange: 12 },
      { commodity: "Coriander Seed", variety: "Eagle",   modal: 7500,  spread: 1500, unit: "quintal", baseChange: 8  },
      // Fertilisers
      { commodity: "Urea",         variety: "Standard",   modal: 266,   spread: 10,  unit: "bag",     baseChange: 0  },
      { commodity: "DAP",          variety: "Standard",   modal: 1350,  spread: 30,  unit: "bag",     baseChange: 0  },
      { commodity: "NPK",          variety: "10-26-26",   modal: 1200,  spread: 40,  unit: "bag",     baseChange: 0  },
    ];

    // Fisher-Yates shuffle with Math.random(), pick 6
    const shuffled = [...COMMODITIES];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]!; shuffled[i] = shuffled[j]!; shuffled[j] = tmp;
    }
    const picked = shuffled.slice(0, 6);

    const prices = picked.map((c) => {
      const modal = vary(c.modal);
      const changePercent = change(c.baseChange);
      return {
        commodity: c.commodity,
        variety: c.variety,
        district,
        market: `${district} Mandi`,
        minPrice: Math.round(modal - c.spread * 0.4),
        maxPrice: Math.round(modal + c.spread * 0.4),
        modalPrice: modal,
        unit: c.unit,
        date: today,
        changePercent,
      };
    });

    success(res, { district, prices });
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Dashboard Summary ─────────────────────────────────────────────────────────
// Returns a compact summary for the home screen

router.get("/dashboard", async (req, res) => {
  try {
    const farmerId = req.user!.id;
    await reconcileCurrentFarmerPaymentClusters(farmerId);

    const [orders, clusters, payments] = await Promise.all([
      prisma.order.findMany({
        where: { farmerId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          clusterMember: {
            include: {
              cluster: {
                include: { vendor: { select: vendorSafeSelect }, bids: true },
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
          bids: { include: { vendor: { select: vendorSafeSelect } } },
          vendor: { select: vendorSafeSelect },
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
