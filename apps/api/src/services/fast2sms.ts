import { requireEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const FAST2SMS_BASE_URL = process.env.FAST2SMS_BASE_URL?.trim() || "https://www.fast2sms.com";
const FAST2SMS_ROUTE = process.env.FAST2SMS_ROUTE?.trim() || "dlt";
const FAST2SMS_SENDER_ID = process.env.FAST2SMS_SENDER_ID?.trim();
const FAST2SMS_MESSAGE_ID = process.env.FAST2SMS_MESSAGE_ID?.trim();
const FAST2SMS_PROVIDER = "fast2sms";

type Fast2SmsSendResponse = {
  return?: boolean;
  request_id?: string;
  message?: string[];
};

export type SmsSendResult = {
  providerName: string;
  requestId: string;
  acceptedAt: Date;
};

function getFast2SmsConfig() {
  return {
    apiKey: requireEnv("FAST2SMS_API_KEY"),
    senderId: FAST2SMS_SENDER_ID || requireEnv("FAST2SMS_SENDER_ID"),
    messageId: Number(FAST2SMS_MESSAGE_ID || requireEnv("FAST2SMS_MESSAGE_ID")),
    route: FAST2SMS_ROUTE,
    baseUrl: FAST2SMS_BASE_URL,
  };
}

export async function sendFarmerOtpSms(phone: string, otp: string): Promise<SmsSendResult> {
  const config = getFast2SmsConfig();
  const acceptedAt = new Date();

  const response = await fetch(`${config.baseUrl}/dev/bulkV2`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: config.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      variables_values: otp,
      route: config.route,
      sender_id: config.senderId,
      message: config.messageId,
      numbers: phone,
    }),
  });

  let payload: Fast2SmsSendResponse | null = null;
  try {
    payload = (await response.json()) as Fast2SmsSendResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.return || !payload.request_id) {
    logger.warn("fast2sms_send_failed", {
      status: response.status,
      body: payload,
    });
    throw new Error("SMS provider rejected the OTP request.");
  }

  return {
    providerName: FAST2SMS_PROVIDER,
    requestId: payload.request_id,
    acceptedAt,
  };
}
