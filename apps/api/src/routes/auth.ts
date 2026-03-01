import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import {
  authenticate,
  requireFarmer,
  requireVendor,
} from "../middleware/auth.js";
import { success, error } from "../lib/response.js";

const router = Router();

// ─── Farmer Auth ──────────────────────────────────────────────────────────────

const requestOtpSchema = z.object({
  phone: z.string().min(10),
});

router.post("/farmer/request-otp", async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }
  const { phone } = parsed.data;
  console.log(`OTP for ${phone}: 123456`);
  success(res, { message: "OTP sent successfully" });
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  otp: z.string(),
});

router.post("/farmer/verify-otp", async (req, res) => {
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
    success(res, { token, farmer, isNewUser: !farmer.name });
  } catch (err) {
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

router.get("/farmer/me", authenticate, requireFarmer, async (req, res) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { id: req.user!.id },
    });
    if (!farmer) {
      error(res, "Farmer not found", 404);
      return;
    }
    success(res, farmer);
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
      success(res, farmer);
    } catch {
      error(res, "Internal server error", 500);
    }
  },
);

// ─── Vendor Auth ──────────────────────────────────────────────────────────────

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

router.post("/vendor/register/step1", async (req, res) => {
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
    const docs = await prisma.$transaction(
      parsed.data.documents.map((doc) =>
        prisma.vendorDocument.create({
          data: { vendorId: req.user!.id, ...doc },
        }),
      ),
    );
    success(res, { documents: docs }, 201);
  } catch {
    error(res, "Internal server error", 500);
  }
});

const vendorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/vendor/login", async (req, res) => {
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
    const { password: _pwd, ...vendorData } = vendor;
    success(res, { token, vendor: vendorData });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/vendor/me", authenticate, async (req, res) => {
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
    success(res, vendor);
  } catch {
    error(res, "Internal server error", 500);
  }
});

export default router;
