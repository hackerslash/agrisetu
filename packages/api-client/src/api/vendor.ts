import { getApiClient } from "../client";
import type {
  DocType,
  Vendor,
  VendorDocument,
  Gig,
  Cluster,
  VendorBid,
  AnalyticsData,
  PaymentSummary,
  VendorPaymentRow,
} from "../types";

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<Vendor> {
  const res = await getApiClient().get("/vendor/profile");
  return res.data.data as Vendor;
}

export async function updateProfile(data: Partial<Vendor>): Promise<Vendor> {
  const res = await getApiClient().patch("/vendor/profile", data);
  return res.data.data as Vendor;
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await getApiClient().patch("/vendor/profile/password", data);
}

export async function uploadDocument(
  docType: DocType,
  file: File,
): Promise<VendorDocument> {
  const formData = new FormData();
  formData.append("docType", docType);
  formData.append("file", file);

  const res = await getApiClient().post("/vendor/documents/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as VendorDocument;
}

// ─── Gigs ─────────────────────────────────────────────────────────────────────

export async function getGigs(status?: string): Promise<Gig[]> {
  const params = status ? { status } : {};
  const res = await getApiClient().get("/vendor/gigs", { params });
  return res.data.data as Gig[];
}

export async function createGig(data: {
  cropName: string;
  variety?: string;
  unit: string;
  minQuantity: number;
  pricePerUnit: number;
  availableQuantity: number;
  description?: string;
  status?: "DRAFT" | "PUBLISHED";
}): Promise<Gig> {
  const res = await getApiClient().post("/vendor/gigs", data);
  return res.data.data as Gig;
}

export async function updateGig(id: string, data: Partial<Gig>): Promise<Gig> {
  const res = await getApiClient().patch(`/vendor/gigs/${id}`, data);
  return res.data.data as Gig;
}

export async function deleteGig(id: string): Promise<void> {
  await getApiClient().delete(`/vendor/gigs/${id}`);
}

// ─── Clusters ─────────────────────────────────────────────────────────────────

export async function getClusters(): Promise<Cluster[]> {
  const res = await getApiClient().get("/vendor/clusters");
  return res.data.data as Cluster[];
}

export async function placeBid(
  clusterId: string,
  data: {
    gigId?: string;
    pricePerUnit: number;
    note?: string;
  },
): Promise<VendorBid> {
  const res = await getApiClient().post(
    `/vendor/clusters/${clusterId}/bid`,
    data,
  );
  return res.data.data as VendorBid;
}

export async function getBids(): Promise<VendorBid[]> {
  const res = await getApiClient().get("/vendor/bids");
  return res.data.data as VendorBid[];
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function getOrders(): Promise<Cluster[]> {
  const res = await getApiClient().get("/vendor/orders");
  return res.data.data as Cluster[];
}

export async function getOrderDetail(id: string): Promise<Cluster> {
  const res = await getApiClient().get(`/vendor/orders/${id}`);
  return res.data.data as Cluster;
}

export async function acceptOrder(id: string): Promise<void> {
  await getApiClient().patch(`/vendor/orders/${id}/accept`);
}

export async function rejectOrder(
  id: string,
  data: {
    reason: string;
    note?: string;
    proofUrls: string[];
    acknowledgeRatingImpact: true;
    acknowledgeRefund: true;
  },
): Promise<void> {
  await getApiClient().post(`/vendor/orders/${id}/reject`, data);
}

export async function uploadOrderRejectProof(
  id: string,
  file: File,
): Promise<{ fileUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await getApiClient().post(
    `/vendor/orders/${id}/reject/proofs`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return res.data.data as { fileUrl: string };
}

export async function processOrder(id: string): Promise<void> {
  await getApiClient().patch(`/vendor/orders/${id}/process`);
}

export async function outForDeliveryOrder(id: string): Promise<void> {
  await getApiClient().patch(`/vendor/orders/${id}/out-for-delivery`);
}

export async function dispatchOrder(id: string): Promise<void> {
  await getApiClient().patch(`/vendor/orders/${id}/dispatch`);
}

export async function deliverOrder(id: string): Promise<void> {
  await getApiClient().patch(`/vendor/orders/${id}/deliver`);
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getPayments(): Promise<VendorPaymentRow[]> {
  const res = await getApiClient().get("/vendor/payments");
  return res.data.data as VendorPaymentRow[];
}

export async function getPaymentSummary(): Promise<PaymentSummary> {
  const res = await getApiClient().get("/vendor/payments/summary");
  return res.data.data as PaymentSummary;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalytics(
  period?: "7d" | "30d" | "90d",
): Promise<AnalyticsData> {
  const params = period ? { period } : {};
  const res = await getApiClient().get("/vendor/analytics", { params });
  return res.data.data as AnalyticsData;
}
