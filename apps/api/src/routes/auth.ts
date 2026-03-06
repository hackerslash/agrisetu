import { Router, type CookieOptions, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { signToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { error, success } from "../lib/response.js";
import {
  AUTH_SESSION_COOKIE,
  authenticate,
  requireFarmer,
  requireVendor,
} from "../middleware/auth.js";
import { authLimiter } from "../middleware/rate-limit.js";
import { withFarmerAvatarForClient } from "../services/farmer-avatar.js";
import {
  normalizeNotificationPreferences,
  registerFarmerDeviceToken,
  unregisterFarmerDeviceToken,
} from "../services/push-notifications.js";
import { withVendorDocumentsForClient } from "../services/vendor-documents.js";

const router = Router();
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getAuthCookieOptions(): CookieOptions {
  const configuredSameSite = process.env.AUTH_COOKIE_SAMESITE?.toLowerCase();
  const sameSite: "lax" | "strict" | "none" =
    configuredSameSite === "lax" ||
    configuredSameSite === "strict" ||
    configuredSameSite === "none"
      ? configuredSameSite
      : process.env.NODE_ENV === "production"
        ? "none"
        : "lax";

  const secure =
    process.env.AUTH_COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production" ||
    sameSite === "none";

  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    ...(domain ? { domain } : {}),
  };
}

function setAuthSessionCookie(res: Response, token: string) {
  res.cookie(AUTH_SESSION_COOKIE, token, getAuthCookieOptions());
}

function clearAuthSessionCookie(res: Response) {
  const options = getAuthCookieOptions();
  res.clearCookie(AUTH_SESSION_COOKIE, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    ...(options.domain ? { domain: options.domain } : {}),
  });
}

const requestOtpSchema = z.object({
  phone: z.string().min(10),
});

router.post("/farmer/request-otp", authLimiter, async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  success(res, { message: "OTP sent successfully" });
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  otp: z.string(),
});

router.post("/farmer/verify-otp", authLimiter, async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  const { phone, otp } = parsed.data;
  if (otp !== "123456") {
    error(res, "Invalid OTP", 400);
    return;
  }

  try {
    let farmer = await prisma.farmer.findUnique({ where: { phone } });
    if (!farmer) {
      farmer = await prisma.farmer.create({ data: { phone } });
    }

    const token = signToken({ id: farmer.id, role: "farmer" });
    setAuthSessionCookie(res, token);

    const farmerForClient = await withFarmerAvatarForClient(farmer);
    success(res, { token, farmer: farmerForClient, isNewUser: !farmer.name });
  } catch {
    error(res, "Internal server error", 500);
  }
});

const farmerProfileSchema = z.object({
  name: z.string().min(1),
  village: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  locationAddress: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  landArea: z.number().optional(),
  cropsGrown: z.array(z.string()).optional(),
  upiId: z.string().optional(),
  language: z.string().optional(),
  aadhaarLinked: z.boolean().optional(),
});

const farmerNotificationDeviceSchema = z.object({
  token: z.string().min(20),
  platform: z.literal("ANDROID").default("ANDROID"),
  preferences: z.record(z.boolean()).optional(),
});

router.get("/farmer/me", authenticate, requireFarmer, async (req, res) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
    });
    if (!farmer) {
      error(res, "Farmer not found", 404);
      return;
    }

    success(res, await withFarmerAvatarForClient(farmer));
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post(
  "/farmer/profile",
  authenticate,
  requireFarmer,
  async (req, res) => {
    const parsed = farmerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, "Invalid request", 422, parsed.error.flatten());
      return;
    }

    try {
      const farmer = await prisma.farmer.update({
        where: { id: req.user!.id },
        data: parsed.data,
      });
      success(res, await withFarmerAvatarForClient(farmer));
    } catch {
      error(res, "Internal server error", 500);
    }
  },
);

router.post(
  "/farmer/notification-device",
  authenticate,
  requireFarmer,
  async (req, res) => {
    const parsed = farmerNotificationDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, "Invalid request", 422, parsed.error.flatten());
      return;
    }

    try {
      const device = await registerFarmerDeviceToken({
        farmerId: req.user!.id,
        token: parsed.data.token,
        preferences: normalizeNotificationPreferences(parsed.data.preferences),
      });
      success(res, {
        id: device.id,
        token: device.token,
        platform: device.platform,
        lastSeenAt: device.lastSeenAt,
      });
    } catch {
      error(res, "Unable to register notification device", 500);
    }
  },
);

