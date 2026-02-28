import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireVendor } from "../middleware/auth.js";
import { success, error } from "../lib/response.js";
import { syncClustersForPublishedGig } from "../services/cluster.js";
import {
  GigStatus,
  ClusterStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";

const router = Router();
router.use(authenticate, requireVendor);

// ─── Profile ──────────────────────────────────────────────────────────────────

router.get("/profile", async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        businessName: true,
        contactName: true,
        phone: true,
        gstin: true,
        pan: true,
        state: true,
        businessType: true,
        isVerified: true,
        createdAt: true,
        documents: true,
      },
    });
    if (!vendor) {
      error(res, "Vendor not found", 404);
      return;
    }
    success(res, vendor);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const updateProfileSchema = z.object({
  businessName: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  state: z.string().optional(),
  businessType: z.string().optional(),
});

router.patch("/profile", async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const vendor = await prisma.vendor.update({
      where: { id: req.user!.id },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        businessName: true,
        contactName: true,
        phone: true,
        state: true,
        businessType: true,
        isVerified: true,
      },
    });
    success(res, vendor);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

router.patch("/profile/password", async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const bcrypt = await import("bcryptjs");
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.user!.id },
    });
    if (!vendor) {
      error(res, "Vendor not found", 404);
      return;
    }
    const valid = await bcrypt.compare(
      parsed.data.currentPassword,
      vendor.password,
    );
    if (!valid) {
      error(res, "Current password is incorrect", 400);
      return;
    }
    const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.vendor.update({
      where: { id: req.user!.id },
      data: { password: hashed },
    });
    success(res, { message: "Password updated successfully" });
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Gigs ─────────────────────────────────────────────────────────────────────

