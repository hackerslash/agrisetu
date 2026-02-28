import { prisma } from "../lib/prisma.js";
import {
  ClusterStatus,
  GigStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";

const DEFAULT_TARGET_QUANTITY = 1000;

function normalizeUnit(unit: string) {
  return unit.toLowerCase().trim();
}

async function findBestMatchingGig(cropName: string, unit: string) {
  return prisma.gig.findFirst({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: GigStatus.PUBLISHED,
    },
    orderBy: { minQuantity: "asc" },
  });
}

/**
 * When a cluster transitions to VOTING, auto-create bids for every vendor
 * that has a matching PUBLISHED gig. This means farmers see vendor options
 * immediately without waiting for vendors to manually bid.
 */
async function autoCreateBidsForVotingCluster(
  clusterId: string,
  cropName: string,
  unit: string,
  currentQuantity: number,
) {
  const matchingGigs = await prisma.gig.findMany({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: GigStatus.PUBLISHED,
    },
  });

  for (const gig of matchingGigs) {
    // Skip if this vendor already has a bid on this cluster
    const existing = await prisma.vendorBid.findFirst({
      where: { clusterId, vendorId: gig.vendorId },
    });
    if (existing) {
      // Keep total in sync as quantity changes while still in voting phase
      await prisma.vendorBid.update({
        where: { id: existing.id },
        data: { totalPrice: existing.pricePerUnit * currentQuantity },
      });
      continue;
    }

    await prisma.vendorBid.create({
      data: {
        clusterId,
        vendorId: gig.vendorId,
        gigId: gig.id,
        pricePerUnit: gig.pricePerUnit,
        totalPrice: gig.pricePerUnit * currentQuantity,
      },
    });
  }
}

async function syncBidTotals(clusterId: string, currentQuantity: number) {
  const bids = await prisma.vendorBid.findMany({
    where: { clusterId },
    select: { id: true, pricePerUnit: true },
  });

  await Promise.all(
    bids.map((bid) =>
      prisma.vendorBid.update({
        where: { id: bid.id },
        data: { totalPrice: bid.pricePerUnit * currentQuantity },
      }),
    ),
  );
}

export async function findJoinableClusters(
  cropName: string,
  unit: string,
  district?: string,
) {
  const normalizedUnit = normalizeUnit(unit);

  return prisma.cluster.findMany({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: normalizedUnit, mode: "insensitive" },
      status: { in: [ClusterStatus.FORMING, ClusterStatus.VOTING] },
      ...(district ? { district } : {}),
    },
    include: {
      members: { include: { farmer: true, order: true } },
      bids: { include: { vendor: true, vendorVotes: true } },
      delivery: true,
      vendor: true,
      ratings: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function createClusterForOrder(
  cropName: string,
  unit: string,
  district?: string,
  state?: string,
) {
  const normalizedUnit = normalizeUnit(unit);
  const matchingGig = await findBestMatchingGig(cropName, normalizedUnit);
  const targetQuantity = matchingGig?.minQuantity ?? DEFAULT_TARGET_QUANTITY;

  return prisma.cluster.create({
    data: {
      cropName,
      unit: normalizedUnit,
      targetQuantity,
      currentQuantity: 0,
      status: ClusterStatus.FORMING,
      district: district ?? null,
      state: state ?? null,
      gigId: matchingGig?.id ?? null,
    },
  });
}

export async function assignOrderToCluster(params: {
  clusterId: string;
  farmerId: string;
  orderId: string;
  quantity: number;
}) {
  const { clusterId, farmerId, orderId, quantity } = params;

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
  });

  if (
    !cluster ||
    (cluster.status !== ClusterStatus.FORMING &&
      cluster.status !== ClusterStatus.VOTING)
  ) {
    throw new Error("Cluster not available for joining");
  }

  await prisma.clusterMember.create({
    data: {
      clusterId,
      farmerId,
      orderId,
      quantity,
    },
  });

  const updated = await prisma.cluster.update({
    where: { id: clusterId },
    data: { currentQuantity: { increment: quantity } },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.CLUSTERED },
  });

  if (updated.status === ClusterStatus.VOTING) {
    await autoCreateBidsForVotingCluster(
      updated.id,
      updated.cropName,
      updated.unit,
      updated.currentQuantity,
    );
    await syncBidTotals(updated.id, updated.currentQuantity);
  } else if (updated.currentQuantity >= updated.targetQuantity) {
    await prisma.cluster.update({
      where: { id: updated.id },
      data: { status: ClusterStatus.VOTING },
    });
    await autoCreateBidsForVotingCluster(
      updated.id,
      updated.cropName,
      updated.unit,
      updated.currentQuantity,
    );
  }

  return prisma.cluster.findUnique({
    where: { id: updated.id },
    include: {
      members: { include: { farmer: true, order: true } },
      bids: { include: { vendor: true, vendorVotes: true } },
      delivery: true,
      vendor: true,
      ratings: true,
    },
  });
}

