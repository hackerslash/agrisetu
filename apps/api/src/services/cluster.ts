import { prisma } from "../lib/prisma.js";
import {
  ClusterStatus,
  GigStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";
import {
  getCoordinateCentroid,
  isValidCoordinate,
  isWithinRadiusKm,
} from "../lib/geo.js";

const DEFAULT_TARGET_QUANTITY = 1000;
const DEFAULT_FARMER_CLUSTER_RADIUS_KM = 50;
const DEFAULT_CLUSTER_PAYMENT_WINDOW_HOURS = 24;
const parsedPaymentWindowHours = Number(process.env.CLUSTER_PAYMENT_WINDOW_HOURS);
const CLUSTER_PAYMENT_WINDOW_HOURS =
  Number.isFinite(parsedPaymentWindowHours) && parsedPaymentWindowHours > 0
    ? parsedPaymentWindowHours
    : DEFAULT_CLUSTER_PAYMENT_WINDOW_HOURS;
const CLUSTER_PAYMENT_WINDOW_MS =
  CLUSTER_PAYMENT_WINDOW_HOURS * 60 * 60 * 1000;

function normalizeUnit(unit: string) {
  return unit.toLowerCase().trim();
}

export function buildClusterPaymentDeadline(start = new Date()) {
  return new Date(start.getTime() + CLUSTER_PAYMENT_WINDOW_MS);
}

export function isClusterServiceableForVendor(params: {
  vendorLatitude?: number | null;
  vendorLongitude?: number | null;
  serviceRadiusKm?: number | null;
  clusterLatitude?: number | null;
  clusterLongitude?: number | null;
}) {
  const {
    vendorLatitude,
    vendorLongitude,
    serviceRadiusKm,
    clusterLatitude,
    clusterLongitude,
  } = params;

  // Backward-compatible behavior for historical clusters without coordinates.
  if (!isValidCoordinate(clusterLatitude, clusterLongitude)) {
    return true;
  }

  if (!isValidCoordinate(vendorLatitude, vendorLongitude)) {
    return false;
  }

  const radiusKm =
    typeof serviceRadiusKm === "number" && serviceRadiusKm > 0
      ? serviceRadiusKm
      : 0;

  if (radiusKm <= 0) {
    return false;
  }

  const from = {
    latitude: vendorLatitude as number,
    longitude: vendorLongitude as number,
  };
  const to = {
    latitude: clusterLatitude as number,
    longitude: clusterLongitude as number,
  };

  return isWithinRadiusKm(from, to, radiusKm);
}

async function findBestMatchingGig(
  cropName: string,
  unit: string,
  clusterLatitude?: number,
  clusterLongitude?: number,
) {
  const gigs = await prisma.gig.findMany({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: GigStatus.PUBLISHED,
    },
    include: {
      vendor: {
        select: {
          latitude: true,
          longitude: true,
          serviceRadiusKm: true,
        },
      },
    },
    orderBy: [{ minQuantity: "asc" }, { createdAt: "asc" }],
  });

  if (!isValidCoordinate(clusterLatitude, clusterLongitude)) {
    return gigs[0] ?? null;
  }

  return (
    gigs.find((gig) =>
      isClusterServiceableForVendor({
        vendorLatitude: gig.vendor.latitude,
        vendorLongitude: gig.vendor.longitude,
        serviceRadiusKm: gig.vendor.serviceRadiusKm,
        clusterLatitude,
        clusterLongitude,
      }),
    ) ?? null
  );
}

