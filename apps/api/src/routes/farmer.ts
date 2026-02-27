import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireFarmer } from "../middleware/auth.js";
import { success, error } from "../lib/response.js";
import {
  autoAssignCluster,
  checkAndTransitionPayment,
} from "../services/cluster.js";
import { ClusterStatus, OrderStatus, PaymentStatus } from "@prisma/client";

const router = Router();
router.use(authenticate, requireFarmer);

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
  } catch {
    error(res, "Internal server error", 500);
  }
});

const updateProfileSchema = z.object({
  name: z.string().optional(),
  village: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
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

// ─── Orders ───────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  cropName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1).transform((v) => v.toLowerCase().trim()),
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
    });
    if (!farmer) {
      error(res, "Farmer profile not found", 404);
      return;
    }

    const order = await prisma.order.create({
      data: {
        farmerId: req.user!.id,
        cropName: parsed.data.cropName,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        deliveryDate: parsed.data.deliveryDate
          ? new Date(parsed.data.deliveryDate)
          : null,
      },
    });

    // Auto-assign to cluster
    await autoAssignCluster(
      req.user!.id,
      order.id,
      parsed.data.cropName,
      parsed.data.quantity,
      parsed.data.unit,
      farmer.district ?? undefined,
      farmer.state ?? undefined,
    );

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { clusterMember: { include: { cluster: true } } },
    });

    success(res, updatedOrder, 201);
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
    const cluster = await prisma.cluster.findUnique({
      where: { id: req.params.id },
    });
    if (!cluster || cluster.status !== ClusterStatus.FORMING) {
      error(res, "Cluster not available for joining", 400);
      return;
    }
    const member = await prisma.clusterMember.create({
      data: {
        clusterId: req.params.id,
        farmerId: req.user!.id,
        orderId: parsed.data.orderId,
        quantity: parsed.data.quantity,
      },
    });
    await prisma.cluster.update({
      where: { id: req.params.id },
      data: { currentQuantity: { increment: parsed.data.quantity } },
    });
    success(res, member, 201);
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
    });
    const totalVotes = await prisma.vendorVote.count({
      where: { clusterId: req.params.id },
    });

    if (totalVotes >= members.length) {
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
    const member = await prisma.clusterMember.findFirst({
      where: {
        clusterId: parsed.data.clusterId,
        farmerId: req.user!.id,
      },
    });
    if (!member) {
      error(res, "You are not a member of this cluster", 400);
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

    const pricePerUnit = cluster.bids[0]?.pricePerUnit ?? 0;
    const amount = member.quantity * pricePerUnit;
    const upiRef = `UPI_MOCK_${Date.now()}`;

    await prisma.payment.create({
      data: {
        clusterId: parsed.data.clusterId,
        farmerId: req.user!.id,
        amount,
        upiRef,
        status: PaymentStatus.PENDING,
      },
    });

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

    // Mark member as paid
    await prisma.clusterMember.updateMany({
      where: {
        clusterId: parsed.data.clusterId,
        farmerId: req.user!.id,
      },
      data: { hasPaid: true, paidAt: new Date() },
    });

    // Update order status
    const member = await prisma.clusterMember.findFirst({
      where: { clusterId: parsed.data.clusterId, farmerId: req.user!.id },
    });
    if (member) {
      await prisma.order.update({
        where: { id: member.orderId },
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
    const delivery = await prisma.delivery.update({
      where: { clusterId: req.params.clusterId },
      data: { confirmedAt: new Date() },
    });

    await prisma.cluster.update({
      where: { id: req.params.clusterId },
      data: { status: ClusterStatus.COMPLETED },
    });

    // Update all member orders to DELIVERED
    const members = await prisma.clusterMember.findMany({
      where: { clusterId: req.params.clusterId },
    });
    await prisma.order.updateMany({
      where: { id: { in: members.map((m) => m.orderId) } },
      data: { status: OrderStatus.DELIVERED },
    });

    success(res, delivery);
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