export async function createNewClusterAndAssignOrder(params: {
  farmerId: string;
  orderId: string;
  cropName: string;
  quantity: number;
  unit: string;
  district?: string;
  state?: string;
}) {
  const cluster = await createClusterForOrder(
    params.cropName,
    params.unit,
    params.district,
    params.state,
  );

  return assignOrderToCluster({
    clusterId: cluster.id,
    farmerId: params.farmerId,
    orderId: params.orderId,
    quantity: params.quantity,
  });
}

/**
 * Legacy helper retained for compatibility. This prefers existing joinable
 * clusters and falls back to creating a new one.
 */
export async function autoAssignCluster(
  farmerId: string,
  orderId: string,
  cropName: string,
  quantity: number,
  unit: string,
  district?: string,
  state?: string,
) {
  const normalizedUnit = normalizeUnit(unit);
  const joinable = await findJoinableClusters(cropName, normalizedUnit, district);
  const chosen = joinable[0];

  if (chosen) {
    return assignOrderToCluster({
      clusterId: chosen.id,
      farmerId,
      orderId,
      quantity,
    });
  }

  return createNewClusterAndAssignOrder({
    farmerId,
    orderId,
    cropName,
    quantity,
    unit: normalizedUnit,
    district,
    state,
  });
}

/**
 * When a gig is published, find matching FORMING clusters that still have the
 * default (or higher) targetQuantity and lower it to the gig's minQuantity.
 * Then transition any that now meet the threshold to VOTING and auto-bid.
 * Also auto-bid on any already-VOTING clusters that match.
 */
export async function syncClustersForPublishedGig(
  cropName: string,
  unit: string,
  minQuantity: number,
) {
  unit = normalizeUnit(unit);

  // Fix FORMING clusters whose targetQuantity is too high
  const formingClusters = await prisma.cluster.findMany({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: ClusterStatus.FORMING,
      targetQuantity: { gt: minQuantity },
    },
  });

  for (const cluster of formingClusters) {
    const updated = await prisma.cluster.update({
      where: { id: cluster.id },
      data: { targetQuantity: minQuantity },
    });

    // If current quantity already meets new (lower) target → go to VOTING
    if (updated.currentQuantity >= minQuantity) {
      await prisma.cluster.update({
        where: { id: cluster.id },
        data: { status: ClusterStatus.VOTING },
      });
      await autoCreateBidsForVotingCluster(
        cluster.id,
        cluster.cropName,
        cluster.unit,
        updated.currentQuantity,
      );
    }
  }

  // Also auto-bid on already-VOTING clusters that match this gig
  const votingClusters = await prisma.cluster.findMany({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: ClusterStatus.VOTING,
    },
  });

  for (const cluster of votingClusters) {
    await autoCreateBidsForVotingCluster(
      cluster.id,
      cluster.cropName,
      cluster.unit,
      cluster.currentQuantity,
    );
  }
}

export async function checkAndTransitionPayment(clusterId: string) {
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    select: { id: true },
  });
  if (!cluster) return;

  const members = await prisma.clusterMember.findMany({
    where: { clusterId },
  });
  if (members.length === 0) return;

  const uniqueFarmerIds = Array.from(new Set(members.map((m) => m.farmerId)));
  const successfulPayments = await prisma.payment.findMany({
    where: {
      clusterId,
      farmerId: { in: uniqueFarmerIds },
      status: PaymentStatus.SUCCESS,
    },
    select: { farmerId: true },
  });
  const paidFarmerIds = new Set(successfulPayments.map((p) => p.farmerId));
  const allPaid =
    uniqueFarmerIds.length > 0 &&
    uniqueFarmerIds.every((farmerId) => paidFarmerIds.has(farmerId));

  if (allPaid) {
    // Keep member payment flags consistent for every order row.
    await prisma.clusterMember.updateMany({
      where: { clusterId, farmerId: { in: uniqueFarmerIds } },
      data: { hasPaid: true },
    });

    // Keep order/cluster in PAYMENT stage until vendor manually marks processing.

    // Create/update delivery tracking without auto-marking as delivered.
    await prisma.delivery.upsert({
      where: { clusterId },
      create: {
        clusterId,
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
    });
  }
}
