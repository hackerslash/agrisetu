import { readFileSync } from "node:fs";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

import { logger } from "../lib/logger.js";

let cachedMessaging: Messaging | null | undefined;

type ServiceAccountWithRawProjectId = ServiceAccount & {
  project_id?: string;
};

function loadServiceAccount(): ServiceAccountWithRawProjectId | null {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    return JSON.parse(inlineJson) as ServiceAccountWithRawProjectId;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!serviceAccountPath) {
    return null;
  }

  const fileContents = readFileSync(serviceAccountPath, "utf8");
  return JSON.parse(fileContents) as ServiceAccountWithRawProjectId;
}

export function getFirebaseMessagingClient(): Messaging | null {
  if (cachedMessaging !== undefined) {
    return cachedMessaging;
  }

  try {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      logger.warn("firebase_admin_not_configured", {
        hasProjectId: Boolean(process.env.FIREBASE_PROJECT_ID?.trim()),
        hasServiceAccountJson: Boolean(
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim(),
        ),
        hasServiceAccountPath: Boolean(
          process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim(),
        ),
      });
      cachedMessaging = null;
      return cachedMessaging;
    }

    const projectIdFromServiceAccount =
      serviceAccount.projectId || serviceAccount.project_id;

    const app =
      getApps().length > 0
        ? getApp()
        : initializeApp({
            credential: cert(serviceAccount),
            projectId:
              process.env.FIREBASE_PROJECT_ID?.trim() ||
              projectIdFromServiceAccount ||
              undefined,
          });

    cachedMessaging = getMessaging(app);
    return cachedMessaging;
  } catch (error) {
    logger.error("firebase_admin_init_failed", { error });
    cachedMessaging = null;
    return cachedMessaging;
  }
}
