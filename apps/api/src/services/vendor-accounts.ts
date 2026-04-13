import type { VendorStatus, VendorRole } from "@prisma/client";

export const vendorAccountSelect = {
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
  role: true,
  status: true,
  isVerified: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedById: true,
  reviewNote: true,
  createdAt: true,
  documents: true,
} as const;

export function canAccessVendorPortal(params: {
  role: VendorRole;
  status: VendorStatus;
}) {
  if (params.role === "SUPERADMIN") {
    return true;
  }

  return params.status === "ACTIVE";
}

export function getVendorBlockedMessage(params: {
  status: VendorStatus;
  reviewNote?: string | null;
}) {
  switch (params.status) {
    case "ONBOARDING":
      return "Complete your registration before signing in.";
    case "PENDING_REVIEW":
      return "Your registration is in progress. You will be notified after review.";
    case "REJECTED":
      return params.reviewNote?.trim()
        ? `Your registration was rejected. ${params.reviewNote.trim()}`
        : "Your registration was rejected. Please contact support.";
    case "SUSPENDED":
      return params.reviewNote?.trim()
        ? `Your account is temporarily suspended. ${params.reviewNote.trim()}`
        : "Your account is temporarily suspended. Please contact support.";
    case "ACTIVE":
    default:
      return null;
  }
}

export function normalizeVendorVerificationStatus(status: VendorStatus) {
  return status === "ACTIVE";
}
