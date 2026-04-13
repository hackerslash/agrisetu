import type { VendorStatus } from "@prisma/client";

type VendorStatusNotificationParams = {
  email: string;
  businessName: string;
  status: VendorStatus;
  reviewNote?: string | null;
};

// Placeholder hook for future transactional email delivery.
export async function notifyVendorStatusChanged(
  _params: VendorStatusNotificationParams,
) {
  return;
}
