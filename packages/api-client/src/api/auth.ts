import {
  clearAuthToken,
  getApiBaseUrl,
  getApiClient,
  getAuthToken,
} from "../client";
import type { Vendor } from "../types";

export async function registerStep1(data: {
  email: string;
  password: string;
  businessName: string;
  contactName: string;
  phone: string;
  state?: string;
  businessType?: string;
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm?: number;
}): Promise<{ vendor: Vendor; token: string }> {
  const res = await getApiClient().post("/auth/vendor/register/step1", data);
  return res.data.data as { vendor: Vendor; token: string };
}

export async function registerStep2(data: {
  gstin: string;
  pan?: string;
}): Promise<{ vendor: Vendor; verified: boolean }> {
  const res = await getApiClient().post("/auth/vendor/register/step2", data);
  return res.data.data as { vendor: Vendor; verified: boolean };
}

export async function registerStep3(data: {
  documents: { docType: "PAN" | "GST" | "QUALITY_CERT"; fileUrl: string }[];
}): Promise<{ documents: unknown[]; message: string }> {
  const res = await getApiClient().post("/auth/vendor/register/step3", data);
  return res.data.data as { documents: unknown[]; message: string };
}

export async function uploadRegistrationDocument(
  docType: "PAN" | "GST" | "QUALITY_CERT",
  file: File,
) {
  const formData = new FormData();
  formData.append("docType", docType);
  formData.append("file", file);

  const res = await getApiClient().post(
    "/auth/vendor/register/document-upload",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return res.data.data as unknown;
}

export async function login(data: {
  email: string;
  password: string;
}): Promise<{ token: string; vendor: Vendor }> {
  const res = await getApiClient().post("/auth/vendor/login", data);
  return res.data.data as { token: string; vendor: Vendor };
}

export async function getMe(): Promise<Vendor> {
  const res = await getApiClient().get("/auth/vendor/me");
  return res.data.data as Vendor;
}

export async function getSession(): Promise<Vendor | null> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getAuthToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${getApiBaseUrl()}/auth/vendor/me`, {
    method: "GET",
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    clearAuthToken();
    return null;
  }

  if (!res.ok) {
    throw new Error(`Unable to verify vendor session (${res.status})`);
  }

  const payload = (await res.json()) as { data: Vendor };
  return payload.data;
}

export async function logout(): Promise<void> {
  try {
    await getApiClient().post("/auth/logout");
  } finally {
    clearAuthToken();
  }
}