router.delete(
  "/farmer/notification-device",
  authenticate,
  requireFarmer,
  async (req, res) => {
    const parsed = farmerNotificationDeviceSchema.pick({ token: true }).safeParse(
      req.body,
    );
    if (!parsed.success) {
      error(res, "Invalid request", 422, parsed.error.flatten());
      return;
    }

    try {
      await unregisterFarmerDeviceToken({
        farmerId: req.user!.id,
        token: parsed.data.token,
      });
      success(res, { removed: true });
    } catch {
      error(res, "Unable to unregister notification device", 500);
    }
  },
);

const vendorStep1Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.string().min(10),
  state: z.string().optional(),
  businessType: z.string().optional(),
  locationAddress: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  serviceRadiusKm: z.number().positive().max(500).optional(),
});

router.post("/vendor/register/step1", authLimiter, async (req, res) => {
  const parsed = vendorStep1Schema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  const { email, password, ...rest } = parsed.data;

  try {
    const existing = await prisma.vendor.findUnique({ where: { email } });
    if (existing) {
      error(res, "Email already registered", 400);
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const vendor = await prisma.vendor.create({
      data: { email, password: hashed, ...rest },
      select: {
        id: true,
        email: true,
        businessName: true,
        contactName: true,
        phone: true,
        state: true,
        businessType: true,
        locationAddress: true,
        latitude: true,
        longitude: true,
        serviceRadiusKm: true,
        isVerified: true,
        createdAt: true,
      },
    });

    const token = signToken({ id: vendor.id, role: "vendor" });
    setAuthSessionCookie(res, token);
    success(res, { vendor, token }, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const vendorStep2Schema = z.object({
  gstin: z
    .string()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
      "Invalid GSTIN format",
    ),
  pan: z.string().optional(),
});

router.post("/vendor/register/step2", authenticate, async (req, res) => {
  const parsed = vendorStep2Schema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  try {
    const vendor = await prisma.vendor.update({
      where: { id: req.user!.id },
      data: { ...parsed.data, isVerified: true },
      select: {
        id: true,
        email: true,
        businessName: true,
        gstin: true,
        pan: true,
        isVerified: true,
      },
    });
    success(res, { vendor, verified: true });
  } catch {
    error(res, "Internal server error", 500);
  }
});

const vendorStep3Schema = z.object({
  documents: z.array(
    z.object({
      docType: z.enum(["PAN", "GST", "QUALITY_CERT"]),
      fileUrl: z.string(),
    }),
  ),
});

router.post("/vendor/register/step3", authenticate, async (req, res) => {
  const parsed = vendorStep3Schema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  try {
    const docs = await prisma.$transaction(async (tx) => {
      const upserted: Array<{
        id: string;
        vendorId: string;
        docType: "PAN" | "GST" | "QUALITY_CERT";
        fileUrl: string;
        uploadedAt: Date;
      }> = [];

      for (const doc of parsed.data.documents) {
        await tx.vendorDocument.deleteMany({
          where: { vendorId: req.user!.id, docType: doc.docType },
        });
        const created = await tx.vendorDocument.create({
          data: { vendorId: req.user!.id, ...doc },
        });
        upserted.push(created);
      }

      return upserted;
    });

    const docsForClient = await Promise.all(
      docs.map((doc) => withVendorDocumentsForClient({ documents: [doc] })),
    );

    const normalizedDocs = docsForClient
      .map((vendor) => vendor.documents?.[0])
      .filter(Boolean);
    success(res, { documents: normalizedDocs }, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const vendorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/vendor/login", authLimiter, async (req, res) => {
  const parsed = vendorLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { email: parsed.data.email },
    });
    if (!vendor) {
      error(res, "Invalid credentials", 401);
      return;
    }

    const valid = await bcrypt.compare(parsed.data.password, vendor.password);
    if (!valid) {
      error(res, "Invalid credentials", 401);
      return;
    }

    const token = signToken({ id: vendor.id, role: "vendor" });
    setAuthSessionCookie(res, token);
    const { password: _password, ...vendorData } = vendor;
    success(res, { token, vendor: vendorData });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/vendor/me", authenticate, requireVendor, async (req, res) => {
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
        locationAddress: true,
        latitude: true,
        longitude: true,
        serviceRadiusKm: true,
        isVerified: true,
        createdAt: true,
        documents: true,
      },
    });
    if (!vendor) {
      error(res, "Vendor not found", 404);
      return;
    }

    success(res, await withVendorDocumentsForClient(vendor));
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post("/logout", (_req, res) => {
  clearAuthSessionCookie(res);
  success(res, { loggedOut: true });
});

export default router;