router.get("/gigs", async (req, res) => {
  const { status } = req.query;
  try {
    const gigs = await prisma.gig.findMany({
      where: {
        vendorId: req.user!.id,
        ...(status ? { status: status as GigStatus } : {}),
      },
      include: {
        _count: { select: { bids: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    success(res, gigs);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const createGigSchema = z.object({
  cropName: z.string().min(1),
  variety: z.string().optional(),
  unit: z
    .string()
    .min(1)
    .transform((v) => v.toLowerCase().trim()),
  minQuantity: z.number().positive(),
  pricePerUnit: z.number().positive(),
  availableQuantity: z.number().positive(),
  description: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

router.post("/gigs", async (req, res) => {
  const parsed = createGigSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const gig = await prisma.gig.create({
      data: { ...parsed.data, vendorId: req.user!.id },
    });
    // If published immediately, sync matching FORMING clusters
    if (gig.status === GigStatus.PUBLISHED) {
      await syncClustersForPublishedGig(
        gig.cropName,
        gig.unit,
        gig.minQuantity,
      );
    }
    success(res, gig, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const updateGigSchema = z.object({
  cropName: z.string().optional(),
  variety: z.string().optional(),
  unit: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase().trim()),
  minQuantity: z.number().positive().optional(),
  pricePerUnit: z.number().positive().optional(),
  availableQuantity: z.number().positive().optional(),
  description: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
});

router.patch("/gigs/:id", async (req, res) => {
  const parsed = updateGigSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    // Fetch gig before update to detect PUBLISHED transition
    const before = await prisma.gig.findFirst({
      where: { id: req.params.id, vendorId: req.user!.id },
    });
    if (!before) {
      error(res, "Gig not found", 404);
      return;
    }

    const result = await prisma.gig.updateMany({
      where: { id: req.params.id, vendorId: req.user!.id },
      data: parsed.data,
    });
    if (result.count === 0) {
      error(res, "Gig not found", 404);
      return;
    }
    const updated = await prisma.gig.findUnique({
      where: { id: req.params.id },
    });

    // If gig just became PUBLISHED, sync matching FORMING clusters
    if (
      updated &&
      before.status !== GigStatus.PUBLISHED &&
      updated.status === GigStatus.PUBLISHED
    ) {
      await syncClustersForPublishedGig(
        updated.cropName,
        updated.unit,
        updated.minQuantity,
      );
    }

    success(res, updated);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.delete("/gigs/:id", async (req, res) => {
  try {
    const result = await prisma.gig.updateMany({
      where: { id: req.params.id, vendorId: req.user!.id },
      data: { status: GigStatus.CLOSED },
    });
    if (result.count === 0) {
      error(res, "Gig not found", 404);
      return;
    }
    success(res, { deleted: true });
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Cluster Bids ─────────────────────────────────────────────────────────────

router.get("/clusters", async (req, res) => {
  try {
    const vendorGigs = await prisma.gig.findMany({
      where: { vendorId: req.user!.id, status: GigStatus.PUBLISHED },
      select: { cropName: true, unit: true },
    });

    // Build case-insensitive crop+unit filter
    const gigFilters = vendorGigs.map((g) => ({
      cropName: { equals: g.cropName, mode: "insensitive" as const },
      unit: {
        equals: g.unit.toLowerCase().trim(),
        mode: "insensitive" as const,
      },
    }));

    const clusters = await prisma.cluster.findMany({
      where: {
        status: { in: [ClusterStatus.FORMING, ClusterStatus.VOTING] },
        ...(gigFilters.length > 0 ? { OR: gigFilters } : {}),
      },
      include: {
        members: true,
        bids: { where: { vendorId: req.user!.id } },
      },
      orderBy: { createdAt: "desc" },
    });
    success(res, clusters);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const bidSchema = z.object({
  gigId: z.string().optional(),
  pricePerUnit: z.number().positive(),
  note: z.string().optional(),
});

router.post("/clusters/:id/bid", async (req, res) => {
  const parsed = bidSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const cluster = await prisma.cluster.findUnique({
      where: { id: req.params.id },
    });
    if (!cluster) {
      error(res, "Cluster not found", 404);
      return;
    }

    // Only accept bids on FORMING or VOTING clusters
    if (
      cluster.status !== ClusterStatus.FORMING &&
      cluster.status !== ClusterStatus.VOTING
    ) {
      error(res, "Cluster is not accepting bids", 400);
      return;
    }

    // Prevent duplicate bid from same vendor on same cluster
    const existingBid = await prisma.vendorBid.findFirst({
      where: { clusterId: req.params.id, vendorId: req.user!.id },
    });
    if (existingBid) {
      error(res, "You have already placed a bid on this cluster", 400);
      return;
    }

    const totalPrice = parsed.data.pricePerUnit * cluster.currentQuantity;
    const bid = await prisma.vendorBid.create({
      data: {
        clusterId: req.params.id,
        vendorId: req.user!.id,
        gigId: parsed.data.gigId ?? null,
        pricePerUnit: parsed.data.pricePerUnit,
        totalPrice,
        note: parsed.data.note ?? null,
      },
    });

    success(res, bid, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/bids", async (req, res) => {
  try {
    const bids = await prisma.vendorBid.findMany({
      where: { vendorId: req.user!.id },
      include: { cluster: true, gig: true },
      orderBy: { createdAt: "desc" },
    });
    success(res, bids);
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Vendor Orders ────────────────────────────────────────────────────────────

router.get("/orders", async (req, res) => {
  const { status } = req.query;
  try {
    const clusters = await prisma.cluster.findMany({
      where: {
        vendorId: req.user!.id,
        status: {
          notIn: [ClusterStatus.FORMING, ClusterStatus.VOTING],
        },
      },
      include: {
        members: {
          include: {
            farmer: true,
            order: true,
          },
        },
        delivery: true,
        payments: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    success(res, clusters);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const cluster = await prisma.cluster.findFirst({
      where: { id: req.params.id, vendorId: req.user!.id },
      include: {
        members: {
          include: { farmer: true, order: true },
        },
        bids: true,
        delivery: true,
        payments: true,
        ratings: { include: { farmer: true } },
      },
    });
    if (!cluster) {
      error(res, "Order not found", 404);
      return;
    }
    success(res, cluster);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.patch("/orders/:id/accept", async (req, res) => {
  try {
    const cluster = await prisma.cluster.updateMany({
      where: { id: req.params.id, vendorId: req.user!.id },
      data: { status: ClusterStatus.PAYMENT },
    });
    if (cluster.count === 0) {
      error(res, "Order not found", 404);
      return;
    }
    
    // Initialize delivery tracking with Order Received status
    await prisma.delivery.upsert({
      where: { clusterId: req.params.id },
      update: {
        trackingSteps: [
          {
            step: "Order Received",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Processing",
            status: "pending",
            timestamp: null,
          },
          {
            step: "Dispatched",
            status: "pending",
            timestamp: null,
          },
          {
            step: "Delivered",
            status: "pending",
            timestamp: null,
          },
        ],
      },
      create: {
        clusterId: req.params.id,
        trackingSteps: [
          {
            step: "Order Received",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Processing",
            status: "pending",
            timestamp: null,
          },
          {
            step: "Dispatched",
            status: "pending",
            timestamp: null,
          },
          {
            step: "Delivered",
            status: "pending",
            timestamp: null,
          },
        ],
      },
    });
    
    success(res, { accepted: true });
  } catch {
    error(res, "Internal server error", 500);
  }
});

const rejectSchema = z.object({
  reason: z.string().min(1),
  note: z.string().optional(),
});

router.post("/orders/:id/reject", async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  try {
    const cluster = await prisma.cluster.findFirst({
      where: { id: req.params.id, vendorId: req.user!.id },
      include: {
        members: true,
        payments: true,
      },
    });
    if (!cluster) {
      error(res, "Order not found", 404);
      return;
    }

    await prisma.cluster.update({
      where: { id: req.params.id },
      data: { status: ClusterStatus.FAILED },
    });

    // Update all member orders to REJECTED
    await prisma.order.updateMany({
      where: { id: { in: cluster.members.map((m) => m.orderId) } },
      data: { status: OrderStatus.REJECTED },
    });

    // Refund all payments
    if (cluster.payments.length > 0) {
      await prisma.payment.updateMany({
        where: {
          clusterId: req.params.id,
          status: PaymentStatus.SUCCESS,
        },
        data: { status: PaymentStatus.REFUNDED },
      });
    }

    success(res, { rejected: true, reason: parsed.data.reason });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.patch("/orders/:id/process", async (req, res) => {
  try {
    const cluster = await prisma.cluster.findFirst({
      where: { id: req.params.id, vendorId: req.user!.id },
      include: { members: true },
    });
    if (!cluster) {
      error(res, "Order not found", 404);
      return;
    }
    if (cluster.status !== ClusterStatus.PAYMENT) {
      error(res, "Order must be in PAYMENT status to mark as processing", 400);
      return;
    }

    await prisma.cluster.update({
      where: { id: req.params.id },
      data: { status: ClusterStatus.PROCESSING },
    });

    await prisma.delivery.updateMany({
      where: { clusterId: req.params.id },
      data: {
        trackingSteps: [
          {
            step: "Order Received",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Processing",
            status: "in_progress",
            timestamp: new Date().toISOString(),
          },
          { step: "Dispatched", status: "pending", timestamp: null },
          { step: "Delivered", status: "pending", timestamp: null },
        ],
      },
    });

    await prisma.order.updateMany({
      where: { id: { in: cluster.members.map((m) => m.orderId) } },
      data: { status: OrderStatus.PROCESSING },
    });

    success(res, { processing: true });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.patch("/orders/:id/out-for-delivery", async (req, res) => {
  try {
    const cluster = await prisma.cluster.findFirst({
      where: { id: req.params.id, vendorId: req.user!.id },
      include: { members: true },
    });
    if (!cluster) {
      error(res, "Order not found", 404);
      return;
    }
    if (cluster.status !== ClusterStatus.PROCESSING) {
      error(
        res,
        "Order must be in PROCESSING status to mark as out for delivery",
        400,
      );
      return;
    }

    await prisma.cluster.update({
      where: { id: req.params.id },
      data: { status: ClusterStatus.OUT_FOR_DELIVERY },
    });

    await prisma.delivery.updateMany({
      where: { clusterId: req.params.id },
      data: {
        trackingSteps: [
          {
            step: "Order Received",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Processing",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Out for Delivery",
            status: "in_progress",
            timestamp: new Date().toISOString(),
          },
          { step: "Delivered", status: "pending", timestamp: null },
        ],
      },
    });

    await prisma.order.updateMany({
      where: { id: { in: cluster.members.map((m) => m.orderId) } },
      data: { status: OrderStatus.OUT_FOR_DELIVERY },
    });

    success(res, { outForDelivery: true });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.patch("/orders/:id/dispatch", async (req, res) => {
  try {
    const cluster = await prisma.cluster.findFirst({
      where: { id: req.params.id, vendorId: req.user!.id },
    });
    if (!cluster) {
      error(res, "Order not found", 404);
      return;
    }
    if (cluster.status !== ClusterStatus.PROCESSING) {
      error(
        res,
        "Order must be in PROCESSING status to mark as delivered",
        400,
      );
      return;
    }

    await prisma.cluster.updateMany({
      where: { id: req.params.id, vendorId: req.user!.id },
      data: { status: ClusterStatus.DISPATCHED },
    });

    // Update delivery tracking to match UI expectations
    await prisma.delivery.updateMany({
      where: { clusterId: req.params.id },
      data: {
        trackingSteps: [
          {
            step: "Order Received",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Processing",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Dispatched",
            status: "in_progress",
            timestamp: new Date().toISOString(),
          },
          { step: "Delivered", status: "pending", timestamp: null },
        ],
      },
    });

    const members = await prisma.clusterMember.findMany({
      where: { clusterId: req.params.id },
    });
    await prisma.order.updateMany({
      where: { id: { in: members.map((m) => m.orderId) } },
      data: { status: OrderStatus.DISPATCHED },
    });

    success(res, { dispatched: true });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.patch("/orders/:id/deliver", async (req, res) => {
  try {
    await prisma.cluster.updateMany({
      where: { id: req.params.id, vendorId: req.user!.id },
      data: { status: ClusterStatus.COMPLETED },
    });

    await prisma.delivery.updateMany({
      where: { clusterId: req.params.id },
      data: {
        confirmedAt: new Date(),
        trackingSteps: [
          {
            step: "Order Received",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Processing",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Dispatched",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Delivered",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });

    const members = await prisma.clusterMember.findMany({
      where: { clusterId: req.params.id },
    });
    await prisma.order.updateMany({
      where: { id: { in: members.map((m) => m.orderId) } },
      data: { status: OrderStatus.DELIVERED },
    });

    success(res, { delivered: true });
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Vendor Payments ──────────────────────────────────────────────────────────

router.get("/payments", async (req, res) => {
  try {
    const clusters = await prisma.cluster.findMany({
      where: { vendorId: req.user!.id },
      include: {
        payments: true,
        members: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const paymentData = clusters.map((cluster) => {
      const totalAmount = cluster.payments
        .filter((p) => p.status === PaymentStatus.SUCCESS)
        .reduce((sum, p) => sum + p.amount, 0);
      const isEscrow = cluster.status !== ClusterStatus.COMPLETED;
      const isReleased = cluster.status === ClusterStatus.COMPLETED;

      return {
        clusterId: cluster.id,
        cropName: cluster.cropName,
        totalAmount,
        status: isReleased ? "released" : isEscrow ? "escrow" : "pending",
        clusterStatus: cluster.status,
        memberCount: cluster.members.length,
        payments: cluster.payments,
      };
    });

    success(res, paymentData);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/payments/summary", async (req, res) => {
  try {
    const clusters = await prisma.cluster.findMany({
      where: { vendorId: req.user!.id },
      include: { payments: true },
    });

    let totalReceived = 0;
    let inEscrow = 0;
    let pendingRelease = 0;

    for (const cluster of clusters) {
      const paidAmount = cluster.payments
        .filter((p) => p.status === PaymentStatus.SUCCESS)
        .reduce((sum, p) => sum + p.amount, 0);

      if (cluster.status === ClusterStatus.COMPLETED) {
        totalReceived += paidAmount;
      } else if (cluster.status === ClusterStatus.DISPATCHED) {
        pendingRelease += paidAmount;
        inEscrow += paidAmount;
      } else {
        inEscrow += paidAmount;
      }
    }

    success(res, { totalReceived, inEscrow, pendingRelease });
  } catch {
    error(res, "Internal server error", 500);
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

router.get("/analytics", async (req, res) => {
  const { period = "30d" } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const clusters = await prisma.cluster.findMany({
      where: {
        vendorId: req.user!.id,
        createdAt: { gte: since },
      },
      include: {
        payments: true,
        members: true,
        bids: { where: { vendorId: req.user!.id } },
        ratings: true,
      },
    });

    const allBids = await prisma.vendorBid.findMany({
      where: { vendorId: req.user!.id, createdAt: { gte: since } },
    });
    const wonBids = clusters.length;
    const bidWinRate =
      allBids.length > 0 ? Math.round((wonBids / allBids.length) * 100) : 0;

    const totalRevenue = clusters
      .filter((c) => c.status === ClusterStatus.COMPLETED)
      .flatMap((c) => c.payments)
      .filter((p) => p.status === PaymentStatus.SUCCESS)
      .reduce((sum, p) => sum + p.amount, 0);

    const ordersFulfilled = clusters.filter(
      (c) => c.status === ClusterStatus.COMPLETED,
    ).length;

    const allRatings = clusters.flatMap((c) => c.ratings);
    const avgRating =
      allRatings.length > 0
        ? allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length
        : 0;

    // Revenue by day
    const revenueByDay: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0] as string;
      revenueByDay[key] = 0;
    }

    clusters
      .filter((c) => c.status === ClusterStatus.COMPLETED)
      .forEach((cluster) => {
        const key = cluster.updatedAt.toISOString().split("T")[0] as string;
        if (Object.prototype.hasOwnProperty.call(revenueByDay, key)) {
          const amount = cluster.payments
            .filter((p) => p.status === PaymentStatus.SUCCESS)
            .reduce((sum, p) => sum + p.amount, 0);
          revenueByDay[key] = (revenueByDay[key] ?? 0) + amount;
        }
      });

    const revenueChart = Object.entries(revenueByDay).map(([date, amount]) => ({
      date,
      amount,
    }));

    // Top products
    const productMap: Record<string, { revenue: number; orders: number }> = {};
    clusters.forEach((c) => {
      const revenue = c.payments
        .filter((p) => p.status === PaymentStatus.SUCCESS)
        .reduce((sum, p) => sum + p.amount, 0);
      if (!productMap[c.cropName]) {
        productMap[c.cropName] = { revenue: 0, orders: 0 };
      }
      productMap[c.cropName]!.revenue += revenue;
      productMap[c.cropName]!.orders += 1;
    });

    const topProducts = Object.entries(productMap)
      .map(([crop, data]) => ({ crop, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    success(res, {
      totalRevenue,
      ordersFulfilled,
      bidWinRate,
      avgRating: Math.round(avgRating * 10) / 10,
      revenueChart,
      topProducts,
      ratingsCount: allRatings.length,
    });
  } catch {
    error(res, "Internal server error", 500);
  }
});

export default router;