async function buildClusterLocationPatch(params: {
  clusterId: string;
  current: {
    district: string | null;
    state: string | null;
    locationAddress: string | null;
  };
}) {
  const members = await prisma.clusterMember.findMany({
    where: { clusterId: params.clusterId },
    include: {
      farmer: {
        select: {
          latitude: true,
          longitude: true,
          district: true,
          state: true,
          locationAddress: true,
        },
      },
    },
  });

  const coordinatePoints = members
    .filter((member) =>
      isValidCoordinate(member.farmer.latitude, member.farmer.longitude),
    )
    .map((member) => ({
      latitude: member.farmer.latitude as number,
      longitude: member.farmer.longitude as number,
    }));

  const centroid = getCoordinateCentroid(coordinatePoints);
  const firstWithAddress = members.find(
    (member) => member.farmer.locationAddress,
  );
  const firstWithDistrict = members.find((member) => member.farmer.district);
  const firstWithState = members.find((member) => member.farmer.state);

  return {
    ...(centroid
      ? { latitude: centroid.latitude, longitude: centroid.longitude }
      : {}),
    ...(!params.current.locationAddress && firstWithAddress
      ? { locationAddress: firstWithAddress.farmer.locationAddress }
      : {}),
    ...(!params.current.district && firstWithDistrict
      ? { district: firstWithDistrict.farmer.district }
      : {}),
    ...(!params.current.state && firstWithState
      ? { state: firstWithState.farmer.state }
      : {}),
  };
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
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    select: { latitude: true, longitude: true },
  });

  const matchingGigs = await prisma.gig.findMany({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: GigStatus.PUBLISHED,
    },
    include: {
      vendor: {
        select: {
          latitude: true,
          longitude: true,
          serviceRadiusKm: true,
        },
      },
    },
  });

  for (const gig of matchingGigs) {
    if (
      !isClusterServiceableForVendor({
        vendorLatitude: gig.vendor.latitude,
        vendorLongitude: gig.vendor.longitude,
        serviceRadiusKm: gig.vendor.serviceRadiusKm,
        clusterLatitude: cluster?.latitude,
        clusterLongitude: cluster?.longitude,
      })
    ) {
      continue;
    }

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
  latitude?: number,
  longitude?: number,
) {
  const normalizedUnit = normalizeUnit(unit);
  const clusters = await prisma.cluster.findMany({
    where: {
      cropName: { equals: cropName, mode: "insensitive" },
      unit: { equals: normalizedUnit, mode: "insensitive" },
      status: { in: [ClusterStatus.FORMING, ClusterStatus.VOTING] },
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

  if (isValidCoordinate(latitude, longitude)) {
    const farmerPoint = {
      latitude: latitude as number,
      longitude: longitude as number,
    };
    return clusters.filter((cluster) => {
      if (isValidCoordinate(cluster.latitude, cluster.longitude)) {
        return isWithinRadiusKm(
          farmerPoint,
          {
            latitude: cluster.latitude as number,
            longitude: cluster.longitude as number,
          },
          DEFAULT_FARMER_CLUSTER_RADIUS_KM,
        );
      }

      return Boolean(
        district &&
        cluster.district &&
        cluster.district.toLowerCase() === district.toLowerCase(),
      );
    });
  }

  if (district) {
    return clusters.filter(
      (cluster) =>
        cluster.district &&
        cluster.district.toLowerCase() === district.toLowerCase(),
    );
  }

  return clusters;
}

async function createClusterForOrder(
  cropName: string,
  unit: string,
  district?: string,
  state?: string,
  locationAddress?: string,
  latitude?: number,
  longitude?: number,
) {
  const normalizedUnit = normalizeUnit(unit);
  const matchingGig = await findBestMatchingGig(
    cropName,
    normalizedUnit,
    latitude,
    longitude,
  );
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
      locationAddress: locationAddress ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
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

  const locationPatch = await buildClusterLocationPatch({
    clusterId,
    current: {
      district: cluster.district,
      state: cluster.state,
      locationAddress: cluster.locationAddress,
    },
  });

  const updated = await prisma.cluster.update({
    where: { id: clusterId },
    data: {
      currentQuantity: { increment: quantity },
      ...locationPatch,
    },
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
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
}) {
  const cluster = await createClusterForOrder(
    params.cropName,
    params.unit,
    params.district,
    params.state,
    params.locationAddress,
    params.latitude,
    params.longitude,
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
  locationAddress?: string,
  latitude?: number,
  longitude?: number,
) {
  const normalizedUnit = normalizeUnit(unit);
  const joinable = await findJoinableClusters(
    cropName,
    normalizedUnit,
    district,
    latitude,
    longitude,
  );
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
    locationAddress,
    latitude,
    longitude,
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

export async function ensureClusterPaymentDeadline(clusterId: string) {
  const expectedDeadline = buildClusterPaymentDeadline();
  await prisma.cluster.updateMany({
    where: {
      id: clusterId,
      status: ClusterStatus.PAYMENT,
      paymentDeadlineAt: null,
    },
    data: {
      paymentDeadlineAt: expectedDeadline,
    },
  });

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    select: { status: true, paymentDeadlineAt: true },
  });

  if (!cluster || cluster.status !== ClusterStatus.PAYMENT) {
    return null;
  }

  return cluster.paymentDeadlineAt;
}

export async function expireClusterIfPaymentWindowElapsed(
  clusterId: string,
  now = new Date(),
) {
  const deadline = await ensureClusterPaymentDeadline(clusterId);
  if (!deadline || deadline.getTime() > now.getTime()) {
    return false;
  }

  const timedOutCluster = await prisma.cluster.findFirst({
    where: {
      id: clusterId,
      status: ClusterStatus.PAYMENT,
      paymentDeadlineAt: { lte: now },
    },
    select: {
      id: true,
      members: {
        select: {
          orderId: true,
        },
      },
    },
  });

  if (!timedOutCluster) {
    return false;
  }

  await prisma.$transaction(async (tx) => {
    const statusUpdate = await tx.cluster.updateMany({
      where: {
        id: clusterId,
        status: ClusterStatus.PAYMENT,
        paymentDeadlineAt: { lte: now },
      },
      data: {
        status: ClusterStatus.FAILED,
      },
    });

    if (statusUpdate.count === 0) {
      return;
    }

    const orderIds = timedOutCluster.members.map((member) => member.orderId);
    if (orderIds.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: OrderStatus.FAILED },
      });
    }

    await tx.payment.updateMany({
      where: {
        clusterId,
        status: PaymentStatus.SUCCESS,
      },
      data: {
        status: PaymentStatus.REFUNDED,
      },
    });

    await tx.payment.updateMany({
      where: {
        clusterId,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.FAILED,
      },
    });
  });

  return true;
}

export async function reconcileClusterPaymentTimeouts(clusterIds: string[]) {
  if (clusterIds.length === 0) return;
  const uniqueClusterIds = Array.from(new Set(clusterIds));
  await Promise.all(
    uniqueClusterIds.map((clusterId) =>
      expireClusterIfPaymentWindowElapsed(clusterId),
    ),
  );
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
