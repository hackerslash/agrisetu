import { getApiClient } from "../client";
import type {
  Farmer,
  Order,
  Cluster,
  VendorBid,
  Payment,
  Delivery,
  Rating,
} from "../types";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function farmerSendOtp(
  phone: string,
): Promise<{ message: string }> {
  const res = await getApiClient().post("/auth/farmer/request-otp", { phone });
  return res.data.data as { message: string };
}

export async function farmerVerifyOtp(
  phone: string,
  otp: string,
): Promise<{ token: string; farmer: Farmer; isNew: boolean }> {
  const res = await getApiClient().post("/auth/farmer/verify-otp", {
    phone,
    otp,
  });
  return res.data.data as { token: string; farmer: Farmer; isNew: boolean };
}

export async function farmerGetMe(): Promise<Farmer> {
  const res = await getApiClient().get("/auth/farmer/me");
  return res.data.data as Farmer;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function farmerUpdateProfile(data: {
  name?: string;
  village?: string;
  district?: string;
  state?: string;
  landArea?: number;
  cropsGrown?: string[];
  upiId?: string;
  language?: string;
}): Promise<Farmer> {
  const res = await getApiClient().patch("/farmer/profile", data);
  return res.data.data as Farmer;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function farmerCreateOrder(data: {
  cropName: string;
  quantity: number;
  unit: string;
  deliveryDate?: string;
  deliveryLocation?: string;
  specialInstructions?: string;
}): Promise<Order> {
  const res = await getApiClient().post("/farmer/orders", data);
  return res.data.data as Order;
}

export async function farmerGetOrders(): Promise<Order[]> {
  const res = await getApiClient().get("/farmer/orders");
  return res.data.data as Order[];
}

export async function farmerGetOrder(orderId: string): Promise<Order> {
  const res = await getApiClient().get(`/farmer/orders/${orderId}`);
  return res.data.data as Order;
}

export async function farmerGetOrderClusterOptions(
  orderId: string,
): Promise<Cluster[]> {
  const res = await getApiClient().get(`/farmer/orders/${orderId}/cluster-options`);
  return res.data.data as Cluster[];
}

export async function farmerAssignOrderCluster(
  orderId: string,
  data: { clusterId?: string; createNew?: boolean },
): Promise<Order> {
  const res = await getApiClient().post(
    `/farmer/orders/${orderId}/assign-cluster`,
    data,
  );
  return res.data.data as Order;
}

// ─── Clusters ─────────────────────────────────────────────────────────────────

export async function farmerGetClusters(): Promise<Cluster[]> {
  const res = await getApiClient().get("/farmer/clusters");
  return res.data.data as Cluster[];
}

export async function farmerGetCluster(clusterId: string): Promise<Cluster> {
  const res = await getApiClient().get(`/farmer/clusters/${clusterId}`);
  return res.data.data as Cluster;
}

export async function farmerVoteOnBid(
  clusterId: string,
  bidId: string,
): Promise<VendorBid> {
  const res = await getApiClient().post(`/farmer/clusters/${clusterId}/vote`, {
    vendorBidId: bidId,
  });
  return res.data.data as VendorBid;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function farmerInitiatePayment(
  clusterId: string,
): Promise<{ upiRef: string; amount: number; clusterId: string }> {
  const res = await getApiClient().post("/farmer/payments/initiate", {
    clusterId,
  });
  return res.data.data as { upiRef: string; amount: number; clusterId: string };
}

export async function farmerConfirmPayment(
  clusterId: string,
  upiRef: string,
): Promise<{ confirmed: boolean }> {
  const res = await getApiClient().post("/farmer/payments/confirm", {
    clusterId,
    upiRef,
  });
  return res.data.data as { confirmed: boolean };
}

/** @deprecated Use farmerInitiatePayment + farmerConfirmPayment instead */
export async function farmerPayForCluster(
  clusterId: string,
  upiRef?: string,
): Promise<Payment> {
  if (upiRef) {
    // confirm flow
    const res = await getApiClient().post("/farmer/payments/confirm", {
      clusterId,
      upiRef,
    });
    return res.data.data as Payment;
  }
  // initiate flow
  const res = await getApiClient().post("/farmer/payments/initiate", {
    clusterId,
  });
  return res.data.data as Payment;
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

export async function farmerGetDelivery(clusterId: string): Promise<Delivery> {
  const res = await getApiClient().get(`/farmer/delivery/${clusterId}`);
  return res.data.data as Delivery;
}

export async function farmerConfirmDelivery(
  clusterId: string,
): Promise<Delivery> {
  const res = await getApiClient().post(
    `/farmer/delivery/${clusterId}/confirm`,
  );
  return res.data.data as Delivery;
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

export async function farmerSubmitRating(data: {
  vendorId: string;
  clusterId: string;
  score: number;
  tags?: string[];
  comment?: string;
}): Promise<Rating> {
  const res = await getApiClient().post("/farmer/ratings", data);
  return res.data.data as Rating;
}
