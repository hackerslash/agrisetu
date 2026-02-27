import { prisma } from "../lib/prisma.js";
import { ClusterStatus, GigStatus, OrderStatus } from "@prisma/client";

const DEFAULT_TARGET_QUANTITY = 1000;

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
    if (existing) continue;

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
  unit = unit.toLowerCase().trim();

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

export async function autoAssignCluster(
  farmerId: string,
  orderId: string,
  cropName: string,
  quantity: number,
  unit: string,
  district?: string,
  state?: string,
) {
  // Normalize unit to lowercase so "Kg" and "kg" are treated the same
  unit = unit.toLowerCase().trim();

  // Look for an existing FORMING cluster with the same crop in same district
  const existing = await prisma.cluster.findFirst({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: ClusterStatus.FORMING,
      ...(district ? { district } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  let cluster = existing;

  if (!cluster) {
    // Find matching published gig to use its minQuantity as targetQuantity
    const matchingGig = await prisma.gig.findFirst({
      where: {
        cropName: { equals: cropName, mode: "insensitive" },
        unit: { equals: unit, mode: "insensitive" },
        status: GigStatus.PUBLISHED,
      },
      orderBy: { minQuantity: "asc" },
    });

    const targetQuantity = matchingGig?.minQuantity ?? DEFAULT_TARGET_QUANTITY;

    cluster = await prisma.cluster.create({
      data: {
        cropName,
        unit,
        targetQuantity,
        currentQuantity: 0,
        status: ClusterStatus.FORMING,
        district: district ?? null,
        state: state ?? null,
        gigId: matchingGig?.id ?? null,
      },
    });
  } else if (cluster.targetQuantity >= DEFAULT_TARGET_QUANTITY) {
    // Cluster was created before a matching gig existed — check again now
    const matchingGig = await prisma.gig.findFirst({
      where: {
        cropName: { equals: cropName, mode: "insensitive" },
        unit: { equals: unit, mode: "insensitive" },
        status: GigStatus.PUBLISHED,
      },
      orderBy: { minQuantity: "asc" },
    });
    if (matchingGig && matchingGig.minQuantity < cluster.targetQuantity) {
      cluster = await prisma.cluster.update({
        where: { id: cluster.id },
        data: {
          targetQuantity: matchingGig.minQuantity,
          gigId: cluster.gigId ?? matchingGig.id,
        },
      });
    }
  }

  // Add farmer to cluster
  await prisma.clusterMember.create({
    data: {
      clusterId: cluster.id,
      farmerId,
      orderId,
      quantity,
    },
  });

  // Update currentQuantity
  const updated = await prisma.cluster.update({
    where: { id: cluster.id },
    data: { currentQuantity: { increment: quantity } },
  });

  // Update order status to CLUSTERED
  await prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.CLUSTERED },
  });

  // Check if we should transition to VOTING
  if (
    updated.status === ClusterStatus.FORMING &&
    updated.currentQuantity >= updated.targetQuantity
  ) {
    await prisma.cluster.update({
      where: { id: cluster.id },
      data: { status: ClusterStatus.VOTING },
    });
    await autoCreateBidsForVotingCluster(
      cluster.id,
      updated.cropName,
      updated.unit,
      updated.currentQuantity,
    );
  }

  return updated;
}

export async function checkAndTransitionPayment(clusterId: string) {
  const members = await prisma.clusterMember.findMany({
    where: { clusterId },
  });

  const allPaid = members.length > 0 && members.every((m) => m.hasPaid);

  if (allPaid) {
    await prisma.cluster.update({
      where: { id: clusterId },
      data: { status: ClusterStatus.DISPATCHED },
    });

    // Update all member orders to DISPATCHED
    await prisma.order.updateMany({
      where: { id: { in: members.map((m) => m.orderId) } },
      data: { status: OrderStatus.DISPATCHED },
    });

    // Create a delivery record
    await prisma.delivery.upsert({
      where: { clusterId },
      create: {
        clusterId,
        trackingSteps: [
          {
            step: "Order Placed",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Payment Collected",
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          {
            step: "Preparing Dispatch",
            status: "in_progress",
            timestamp: new Date().toISOString(),
          },
          {
            step: "In Transit",
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
      update: {},
    });
  }
}
