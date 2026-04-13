import { getApiClient } from "../client";
import type {
  AdminVendorListResponse,
  Vendor,
  VendorStatus,
} from "../types";

export async function getVendors(
  status?: VendorStatus,
): Promise<AdminVendorListResponse> {
  const res = await getApiClient().get("/admin/vendors", {
    params: status ? { status } : undefined,
  });
  return res.data.data as AdminVendorListResponse;
}

export async function getVendorDetail(id: string): Promise<Vendor> {
  const res = await getApiClient().get(`/admin/vendors/${id}`);
  return res.data.data as Vendor;
}

export async function approveVendor(id: string): Promise<Vendor> {
  const res = await getApiClient().post(`/admin/vendors/${id}/approve`);
  return res.data.data as Vendor;
}

export async function rejectVendor(
  id: string,
  reviewNote: string,
): Promise<Vendor> {
  const res = await getApiClient().post(`/admin/vendors/${id}/reject`, {
    reviewNote,
  });
  return res.data.data as Vendor;
}

export async function suspendVendor(
  id: string,
  reviewNote: string,
): Promise<Vendor> {
  const res = await getApiClient().post(`/admin/vendors/${id}/suspend`, {
    reviewNote,
  });
  return res.data.data as Vendor;
}

export async function reactivateVendor(id: string): Promise<Vendor> {
  const res = await getApiClient().post(`/admin/vendors/${id}/reactivate`);
  return res.data.data as Vendor;
}
