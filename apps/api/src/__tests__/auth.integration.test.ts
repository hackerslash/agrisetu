import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type FarmerRecord = {
  id: string;
  phone: string;
  name: string | null;
  cropsGrown: string[];
  language: string;
  aadhaarLinked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OtpChallengeRecord = {
  id: string;
  phone: string;
  otpHash: string;
  providerName: string;
  providerRequestId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  consumedAt: Date | null;
  sendCount: number;
  verifyAttempts: number;
  lastSentAt: Date;
  providerAcceptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type VendorRecord = {
  id: string;
  email: string;
  password: string;
  businessName: string;
  contactName: string;
  phone: string;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  businessType: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceRadiusKm: number;
  role: "VENDOR" | "SUPERADMIN";
  status:
    | "ONBOARDING"
    | "PENDING_REVIEW"
    | "ACTIVE"
    | "REJECTED"
    | "SUSPENDED";
  isVerified: boolean;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let farmers = new Map<string, FarmerRecord>();
let challenges = new Map<string, OtpChallengeRecord>();
let vendors = new Map<string, VendorRecord>();
let sentOtps = new Map<string, string>();
let requestCounter = 1;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function resetStores() {
  farmers = new Map();
  challenges = new Map();
  vendors = new Map([
    [
      "vendor-1",
      {
        id: "vendor-1",
        email: "vendor@example.com",
        password: "hashed",
        businessName: "Agri Vendor",
        contactName: "Vendor User",
        phone: "9876543210",
        gstin: null,
        pan: null,
        state: null,
        businessType: null,
        locationAddress: null,
        latitude: null,
        longitude: null,
        serviceRadiusKm: 25,
        role: "VENDOR",
        status: "ONBOARDING",
        isVerified: false,
        submittedAt: null,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  ]);
  sentOtps = new Map();
  requestCounter = 1;
}

const mockPrisma = {
  farmer: {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; phone?: string } }) => {
      if (where.id) {
        for (const farmer of farmers.values()) {
          if (farmer.id === where.id) return clone(farmer);
        }
        return null;
      }

      if (where.phone) {
        return clone(farmers.get(where.phone) ?? null);
      }

      return null;
    }),
    create: vi.fn(async ({ data }: { data: { phone: string } }) => {
      const farmer: FarmerRecord = {
        id: `farmer-${farmers.size + 1}`,
        phone: data.phone,
        name: null,
        cropsGrown: [],
        language: "en",
        aadhaarLinked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      farmers.set(farmer.phone, farmer);
      return clone(farmer);
    }),
    update: vi.fn(),
  },
  farmerOtpChallenge: {
    findUnique: vi.fn(async ({ where }: { where: { phone: string } }) => {
      return clone(challenges.get(where.phone) ?? null);
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { phone: string };
        create: Omit<OtpChallengeRecord, "id" | "createdAt" | "updatedAt">;
        update: Partial<OtpChallengeRecord>;
      }) => {
        const existing = challenges.get(where.phone);
        const nextValue: OtpChallengeRecord = existing
          ? {
              ...existing,
              ...update,
              updatedAt: new Date(),
            }
          : {
              id: `challenge-${challenges.size + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...create,
            };
        challenges.set(where.phone, nextValue);
        return clone(nextValue);
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { phone: string };
        data: Partial<OtpChallengeRecord>;
      }) => {
        const existing = challenges.get(where.phone);
        if (!existing) throw new Error("Challenge not found");
        const nextValue = { ...existing, ...data, updatedAt: new Date() };
        challenges.set(where.phone, nextValue);
        return clone(nextValue);
      },
    ),
  },
  vendor: {
    findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
      if (where.id) return clone(vendors.get(where.id) ?? null);
      if (where.email) {
        for (const vendor of vendors.values()) {
          if (vendor.email === where.email) return clone(vendor);
        }
      }
      return null;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<VendorRecord>;
      }) => {
        const existing = vendors.get(where.id);
        if (!existing) throw new Error("Vendor not found");
        const nextValue = { ...existing, ...data, updatedAt: new Date() };
        vendors.set(where.id, nextValue);
        return clone(nextValue);
      },
    ),
    create: vi.fn(),
  },
};

vi.mock("../lib/prisma.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("../services/farmer-avatar.js", () => ({
  withFarmerAvatarForClient: vi.fn(async (farmer: FarmerRecord) => ({
    ...farmer,
    isProfileComplete: Boolean(farmer.name),
  })),
}));

vi.mock("../services/push-notifications.js", () => ({
  normalizeNotificationPreferences: vi.fn((value: unknown) => value ?? {}),
  registerFarmerDeviceToken: vi.fn(),
  unregisterFarmerDeviceToken: vi.fn(),
}));

vi.mock("../services/vendor-documents.js", () => ({
  withVendorDocumentsForClient: vi.fn(async (vendor: unknown) => vendor),
}));

vi.mock("../routes/farmer.js", async () => {
  const express = await import("express");
  return { default: express.Router() };
});

vi.mock("../routes/vendor.js", async () => {
  const express = await import("express");
  return { default: express.Router() };
});

vi.mock("../ws/voice-stream.js", () => ({
  attachVoiceStreamServer: vi.fn(),
  handleVoiceStreamUpgrade: vi.fn(() => false),
}));

vi.mock("../services/cluster.js", () => ({
  sweepStaleClusters: vi.fn(async () => {}),
}));

async function loadApp() {
  process.env.JWT_SECRET = "12345678901234567890123456789012";
  process.env.CORS_ALLOWED_ORIGINS = "https://vendor.agrisetu.test";
  process.env.FAST2SMS_API_KEY = "test-fast2sms-key";
  process.env.FAST2SMS_MESSAGE_ID = "213146";
  process.env.FAST2SMS_SENDER_ID = "AIMPTH";
  vi.resetModules();
  const { createApp } = await import("../index.js");
  return createApp();
}

async function loadJwt() {
  process.env.JWT_SECRET = "12345678901234567890123456789012";
  vi.resetModules();
  return import("../lib/jwt.js");
}

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("farmer OTP auth", () => {
  test("stores a hashed OTP challenge and provider request id on successful send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as {
          numbers: string;
          variables_values: string;
        };
        sentOtps.set(payload.numbers, payload.variables_values);

        return new Response(
          JSON.stringify({
            return: true,
            request_id: `req-${requestCounter++}`,
            message: ["SMS sent successfully."],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const app = await loadApp();
    const response = await request(app)
      .post("/api/v1/auth/farmer/request-otp")
      .send({ phone: "+91 98765-43210" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      message: "OTP sent successfully",
      expiresInSeconds: 600,
      resendAvailableInSeconds: 60,
    });

    const challenge = challenges.get("9876543210");
    expect(challenge).toBeDefined();
    expect(challenge?.providerRequestId).toBe("req-1");
    expect(challenge?.providerName).toBe("fast2sms");
    expect(challenge?.otpHash).not.toBe(sentOtps.get("9876543210"));
  });

  test("rejects resend before the 60 second cooldown expires", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as {
          numbers: string;
          variables_values: string;
        };
        sentOtps.set(payload.numbers, payload.variables_values);

        return new Response(
          JSON.stringify({
            return: true,
            request_id: `req-${requestCounter++}`,
            message: ["SMS sent successfully."],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const app = await loadApp();
    await request(app).post("/api/v1/auth/farmer/request-otp").send({ phone: "9876543210" });
    const response = await request(app)
      .post("/api/v1/auth/farmer/request-otp")
      .send({ phone: "9876543210" });

    expect(response.status).toBe(429);
    expect(response.body.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("returns 422 for invalid phone input", async () => {
    const app = await loadApp();
    const response = await request(app)
      .post("/api/v1/auth/farmer/request-otp")
      .send({ phone: "1234" });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Invalid phone number");
    expect(challenges.size).toBe(0);
  });

  test("returns 503 and leaves no challenge when the SMS provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ return: false }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const app = await loadApp();
    const response = await request(app)
      .post("/api/v1/auth/farmer/request-otp")
      .send({ phone: "9876543210" });

    expect(response.status).toBe(503);
    expect(challenges.size).toBe(0);
  });

  test("locks the challenge after five wrong OTP attempts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as {
          numbers: string;
          variables_values: string;
        };
        sentOtps.set(payload.numbers, payload.variables_values);

        return new Response(
          JSON.stringify({
            return: true,
            request_id: `req-${requestCounter++}`,
            message: ["SMS sent successfully."],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const app = await loadApp();
    await request(app).post("/api/v1/auth/farmer/request-otp").send({ phone: "9876543210" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/farmer/verify-otp")
        .send({ phone: "9876543210", otp: "000000" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid or expired OTP");
    }

    const challenge = challenges.get("9876543210");
    expect(challenge?.verifyAttempts).toBe(5);
    expect(challenge?.consumedAt).not.toBeNull();
  });

  test("consumes OTP on success, rejects replay, and reuses an existing farmer on later logins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as {
          numbers: string;
          variables_values: string;
        };
        sentOtps.set(payload.numbers, payload.variables_values);

        return new Response(
          JSON.stringify({
            return: true,
            request_id: `req-${requestCounter++}`,
            message: ["SMS sent successfully."],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const app = await loadApp();
    await request(app).post("/api/v1/auth/farmer/request-otp").send({ phone: "9876543210" });

    const firstOtp = sentOtps.get("9876543210");
    const firstVerify = await request(app)
      .post("/api/v1/auth/farmer/verify-otp")
      .send({ phone: "9876543210", otp: firstOtp });

    expect(firstVerify.status).toBe(200);
    expect(firstVerify.body.data.isNewUser).toBe(true);

    const replay = await request(app)
      .post("/api/v1/auth/farmer/verify-otp")
      .send({ phone: "9876543210", otp: firstOtp });

    expect(replay.status).toBe(400);

    const createdFarmer = farmers.get("9876543210");
    expect(createdFarmer?.id).toBeDefined();

    const existingChallenge = challenges.get("9876543210");
    if (existingChallenge) {
      existingChallenge.resendAvailableAt = new Date(Date.now() - 1000);
      existingChallenge.expiresAt = new Date(Date.now() - 1000);
      challenges.set("9876543210", existingChallenge);
    }

    await request(app).post("/api/v1/auth/farmer/request-otp").send({ phone: "9876543210" });
    const secondOtp = sentOtps.get("9876543210");
    const secondVerify = await request(app)
      .post("/api/v1/auth/farmer/verify-otp")
      .send({ phone: "9876543210", otp: secondOtp });

    expect(secondVerify.status).toBe(200);
    expect(secondVerify.body.data.farmer.id).toBe(createdFarmer?.id);
    expect(mockPrisma.farmer.create).toHaveBeenCalledTimes(1);
  });
});

describe("auth security", () => {
  test("allows cookie-authenticated vendor POSTs only from configured origins", async () => {
    const { signToken } = await loadJwt();
    const app = await loadApp();
    const cookie = `agrisetu_session=${encodeURIComponent(
      signToken({ id: "vendor-1", role: "vendor" }),
    )}`;

    const blocked = await request(app)
      .post("/api/v1/auth/vendor/register/step2")
      .set("Cookie", cookie)
      .set("Origin", "https://evil.example")
      .send({ gstin: "29ABCDE1234F1Z5" });

    expect(blocked.status).toBe(403);
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();

    const allowed = await request(app)
      .post("/api/v1/auth/vendor/register/step2")
      .set("Cookie", cookie)
      .set("Origin", "https://vendor.agrisetu.test")
      .send({ gstin: "29ABCDE1234F1Z5" });

    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://vendor.agrisetu.test",
    );
  });

  test("continues to allow bearer-authenticated farmer requests", async () => {
    farmers.set("9876543210", {
      id: "farmer-1",
      phone: "9876543210",
      name: "Farmer One",
      cropsGrown: [],
      language: "en",
      aadhaarLinked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { signToken } = await loadJwt();
    const app = await loadApp();
    const response = await request(app)
      .get("/api/v1/auth/farmer/me")
      .set("Authorization", `Bearer ${signToken({ id: "farmer-1", role: "farmer" })}`);

    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBe("9876543210");
  });
});
