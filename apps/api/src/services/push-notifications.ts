import { DevicePlatform, type FarmerDeviceToken } from "@prisma/client";

import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { getFirebaseMessagingClient } from "./firebase-admin.js";

export const notificationPreferenceDefaults = {
  cluster_formed: true,
  voting_started: true,
  voting_reminders: true,
  payment_pending: true,
  payment_reminders: true,
  payment_confirmed: true,
  order_status_updates: true,
  delivery_updates: true,
  account_updates: true,
  product_announcements: false,
} as const;

export type NotificationPreferenceKey =
  keyof typeof notificationPreferenceDefaults;

type NotificationPreferencesInput = Partial<
  Record<NotificationPreferenceKey, boolean>
>;

type SendFarmerPushParams = {
  farmerIds: string[];
  title: string;
  body: string;
  route?: string | null;
  preferenceKey: NotificationPreferenceKey;
  type: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};

const invalidTokenErrorCodes = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/mismatched-credential",
]);

export function normalizeNotificationPreferences(
  preferences?: NotificationPreferencesInput | null,
) {
  return {
    ...notificationPreferenceDefaults,
    ...(preferences ?? {}),
  };
}

function isPreferenceEnabled(
  tokenRecord: Pick<FarmerDeviceToken, "preferences">,
  preferenceKey: NotificationPreferenceKey,
) {
  const rawPreferences =
    tokenRecord.preferences && typeof tokenRecord.preferences === "object"
      ? (tokenRecord.preferences as Record<string, unknown>)
      : {};

  const value = rawPreferences[preferenceKey];
  if (typeof value === "boolean") {
    return value;
  }

  return notificationPreferenceDefaults[preferenceKey];
}

function stringifyData(
  data?: Record<string, string | number | boolean | null | undefined>,
) {
  return Object.fromEntries(
    Object.entries(data ?? {}).flatMap(([key, value]) =>
      value === null || value === undefined ? [] : [[key, String(value)]],
    ),
  );
}

export async function registerFarmerDeviceToken(params: {
  farmerId: string;
  token: string;
  preferences?: NotificationPreferencesInput | null;
}) {
  const token = params.token.trim();
  if (!token) {
    throw new Error("FCM token is required");
  }

  const preferences = normalizeNotificationPreferences(params.preferences);

  return prisma.farmerDeviceToken.upsert({
    where: { token },
    create: {
      farmerId: params.farmerId,
      token,
      platform: DevicePlatform.ANDROID,
      preferences,
      lastSeenAt: new Date(),
    },
    update: {
      farmerId: params.farmerId,
      platform: DevicePlatform.ANDROID,
      preferences,
      lastSeenAt: new Date(),
    },
  });
}

export async function unregisterFarmerDeviceToken(params: {
  farmerId: string;
  token: string;
}) {
  const token = params.token.trim();
  if (!token) {
    return { count: 0 };
  }

  return prisma.farmerDeviceToken.deleteMany({
    where: {
      farmerId: params.farmerId,
      token,
    },
  });
}

export async function sendPushToFarmers(params: SendFarmerPushParams) {
  const messaging = getFirebaseMessagingClient();
  if (!messaging) {
    return { sentCount: 0, failureCount: 0, skipped: true };
  }

  const farmerIds = Array.from(
    new Set(params.farmerIds.map((value) => value.trim()).filter(Boolean)),
  );
  if (farmerIds.length === 0) {
    return { sentCount: 0, failureCount: 0, skipped: true };
  }

  const tokenRows = await prisma.farmerDeviceToken.findMany({
    where: {
      farmerId: { in: farmerIds },
      platform: DevicePlatform.ANDROID,
    },
    select: {
      farmerId: true,
      token: true,
      preferences: true,
    },
  });

  const eligibleTokens = tokenRows.filter((row) =>
    isPreferenceEnabled(row, params.preferenceKey),
  );
  if (eligibleTokens.length === 0) {
    return { sentCount: 0, failureCount: 0, skipped: true };
  }

  const staleTokens: string[] = [];
  let sentCount = 0;
  let failureCount = 0;

  const baseData = stringifyData({
    route: params.route ?? "",
    preferenceKey: params.preferenceKey,
    type: params.type,
    ...(params.data ?? {}),
  });

  for (let index = 0; index < eligibleTokens.length; index += 500) {
    const batch = eligibleTokens.slice(index, index + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((row) => row.token),
      notification: {
        title: params.title,
        body: params.body,
      },
      data: baseData,
      android: {
        priority: "high",
        notification: {
          channelId: "agrisetu_updates",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
    });

    sentCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((result, responseIndex) => {
      if (result.success) {
        return;
      }

      const code = result.error?.code;
      if (code && invalidTokenErrorCodes.has(code)) {
        staleTokens.push(batch[responseIndex]!.token);
      }

      logger.warn("firebase_push_send_failed", {
        code,
        farmerId: batch[responseIndex]!.farmerId,
      });
    });
  }

  if (staleTokens.length > 0) {
    await prisma.farmerDeviceToken.deleteMany({
      where: {
        token: { in: Array.from(new Set(staleTokens)) },
      },
    });
  }

  return { sentCount, failureCount, skipped: false };
}

export async function sendPushToClusterFarmers(
  clusterId: string,
  payload: Omit<SendFarmerPushParams, "farmerIds">,
) {
  const members = await prisma.clusterMember.findMany({
    where: { clusterId },
    select: { farmerId: true },
  });

  return sendPushToFarmers({
    ...payload,
    farmerIds: members.map((member) => member.farmerId),
  });
}
