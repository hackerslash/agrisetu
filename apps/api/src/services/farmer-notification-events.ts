import { prisma } from "../lib/prisma.js";
import { sendPushToClusterFarmers, sendPushToFarmers } from "./push-notifications.js";

async function getClusterSummary(clusterId: string) {
  return prisma.cluster.findUnique({
    where: { id: clusterId },
    select: {
      id: true,
      product: true,
      district: true,
      state: true,
    },
  });
}

function locationSuffix(cluster: {
  district?: string | null;
  state?: string | null;
}) {
  if (cluster.district?.trim()) {
    return ` in ${cluster.district.trim()}`;
  }
  if (cluster.state?.trim()) {
    return ` in ${cluster.state.trim()}`;
  }
  return "";
}

export async function sendClusterJoinedNotification(params: {
  clusterId: string;
  farmerId: string;
}) {
  const cluster = await getClusterSummary(params.clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToFarmers({
    farmerIds: [params.farmerId],
    title: `Cluster formed for ${cluster.product}`,
    body: `Your order has joined a farmer cluster${locationSuffix(cluster)}.`,
    route: `/clusters/${cluster.id}`,
    preferenceKey: "cluster_formed",
    type: "cluster_formed",
    data: { clusterId: cluster.id },
  });
}

export async function sendVotingStartedNotification(clusterId: string) {
  const cluster = await getClusterSummary(clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToClusterFarmers(clusterId, {
    title: "Voting has started",
    body: `Vendor bids are ready for ${cluster.product}. Review and vote now.`,
    route: `/clusters/${cluster.id}`,
    preferenceKey: "voting_started",
    type: "voting_started",
    data: { clusterId: cluster.id },
  });
}

export async function sendPaymentPendingNotification(clusterId: string) {
  const cluster = await getClusterSummary(clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToClusterFarmers(clusterId, {
    title: `Payment pending for ${cluster.product}`,
    body: "Vendor selection is complete. Complete payment to confirm your place in this cluster.",
    route: `/payment/${cluster.id}`,
    preferenceKey: "payment_pending",
    type: "payment_pending",
    data: { clusterId: cluster.id },
  });
}

export async function sendPaymentConfirmedNotification(params: {
  clusterId: string;
  farmerId: string;
}) {
  const cluster = await getClusterSummary(params.clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToFarmers({
    farmerIds: [params.farmerId],
    title: "Payment confirmed",
    body: `Your payment for ${cluster.product} has been recorded successfully.`,
    route: `/clusters/${cluster.id}`,
    preferenceKey: "payment_confirmed",
    type: "payment_confirmed",
    data: { clusterId: cluster.id },
  });
}

export async function sendProcessingStartedNotification(clusterId: string) {
  const cluster = await getClusterSummary(clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToClusterFarmers(clusterId, {
    title: "Order is being processed",
    body: `${cluster.product} is now being prepared by the selected vendor.`,
    route: `/clusters/${cluster.id}`,
    preferenceKey: "order_status_updates",
    type: "order_processing",
    data: { clusterId: cluster.id },
  });
}

export async function sendDispatchedNotification(clusterId: string) {
  const cluster = await getClusterSummary(clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToClusterFarmers(clusterId, {
    title: "Order dispatched",
    body: `${cluster.product} is now on the way to your cluster${locationSuffix(cluster)}.`,
    route: `/delivery/${cluster.id}`,
    preferenceKey: "delivery_updates",
    type: "delivery_update",
    data: { clusterId: cluster.id },
  });
}

export async function sendDeliveredNotification(clusterId: string) {
  const cluster = await getClusterSummary(clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToClusterFarmers(clusterId, {
    title: "Order delivered",
    body: `${cluster.product} has been marked as delivered successfully.`,
    route: `/delivery/${cluster.id}`,
    preferenceKey: "delivery_updates",
    type: "delivery_completed",
    data: { clusterId: cluster.id },
  });
}

export async function sendRejectedNotification(clusterId: string) {
  const cluster = await getClusterSummary(clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToClusterFarmers(clusterId, {
    title: "Order rejected",
    body: `${cluster.product} could not be fulfilled. Open the app for details and refund status.`,
    route: `/clusters/${cluster.id}`,
    preferenceKey: "order_status_updates",
    type: "order_rejected",
    data: { clusterId: cluster.id },
  });
}

export async function sendClusterFailedNotification(clusterId: string) {
  const cluster = await getClusterSummary(clusterId);
  if (!cluster) {
    return;
  }

  await sendPushToClusterFarmers(clusterId, {
    title: "Cluster needs attention",
    body: `${cluster.product} could not proceed. Open the app to review the next step.`,
    route: `/clusters/${cluster.id}`,
    preferenceKey: "order_status_updates",
    type: "order_failed",
    data: { clusterId: cluster.id },
  });
}
