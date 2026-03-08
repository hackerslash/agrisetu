import { vendorSafeSelect, farmerSafeSelect } from "../lib/selects.js";
import { prisma } from "../lib/prisma.js";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
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
import { logger } from "../lib/logger.js";
import {
  sendClusterFailedNotification,
  sendClusterJoinedNotification,
  sendVotingStartedNotification,
} from "./farmer-notification-events.js";

const DEFAULT_TARGET_QUANTITY = 100;
const DEFAULT_FARMER_CLUSTER_RADIUS_KM = 50;
const DEFAULT_CLUSTER_PAYMENT_WINDOW_MINUTES = 30;
const CLUSTER_STALE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const parsedPaymentWindowMinutes = Number(
  process.env.CLUSTER_PAYMENT_WINDOW_MINUTES,
);
const parsedPaymentWindowHours = Number(process.env.CLUSTER_PAYMENT_WINDOW_HOURS);
const CLUSTER_PAYMENT_WINDOW_MINUTES =
  Number.isFinite(parsedPaymentWindowMinutes) && parsedPaymentWindowMinutes > 0
    ? parsedPaymentWindowMinutes
    : Number.isFinite(parsedPaymentWindowHours) && parsedPaymentWindowHours > 0
      ? parsedPaymentWindowHours * 60
      : DEFAULT_CLUSTER_PAYMENT_WINDOW_MINUTES;
const CLUSTER_PAYMENT_WINDOW_MS =
  CLUSTER_PAYMENT_WINDOW_MINUTES * 60 * 1000;

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
});

function normalizeUnit(unit: string) {
  return unit.toLowerCase().trim();
}

