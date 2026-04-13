import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { error, success } from "../lib/response.js";
import {
  authenticate,
  requireSuperadmin,
  requireTrustedOriginForSessionAuth,
} from "../middleware/auth.js";
import { vendorAccountSelect } from "../services/vendor-accounts.js";
import { withVendorDocumentsForClient } from "../services/vendor-documents.js";
import { notifyVendorStatusChanged } from "../services/vendor-status-notifications.js";

const router = Router();

router.use(authenticate, requireTrustedOriginForSessionAuth, requireSuperadmin);

const vendorStatusSchema = z.enum([
  "ONBOARDING",
  "PENDING_REVIEW",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
]);

const reviewActionSchema = z.object({
  reviewNote: z
    .string()
    .trim()
    .min(1, "Review note is required")
    .max(1000, "Review note is too long"),
});

async function buildVendorSummary() {
  const [pending, active, rejected, suspended] = await Promise.all([
    prisma.vendor.count({
      where: { role: "VENDOR", status: "PENDING_REVIEW" },
    }),
    prisma.vendor.count({
      where: { role: "VENDOR", status: "ACTIVE" },
    }),
    prisma.vendor.count({
      where: { role: "VENDOR", status: "REJECTED" },
    }),
    prisma.vendor.count({
      where: { role: "VENDOR", status: "SUSPENDED" },
    }),
  ]);

  return { pending, active, rejected, suspended };
}

async function updateVendorReview(params: {
  vendorId: string;
  status: "ACTIVE" | "REJECTED" | "SUSPENDED";
  reviewedById: string;
  reviewNote?: string;
}) {
  const vendor = await prisma.vendor.update({
    where: { id: params.vendorId },
    data: {
      status: params.status,
      isVerified: params.status === "ACTIVE",
      reviewedAt: new Date(),
      reviewedById: params.reviewedById,
      reviewNote: params.reviewNote ?? null,
    },
    select: vendorAccountSelect,
  });

  await notifyVendorStatusChanged({
    email: vendor.email,
    businessName: vendor.businessName,
    status: vendor.status,
    reviewNote: vendor.reviewNote,
  });

  return vendor;
}

router.get("/vendors", async (req, res) => {
  const parsed = z
    .object({ status: vendorStatusSchema.optional() })
    .safeParse(req.query);

  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  try {
    const [summary, vendors] = await Promise.all([
      buildVendorSummary(),
      prisma.vendor.findMany({
        where: {
          role: "VENDOR",
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
        },
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
          status: true,
          isVerified: true,
          submittedAt: true,
          reviewedAt: true,
          reviewNote: true,
          createdAt: true,
        },
        orderBy: [
          { submittedAt: "desc" },
          { reviewedAt: "desc" },
          { createdAt: "desc" },
        ],
      }),
    ]);

    success(res, { summary, vendors });
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.get("/vendors/:id", async (req, res) => {
  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, role: "VENDOR" },
      select: vendorAccountSelect,
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

router.post("/vendors/:id/approve", async (req, res) => {
  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, role: "VENDOR" },
      select: { id: true },
    });

    if (!vendor) {
      error(res, "Vendor not found", 404);
      return;
    }

    const updated = await updateVendorReview({
      vendorId: req.params.id,
      status: "ACTIVE",
      reviewedById: req.user!.id,
    });

    success(res, updated);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post("/vendors/:id/reject", async (req, res) => {
  const parsed = reviewActionSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, role: "VENDOR" },
      select: { id: true },
    });

    if (!vendor) {
      error(res, "Vendor not found", 404);
      return;
    }

    const updated = await updateVendorReview({
      vendorId: req.params.id,
      status: "REJECTED",
      reviewNote: parsed.data.reviewNote,
      reviewedById: req.user!.id,
    });

    success(res, updated);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post("/vendors/:id/suspend", async (req, res) => {
  const parsed = reviewActionSchema.safeParse(req.body);
  if (!parsed.success) {
    error(res, "Invalid request", 422, parsed.error.flatten());
    return;
  }

  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, role: "VENDOR" },
      select: { id: true },
    });

    if (!vendor) {
      error(res, "Vendor not found", 404);
      return;
    }

    const updated = await updateVendorReview({
      vendorId: req.params.id,
      status: "SUSPENDED",
      reviewNote: parsed.data.reviewNote,
      reviewedById: req.user!.id,
    });

    success(res, updated);
  } catch {
    error(res, "Internal server error", 500);
  }
});

router.post("/vendors/:id/reactivate", async (req, res) => {
  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, role: "VENDOR" },
      select: { id: true },
    });

    if (!vendor) {
      error(res, "Vendor not found", 404);
      return;
    }

    const updated = await updateVendorReview({
      vendorId: req.params.id,
      status: "ACTIVE",
      reviewedById: req.user!.id,
    });

    success(res, updated);
  } catch {
    error(res, "Internal server error", 500);
  }
});

export default router;