function normalizeVariety(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function buildStaleAt() {
  return new Date(Date.now() + CLUSTER_STALE_TTL_MS);
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
  product: string,
  unit: string,
  clusterLatitude?: number,
  clusterLongitude?: number,
  preferredVariety?: string,
) {
  const normalizedVariety = normalizeVariety(preferredVariety);
  const loadGigs = (withVariety: boolean) =>
    prisma.gig.findMany({
      where: {
        product: { equals: product, mode: "insensitive" },
        unit: { equals: unit, mode: "insensitive" },
        status: GigStatus.PUBLISHED,
        ...(withVariety && normalizedVariety
          ? { variety: { equals: normalizedVariety, mode: "insensitive" } }
          : {}),
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

  let gigs = await loadGigs(true);
  if (gigs.length === 0 && normalizedVariety) {
    gigs = await loadGigs(false);
  }

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
  product: string,
  unit: string,
  currentQuantity: number,
  options?: {
    clusterCoordinates?: { latitude: number | null; longitude: number | null } | null;
    matchingGigs?: any[];
  }
) {
  const cluster = options?.clusterCoordinates !== undefined
    ? options.clusterCoordinates
    : await prisma.cluster.findUnique({
        where: { id: clusterId },
        select: { latitude: true, longitude: true },
      });

  const matchingGigs = options?.matchingGigs !== undefined
    ? options.matchingGigs
    : await prisma.gig.findMany({
        where: {
          product: { equals: product, mode: "insensitive" },
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

  const serviceableGigs = matchingGigs.filter((gig) =>
    isClusterServiceableForVendor({
      vendorLatitude: gig.vendor.latitude,
      vendorLongitude: gig.vendor.longitude,
      serviceRadiusKm: gig.vendor.serviceRadiusKm,
      clusterLatitude: cluster?.latitude,
      clusterLongitude: cluster?.longitude,
    })
  );

  if (serviceableGigs.length === 0) return;

  const existingBids = await prisma.vendorBid.findMany({
    where: {
      clusterId,
      vendorId: { in: serviceableGigs.map((g) => g.vendorId) },
    },
  });

  const existingBidsByVendorId = new Map(
    existingBids.map((bid) => [bid.vendorId, bid])
  );

  const bidsToCreate = [];
  const bidsToUpdate = [];

  for (const gig of serviceableGigs) {
    const existing = existingBidsByVendorId.get(gig.vendorId);
    if (existing) {
      bidsToUpdate.push({
        id: existing.id,
        totalPrice: existing.pricePerUnit * currentQuantity,
      });
    } else {
      bidsToCreate.push({
        clusterId,
        vendorId: gig.vendorId,
        gigId: gig.id,
        pricePerUnit: gig.pricePerUnit,
        totalPrice: gig.pricePerUnit * currentQuantity,
      });
    }
  }

  if (bidsToCreate.length > 0) {
    await prisma.vendorBid.createMany({
      data: bidsToCreate,
    });
  }

  if (bidsToUpdate.length > 0) {
    await Promise.all(
      bidsToUpdate.map((bid) =>
        prisma.vendorBid.update({
          where: { id: bid.id },
          data: { totalPrice: bid.totalPrice },
        })
      )
    );
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

/**
 * AI-assisted bid refresh for a cluster based on requirement product.
 * Finds serviceable published gigs, uses AI to score semantic match,
 * then creates/updates/removes bids accordingly.
 */
export async function refreshClusterAutobids(clusterId: string): Promise<void> {
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    select: {
      product: true,
      unit: true,
      requirementKey: true,
      currentQuantity: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!cluster) return;

  // Fetch ALL published gigs matching unit (no MOQ filter) so AI can match semantically
  // and we can set targetQuantity from the lowest matched MOQ regardless of current fill.
  const allCandidateGigs = await prisma.gig.findMany({
    where: {
      unit: { equals: cluster.unit, mode: "insensitive" },
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

  const serviceableGigs = allCandidateGigs.filter((gig) =>
    isClusterServiceableForVendor({
      vendorLatitude: gig.vendor.latitude,
      vendorLongitude: gig.vendor.longitude,
      serviceRadiusKm: gig.vendor.serviceRadiusKm,
      clusterLatitude: cluster.latitude,
      clusterLongitude: cluster.longitude,
    }),
  );

  if (serviceableGigs.length === 0) {
    // Remove all existing bids since no vendors can service this cluster
    await prisma.vendorBid.deleteMany({ where: { clusterId } });
    return;
  }

  // Use AI to score semantic match between cluster requirement and gig products
  let matchingGigIds: Set<string> = new Set();
  try {
    const modelId =
      process.env.BEDROCK_MODEL_ID?.trim() ||
      "anthropic.claude-3-sonnet-20240229-v1:0";

    const gigList = serviceableGigs.map((g, i) => `${i + 1}. id="${g.id}" product="${g.product}"`).join("\n");
    const systemPrompt =
      "You are a product matcher for an agricultural procurement platform. " +
      "Given a cluster requirement product and a list of available gig products, " +
      "return a JSON array of gig IDs that semantically match the requirement (same product, considering language variants).\n" +
      'Return ONLY a JSON array: { "matchingGigIds": ["id1", "id2", ...] }';

    const userContent = JSON.stringify({
      clusterRequirement: cluster.requirementKey ?? cluster.product,
      clusterProduct: cluster.product,
      availableGigs: gigList,
    });

    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId,
        system: [{ text: systemPrompt }],
        messages: [{ role: "user", content: [{ text: userContent }] }],
        inferenceConfig: { temperature: 0.1, maxTokens: 500 },
      }),
    );

    let text = "";
    for (const part of response.output?.message?.content ?? []) {
      if (part.text) text += part.text;
    }

    // Parse JSON
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as Record<string, unknown>).matchingGigIds)
      ) {
        const ids = (parsed as { matchingGigIds: unknown[] }).matchingGigIds;
        matchingGigIds = new Set(ids.filter((id): id is string => typeof id === "string"));
      }
    }
  } catch (err) {
    logger.error("[cluster] refreshClusterAutobids AI error:", err);
    // Fallback: treat all serviceable gigs as matching (product-name insensitive match)
    for (const gig of serviceableGigs) {
      if (gig.product.toLowerCase().trim() === cluster.product.toLowerCase().trim()) {
        matchingGigIds.add(gig.id);
      }
    }
  }

  // If AI returned empty set, fall back to product-name match
  if (matchingGigIds.size === 0) {
    for (const gig of serviceableGigs) {
      if (gig.product.toLowerCase().trim() === cluster.product.toLowerCase().trim()) {
        matchingGigIds.add(gig.id);
      }
    }
  }

  const matchingGigs = serviceableGigs.filter((g) => matchingGigIds.has(g.id));

  // Update targetQuantity to the lowest MOQ among ALL AI-matched gigs (regardless of current fill).
  // This lets the cluster "know" what quantity is needed to attract vendor bids.
  if (matchingGigs.length > 0) {
    const lowestMoq = Math.min(...matchingGigs.map((g) => g.minQuantity));
    const currentCluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { targetQuantity: true, currentQuantity: true },
    });
    if (currentCluster && lowestMoq < currentCluster.targetQuantity) {
      await prisma.cluster.update({
        where: { id: clusterId },
        data: { targetQuantity: lowestMoq },
      });
    }
  }

  // Only create/update bids for vendors whose MOQ is met by the cluster's current quantity.
  // Vendors with MOQ > currentQuantity will NOT appear in the bid list (including during VOTING).
  const bidEligibleGigs = matchingGigs.filter(
    (g) => g.minQuantity <= cluster.currentQuantity,
  );

  // Keep one bid per vendor (best matching gig = lowest price per unit for that vendor)
  const bestGigByVendor = new Map<string, typeof matchingGigs[0]>();
  for (const gig of bidEligibleGigs) {
    const existing = bestGigByVendor.get(gig.vendorId);
    if (!existing || gig.pricePerUnit < existing.pricePerUnit) {
      bestGigByVendor.set(gig.vendorId, gig);
    }
  }

  const eligibleVendorIds = new Set(bestGigByVendor.keys());

  const existingBids = await prisma.vendorBid.findMany({
    where: { clusterId },
  });

  const bidsToDelete = existingBids
    .filter((b) => !eligibleVendorIds.has(b.vendorId))
    .map((b) => b.id);

  if (bidsToDelete.length > 0) {
    await prisma.vendorBid.deleteMany({ where: { id: { in: bidsToDelete } } });
  }

  const existingBidsByVendorId = new Map(
    existingBids
      .filter((b) => eligibleVendorIds.has(b.vendorId))
      .map((bid) => [bid.vendorId, bid]),
  );

  const bidsToCreate: Array<{
    clusterId: string;
    vendorId: string;
    gigId: string;
    pricePerUnit: number;
    totalPrice: number;
  }> = [];
  const bidsToUpdate: Array<{ id: string; pricePerUnit: number; gigId: string; totalPrice: number }> = [];

  for (const [vendorId, gig] of bestGigByVendor) {
    const existing = existingBidsByVendorId.get(vendorId);
    if (existing) {
      bidsToUpdate.push({
        id: existing.id,
        pricePerUnit: gig.pricePerUnit,
        gigId: gig.id,
        totalPrice: gig.pricePerUnit * cluster.currentQuantity,
      });
    } else {
      bidsToCreate.push({
        clusterId,
        vendorId,
        gigId: gig.id,
        pricePerUnit: gig.pricePerUnit,
        totalPrice: gig.pricePerUnit * cluster.currentQuantity,
      });
    }
  }

  if (bidsToCreate.length > 0) {
    await prisma.vendorBid.createMany({ data: bidsToCreate });
  }

  await Promise.all(
    bidsToUpdate.map((bid) =>
      prisma.vendorBid.update({
        where: { id: bid.id },
        data: {
          pricePerUnit: bid.pricePerUnit,
          gigId: bid.gigId,
          totalPrice: bid.totalPrice,
        },
      }),
    ),
  );
}

export async function findJoinableClusters(
  product: string,
  unit: string,
  district?: string,
  latitude?: number,
  longitude?: number,
  preferredVariety?: string,
) {
  const normalizedUnit = normalizeUnit(unit);
  const normalizedVariety = normalizeVariety(preferredVariety);
  const allCandidateClusters = await prisma.cluster.findMany({
    where: {
      product: { equals: product, mode: "insensitive" },
      unit: { equals: normalizedUnit, mode: "insensitive" },
      status: { in: [ClusterStatus.FORMING, ClusterStatus.VOTING] },
    },
    include: {
      members: { include: { farmer: { select: farmerSafeSelect }, order: true } },
      bids: { include: { vendor: { select: vendorSafeSelect }, vendorVotes: true, gig: true } },
      delivery: true,
      vendor: { select: vendorSafeSelect },
      gig: true,
      ratings: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const clusters =
    normalizedVariety.length === 0
      ? allCandidateClusters
      : allCandidateClusters.filter((cluster) => {
          const clusterVarieties = [
            cluster.gig?.variety,
            ...cluster.bids.map((bid) => bid.gig?.variety),
          ]
            .map((value) => normalizeVariety(value))
            .filter((value) => value.length > 0);
          return clusterVarieties.includes(normalizedVariety);
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

export async function findJoinableClustersByRequirementKey(
  requirementKey: string,
  unit: string,
  district?: string,
  latitude?: number,
  longitude?: number,
) {
  const normalizedUnit = normalizeUnit(unit);

  const allCandidateClusters = await prisma.cluster.findMany({
    where: {
      requirementKey,
      unit: { equals: normalizedUnit, mode: "insensitive" },
      status: { in: [ClusterStatus.FORMING, ClusterStatus.VOTING] },
    },
    include: {
      members: { include: { farmer: { select: farmerSafeSelect }, order: true } },
      bids: { include: { vendor: { select: vendorSafeSelect }, vendorVotes: true, gig: true } },
      delivery: true,
      vendor: { select: vendorSafeSelect },
      gig: true,
      ratings: true,
    },
    orderBy: [{ currentQuantity: "desc" }, { createdAt: "asc" }],
  });

  if (isValidCoordinate(latitude, longitude)) {
    const farmerPoint = {
      latitude: latitude as number,
      longitude: longitude as number,
    };
    return allCandidateClusters.filter((cluster) => {
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
    return allCandidateClusters.filter(
      (cluster) =>
        cluster.district &&
        cluster.district.toLowerCase() === district.toLowerCase(),
    );
  }

  return allCandidateClusters;
}

async function createClusterForOrder(params: {
  product: string;
  unit: string;
  requirementKey?: string;
  district?: string;
  state?: string;
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
  preferredVariety?: string;
}) {
  const normalizedUnit = normalizeUnit(params.unit);

  // Start with DEFAULT_TARGET_QUANTITY — refreshClusterAutobids (called after the first
  // member is added) will lower this to the smallest MOQ of any AI-matched vendor gig.
  return prisma.cluster.create({
    data: {
      product: params.product,
      unit: normalizedUnit,
      targetQuantity: DEFAULT_TARGET_QUANTITY,
      currentQuantity: 0,
      status: ClusterStatus.FORMING,
      district: params.district ?? null,
      state: params.state ?? null,
      locationAddress: params.locationAddress ?? null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      requirementKey: params.requirementKey ?? null,
      staleAt: buildStaleAt(),
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
      staleAt: buildStaleAt(),
      ...locationPatch,
    },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.CLUSTERED },
  });

  await sendClusterJoinedNotification({
    clusterId: updated.id,
    farmerId,
  });

  const prevBidCount = await prisma.vendorBid.count({ where: { clusterId } });

  if (updated.status === ClusterStatus.VOTING) {
    await refreshClusterAutobids(updated.id);
    await syncBidTotals(updated.id, updated.currentQuantity);
  } else if (updated.currentQuantity >= updated.targetQuantity) {
    await prisma.cluster.update({
      where: { id: updated.id },
      data: { status: ClusterStatus.VOTING },
    });
    await refreshClusterAutobids(updated.id);
    await sendVotingStartedNotification(updated.id);
  }

  // Recompute targetQuantity from lowest MOQ of matched serviceable gigs; increment votingRevision if bid set changed
  const newBidCount = await prisma.vendorBid.count({ where: { clusterId } });
  const bidSetChanged = newBidCount !== prevBidCount;

  const serviceableGigMoqs = await getServiceableGigMoqs(updated.id, updated.product, updated.unit, updated.latitude, updated.longitude);
  const newTargetQuantity = serviceableGigMoqs.length > 0
    ? Math.min(...serviceableGigMoqs)
    : updated.targetQuantity;

  const updateData: Record<string, unknown> = {};
  if (newTargetQuantity !== updated.targetQuantity) {
    updateData.targetQuantity = newTargetQuantity;
  }
  if (bidSetChanged && updated.status === ClusterStatus.VOTING) {
    updateData.votingRevision = { increment: 1 };
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.cluster.update({
      where: { id: updated.id },
      data: updateData,
    });
  }

  return prisma.cluster.findUnique({
    where: { id: updated.id },
    include: {
      members: { include: { farmer: { select: farmerSafeSelect }, order: true } },
      bids: { include: { vendor: { select: vendorSafeSelect }, vendorVotes: true } },
      delivery: true,
      vendor: { select: vendorSafeSelect },
      ratings: true,
    },
  });
}

async function getServiceableGigMoqs(
  clusterId: string,
  product: string,
  unit: string,
  clusterLatitude: number | null,
  clusterLongitude: number | null,
): Promise<number[]> {
  const gigs = await prisma.gig.findMany({
    where: {
      product: { equals: product, mode: "insensitive" },
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

  return gigs
    .filter((gig) =>
      isClusterServiceableForVendor({
        vendorLatitude: gig.vendor.latitude,
        vendorLongitude: gig.vendor.longitude,
        serviceRadiusKm: gig.vendor.serviceRadiusKm,
        clusterLatitude,
        clusterLongitude,
      }),
    )
    .map((gig) => gig.minQuantity);
}

export async function createNewClusterAndAssignOrder(params: {
  farmerId: string;
  orderId: string;
  product: string;
  quantity: number;
  unit: string;
  preferredVariety?: string;
  requirementKey?: string;
  district?: string;
  state?: string;
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
}) {
  const cluster = await createClusterForOrder({
    product: params.product,
    unit: params.unit,
    district: params.district,
    state: params.state,
    locationAddress: params.locationAddress,
    latitude: params.latitude,
    longitude: params.longitude,
    preferredVariety: params.preferredVariety,
    requirementKey: params.requirementKey,
  });

  return assignOrderToCluster({
    clusterId: cluster.id,
    farmerId: params.farmerId,
    orderId: params.orderId,
    quantity: params.quantity,
  });
}

/**
 * Requirement-key-based cluster assignment: finds best cluster by requirementKey + unit + geo/district,
 * prefers highest fill ratio. Falls back to creating new cluster.
 */
export async function autoAssignClusterByRequirement(params: {
  farmerId: string;
  orderId: string;
  requirementKey: string;
  requirementProduct: string;
  quantity: number;
  unit: string;
  district?: string;
  state?: string;
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
}) {
  const normalizedUnit = normalizeUnit(params.unit);
  const joinable = await findJoinableClustersByRequirementKey(
    params.requirementKey,
    normalizedUnit,
    params.district,
    params.latitude,
    params.longitude,
  );

  // Score by fill ratio (currentQuantity / targetQuantity), prefer highest
  const scored = joinable
    .map((cluster) => ({
      cluster,
      fillRatio: cluster.targetQuantity > 0
        ? cluster.currentQuantity / cluster.targetQuantity
        : 0,
    }))
    .sort((a, b) => b.fillRatio - a.fillRatio);

  const chosen = scored[0]?.cluster;

  if (chosen) {
    return assignOrderToCluster({
      clusterId: chosen.id,
      farmerId: params.farmerId,
      orderId: params.orderId,
      quantity: params.quantity,
    });
  }

  return createNewClusterAndAssignOrder({
    farmerId: params.farmerId,
    orderId: params.orderId,
    product: params.requirementProduct,
    quantity: params.quantity,
    unit: normalizedUnit,
    requirementKey: params.requirementKey,
    district: params.district,
    state: params.state,
    locationAddress: params.locationAddress,
    latitude: params.latitude,
    longitude: params.longitude,
  });
}

/**
 * Legacy helper retained for compatibility. This prefers existing joinable
 * clusters and falls back to creating a new one.
 */
export async function autoAssignCluster(
  farmerId: string,
  orderId: string,
  product: string,
  quantity: number,
  unit: string,
  preferredVariety?: string,
  district?: string,
  state?: string,
  locationAddress?: string,
  latitude?: number,
  longitude?: number,
) {
  const normalizedUnit = normalizeUnit(unit);
  const joinable = await findJoinableClusters(
    product,
    normalizedUnit,
    district,
    latitude,
    longitude,
    preferredVariety,
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
    product,
    quantity,
    unit: normalizedUnit,
    preferredVariety,
    district,
    state,
    locationAddress,
    latitude,
    longitude,
  });
}

/**
 * Cancel an order from its cluster. Removes the member, decrements currentQuantity,
 * collapses cluster if empty, otherwise refreshes bids. Marks order CANCELLED.
 */
export async function cancelOrderFromCluster(params: {
  orderId: string;
  farmerId: string;
}): Promise<{ cluster: Awaited<ReturnType<typeof prisma.cluster.findUnique>> | null; order: Awaited<ReturnType<typeof prisma.order.findUnique>> }> {
  const order = await prisma.order.findFirst({
    where: { id: params.orderId, farmerId: params.farmerId },
    select: {
      id: true,
      status: true,
      quantity: true,
      clusterMember: {
        select: {
          id: true,
          clusterId: true,
          quantity: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  const allowedOrderStatuses: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.CLUSTERED,
    OrderStatus.PAYMENT_PENDING,
  ];
  if (!allowedOrderStatuses.includes(order.status)) {
    throw new Error("Order cannot be cancelled in its current status");
  }

  const clusterMember = order.clusterMember;
  if (!clusterMember) {
    // Order is PENDING without a cluster — just cancel it
    const cancelledOrder = await prisma.order.update({
      where: { id: params.orderId },
      data: { status: OrderStatus.CANCELLED },
    });
    return { cluster: null, order: cancelledOrder };
  }

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterMember.clusterId },
    select: {
      id: true,
      status: true,
      product: true,
      unit: true,
      currentQuantity: true,
      targetQuantity: true,
      votingRevision: true,
      latitude: true,
      longitude: true,
      requirementKey: true,
    },
  });

  // Also find ALL other stacked orders this farmer has in the same cluster
  const allFarmerMembersInCluster = await prisma.clusterMember.findMany({
    where: { clusterId: clusterMember.clusterId, farmerId: params.farmerId },
    select: { id: true, orderId: true, quantity: true },
  });

  if (!cluster) {
    throw new Error("Cluster not found");
  }

  const blockedClusterStatuses: ClusterStatus[] = [
    ClusterStatus.PAYMENT,
    ClusterStatus.PROCESSING,
    ClusterStatus.OUT_FOR_DELIVERY,
    ClusterStatus.DISPATCHED,
    ClusterStatus.COMPLETED,
  ];

  if (blockedClusterStatuses.includes(cluster.status)) {
    throw new Error("Cluster is too far along to cancel from");
  }

  const wasVoting = cluster.status === ClusterStatus.VOTING;

  // Remove ALL of this farmer's ClusterMembers in this cluster (handles stacked orders)
  const allFarmerMemberIds = allFarmerMembersInCluster.map((m) => m.id);
  const totalFarmerQuantity = allFarmerMembersInCluster.reduce((sum, m) => sum + m.quantity, 0);
  await prisma.clusterMember.deleteMany({ where: { id: { in: allFarmerMemberIds } } });

  // Cancel ALL of this farmer's stacked orders in this cluster
  const allFarmerOrderIds = allFarmerMembersInCluster.map((m) => m.orderId);
  await prisma.order.updateMany({
    where: { id: { in: allFarmerOrderIds } },
    data: { status: OrderStatus.CANCELLED },
  });

  // Check remaining members
  const remainingMembers = await prisma.clusterMember.count({
    where: { clusterId: cluster.id },
  });

  let updatedCluster: Awaited<ReturnType<typeof prisma.cluster.findUnique>> = null;

  if (remainingMembers === 0) {
    // Collapse cluster
    await prisma.cluster.update({
      where: { id: cluster.id },
      data: {
        status: ClusterStatus.FAILED,
        currentQuantity: 0,
        failureReason: "empty",
      },
    });
    updatedCluster = await prisma.cluster.findUnique({ where: { id: cluster.id } });
  } else {
    const newCurrentQuantity = Math.max(0, cluster.currentQuantity - totalFarmerQuantity);

    // Decrement currentQuantity FIRST so refreshClusterAutobids reads the correct value
    await prisma.cluster.update({
      where: { id: cluster.id },
      data: { currentQuantity: newCurrentQuantity, staleAt: buildStaleAt() },
    });

    const prevBidCount = await prisma.vendorBid.count({ where: { clusterId: cluster.id } });

    await refreshClusterAutobids(cluster.id);

    const newBidCount = await prisma.vendorBid.count({ where: { clusterId: cluster.id } });
    const bidSetChanged = newBidCount !== prevBidCount;

    // refreshClusterAutobids may have already updated targetQuantity from AI-matched MOQs;
    // only override if bid set didn't change (i.e. refresh had no matching gigs to set target from)
    const updatedClusterAfterRefresh = await prisma.cluster.findUnique({
      where: { id: cluster.id },
      select: { targetQuantity: true },
    });
    const currentTarget = updatedClusterAfterRefresh?.targetQuantity ?? cluster.targetQuantity;

    await prisma.cluster.update({
      where: { id: cluster.id },
      data: {
        ...(wasVoting && bidSetChanged
          ? { votingRevision: { increment: 1 } }
          : {}),
        // Only lower target, never raise it after a member leaves
        ...(newCurrentQuantity < currentTarget ? { targetQuantity: newCurrentQuantity > 0 ? newCurrentQuantity : currentTarget } : {}),
      },
    });

    updatedCluster = await prisma.cluster.findUnique({ where: { id: cluster.id } });
  }

  // All orders already cancelled above; fetch the primary one for the response
  const cancelledOrder = await prisma.order.findUnique({ where: { id: params.orderId } });

  return { cluster: updatedCluster, order: cancelledOrder };
}

/**
 * Sweep stale clusters: mark FORMING/VOTING clusters where staleAt < now as FAILED,
 * release unpaid orders back to PENDING, and re-run autoAssignClusterByRequirement
 * for orders that have a requirementKey.
 */
export async function sweepStaleClusters(): Promise<void> {
  const now = new Date();

  const staleClusters = await prisma.cluster.findMany({
    where: {
      status: { in: [ClusterStatus.FORMING, ClusterStatus.VOTING] },
      staleAt: { lt: now },
    },
    include: {
      members: {
        include: {
          order: {
            select: {
              id: true,
              farmerId: true,
              product: true,
              quantity: true,
              unit: true,
              requirementKey: true,
              status: true,
            },
          },
          farmer: {
            select: {
              id: true,
              district: true,
              state: true,
              locationAddress: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
    },
  });

  if (staleClusters.length === 0) return;

  for (const staleCluster of staleClusters) {
    try {
      const orderIds = staleCluster.members
        .map((m) => m.order.id)
        .filter(Boolean);

      await prisma.$transaction([
        prisma.cluster.update({
          where: { id: staleCluster.id },
          data: {
            status: ClusterStatus.FAILED,
            currentQuantity: 0,
            failureReason: "stale",
          },
        }),
        prisma.clusterMember.deleteMany({
          where: { clusterId: staleCluster.id },
        }),
        prisma.order.updateMany({
          where: {
            id: { in: orderIds },
            status: {
              in: [OrderStatus.CLUSTERED, OrderStatus.PAYMENT_PENDING],
            },
          },
          data: { status: OrderStatus.PENDING },
        }),
      ]);

      // Re-run assignment for orders with requirementKey
      for (const member of staleCluster.members) {
        const { order, farmer } = member;
        if (!order.requirementKey) continue;

        try {
          await autoAssignClusterByRequirement({
            farmerId: farmer.id,
            orderId: order.id,
            requirementKey: order.requirementKey,
            requirementProduct: order.product,
            quantity: order.quantity,
            unit: order.unit,
            district: farmer.district ?? undefined,
            state: farmer.state ?? undefined,
            locationAddress: farmer.locationAddress ?? undefined,
            latitude: farmer.latitude ?? undefined,
            longitude: farmer.longitude ?? undefined,
          });
        } catch (err) {
          logger.error("[cluster] sweepStaleClusters: failed to reassign order", {
            orderId: order.id,
            err,
          });
        }
      }
    } catch (err) {
      logger.error("[cluster] sweepStaleClusters: failed to process stale cluster", {
        clusterId: staleCluster.id,
        err,
      });
    }
  }
}

/**
 * When a gig is published, recompute each matching FORMING cluster's best
 * possible targetQuantity from serviceable published gigs and lower target only
 * when a better minimum is available. Transition to VOTING when the adjusted
 * target is met, then auto-bid.
 * Also auto-bid on any already-VOTING clusters that match.
 */
export async function syncClustersForPublishedGig(
  product: string,
  unit: string,
  _minQuantity: number,
) {
  unit = normalizeUnit(unit);

  // Pre-fetch matching gigs to prevent N+1 queries during batch operations
  const matchingGigs = await prisma.gig.findMany({
    where: {
      product: { equals: product, mode: "insensitive" },
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

  // Recompute target quantity for FORMING clusters using only serviceable gigs.
  const formingClusters = await prisma.cluster.findMany({
    where: {
      product: { equals: product, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: ClusterStatus.FORMING,
    },
    select: {
      id: true,
      product: true,
      unit: true,
      targetQuantity: true,
      currentQuantity: true,
      latitude: true,
      longitude: true,
    },
  });

  const formingAdjustments = formingClusters
    .map((cluster) => {
      const serviceableGigs = matchingGigs.filter((gig) =>
        isClusterServiceableForVendor({
          vendorLatitude: gig.vendor.latitude,
          vendorLongitude: gig.vendor.longitude,
          serviceRadiusKm: gig.vendor.serviceRadiusKm,
          clusterLatitude: cluster.latitude,
          clusterLongitude: cluster.longitude,
        }),
      );

      if (serviceableGigs.length === 0) return null;

      const bestTargetQuantity = Math.min(
        ...serviceableGigs.map((gig) => gig.minQuantity),
      );
      const nextTargetQuantity = Math.min(
        cluster.targetQuantity,
        bestTargetQuantity,
      );
      const shouldUpdateTarget = nextTargetQuantity < cluster.targetQuantity;
      const shouldTransition = cluster.currentQuantity >= nextTargetQuantity;

      if (!shouldUpdateTarget && !shouldTransition) return null;

      return {
        ...cluster,
        nextTargetQuantity,
        shouldUpdateTarget,
        shouldTransition,
      };
    })
    .filter(
      (
        value,
      ): value is {
        id: string;
        product: string;
        unit: string;
        targetQuantity: number;
        currentQuantity: number;
        latitude: number | null;
        longitude: number | null;
        nextTargetQuantity: number;
        shouldUpdateTarget: boolean;
        shouldTransition: boolean;
      } => value !== null,
    );

  let clustersToTransition: typeof formingAdjustments = [];

  if (formingAdjustments.length > 0) {
    const updateResults = await prisma.$transaction(
      formingAdjustments.map((cluster) =>
        prisma.cluster.updateMany({
          where: {
            id: cluster.id,
            status: ClusterStatus.FORMING,
          },
          data: {
            ...(cluster.shouldUpdateTarget
              ? { targetQuantity: cluster.nextTargetQuantity }
              : {}),
            ...(cluster.shouldTransition ? { status: ClusterStatus.VOTING } : {}),
          },
        }),
      ),
    );

    clustersToTransition = formingAdjustments.filter(
      (cluster, index) =>
        cluster.shouldTransition && (updateResults[index]?.count ?? 0) > 0,
    );
  }

  if (clustersToTransition.length > 0) {
    await Promise.all(
      clustersToTransition.map((cluster) =>
        autoCreateBidsForVotingCluster(
          cluster.id,
          cluster.product,
          cluster.unit,
          cluster.currentQuantity,
          {
            clusterCoordinates: {
              latitude: cluster.latitude,
              longitude: cluster.longitude,
            },
            matchingGigs,
          },
        )
      ),
    );
    await Promise.all(
      clustersToTransition.map((cluster) =>
        sendVotingStartedNotification(cluster.id),
      ),
    );
  }

  // Also auto-bid on already-VOTING clusters that match this gig
  const votingClusters = await prisma.cluster.findMany({
    where: {
      product: { equals: product, mode: "insensitive" },
      unit: { equals: unit, mode: "insensitive" },
      status: ClusterStatus.VOTING,
    },
    select: {
      id: true,
      product: true,
      unit: true,
      currentQuantity: true,
      latitude: true,
      longitude: true,
    },
  });

  await Promise.all(
    votingClusters.map((cluster) =>
      autoCreateBidsForVotingCluster(
        cluster.id,
        cluster.product,
        cluster.unit,
        cluster.currentQuantity,
        {
          clusterCoordinates: {
            latitude: cluster.latitude,
            longitude: cluster.longitude,
          },
          matchingGigs,
        },
      )
    ),
  );
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

  await sendClusterFailedNotification(clusterId);

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
