"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Upload, AlertTriangle, LocateFixed } from "lucide-react";

function Toggle({ defaultChecked = true }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      className="relative rounded-full transition-colors flex-shrink-0"
      style={{
        width: 44,
        height: 24,
        backgroundColor: on ? "#2C5F2D" : "#EDE8DF",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        className="absolute top-1 rounded-full bg-white shadow transition-all"
        style={{
          width: 16,
          height: 16,
          left: on ? 24 : 4,
        }}
      />
    </button>
  );
}
import { vendorApi, authApi } from "@repo/api-client";
import type { Vendor, DocType, VendorDocument } from "@repo/api-client";

const VENDOR_DOC_CONFIG: Array<{ docType: DocType; label: string }> = [
  { docType: "PAN", label: "PAN Card" },
  { docType: "GST", label: "GST Certificate" },
  { docType: "QUALITY_CERT", label: "Quality Certificate" },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  businessName: z.string().min(1, "Required"),
  contactName: z.string().min(1, "Required"),
  phone: z.string().min(10, "Valid phone required"),
  state: z.string().optional(),
  businessType: z.string().optional(),
  locationAddress: z.string().optional(),
  latitude: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(-90).max(90).optional(),
  ),
  longitude: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(-180).max(180).optional(),
  ),
  serviceRadiusKm: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().positive("Radius must be > 0").max(500).optional(),
  ),
});
type ProfileFormData = z.infer<typeof profileSchema>;
type ProfileFormInput = z.input<typeof profileSchema>;
type ReverseGeocodeResult = {
  display_name?: string;
  address?: {
    state?: string;
  };
};

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(8, "Min. 8 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type PasswordFormData = z.infer<typeof passwordSchema>;

// ─── Subcomponent: Input ──────────────────────────────────────────────────────

function FormInput({
  label,
  error,
  type = "text",
  placeholder,
  ...props
}: {
  label: string;
  error?: string;
  type?: string;
  placeholder?: string;
  [key: string]: unknown;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full outline-none"
        style={{
          backgroundColor: "#EDE8DF",
          borderRadius: 14,
          height: 52,
          padding: "0 16px",
          fontSize: 14,
          color: "#1A1A1A",
          border: error ? "1.5px solid #EF4444" : "1.5px solid transparent",
        }}
        {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      {error && <p style={{ fontSize: 12, color: "#EF4444" }}>{error}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SettingsContent() {
  const queryClient = useQueryClient();
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [documentSuccess, setDocumentSuccess] = useState("");
  const [uploadingDocType, setUploadingDocType] = useState<DocType | null>(
    null,
  );
  const [locating, setLocating] = useState(false);

  const { data: vendor, isLoading } = useQuery({
    queryKey: ["vendor-profile"],
    queryFn: () => authApi.getMe(),
  });

  const profileForm = useForm<ProfileFormInput, unknown, ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: vendor
      ? {
          businessName: vendor.businessName,
          contactName: vendor.contactName,
          phone: vendor.phone,
          state: vendor.state ?? "",
          businessType: vendor.businessType ?? "",
          locationAddress: vendor.locationAddress ?? "",
          latitude: vendor.latitude ?? undefined,
          longitude: vendor.longitude ?? undefined,
          serviceRadiusKm: vendor.serviceRadiusKm ?? 25,
        }
      : undefined,
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<Vendor>) => vendorApi.updateProfile(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vendor-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-me"] });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      vendorApi.changePassword(data),
    onSuccess: () => {
      passwordForm.reset();
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: ({ docType, file }: { docType: DocType; file: File }) =>
      vendorApi.uploadDocument(docType, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vendor-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-me"] });
    },
  });

  async function onProfileSubmit(data: ProfileFormData) {
    setProfileError("");
    try {
      await updateProfileMutation.mutateAsync(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setProfileError(e.response?.data?.error ?? "Update failed");
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setProfileError("Browser geolocation is not available");
      return;
    }
    setProfileError("");
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        },
      );

      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));

      profileForm.setValue("latitude", latitude);
      profileForm.setValue("longitude", longitude);

      let resolvedAddress: string | undefined;
      try {
        const reverseGeocode = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2`,
        );
        if (reverseGeocode.ok) {
          const data = (await reverseGeocode.json()) as ReverseGeocodeResult;
          if (data.display_name?.trim()) {
            resolvedAddress = data.display_name.trim();
          }
          if (!profileForm.getValues("state")?.trim() && data.address?.state) {
            profileForm.setValue("state", data.address.state.trim());
          }
        }
      } catch {
        // Coordinates remain captured even if reverse geocoding fails.
      }

      if (resolvedAddress) {
        profileForm.setValue("locationAddress", resolvedAddress);
      } else if (!profileForm.getValues("locationAddress")?.trim()) {
        setProfileError(
          "Location captured, but address could not be resolved. Please enter address manually.",
        );
      }
    } catch {
      setProfileError(
        "Unable to fetch your location. Please allow browser location permission.",
      );
    } finally {
      setLocating(false);
    }
  }

  async function onPasswordSubmit(data: PasswordFormData) {
    setPasswordError("");
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setPasswordError(e.response?.data?.error ?? "Password change failed");
    }
  }

  async function onDocumentSelected(docType: DocType, file?: File) {
    if (!file) return;
    setDocumentError("");
    setDocumentSuccess("");
    setUploadingDocType(docType);
    try {
      await uploadDocumentMutation.mutateAsync({ docType, file });
      setDocumentSuccess(
        `${docType === "PAN" ? "PAN Card" : docType === "GST" ? "GST Certificate" : "Quality Certificate"} uploaded successfully.`,
      );
      setTimeout(() => setDocumentSuccess(""), 3000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setDocumentError(e.response?.data?.error ?? "Document upload failed");
    } finally {
      setUploadingDocType(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left column */}
      <div className="flex-1 flex flex-col gap-5">
        {/* Business profile */}
        <div className="bg-white rounded-2xl" style={{ padding: 24 }}>
          <h3
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 16,
              fontWeight: 700,
              color: "#1A1A1A",
              marginBottom: 20,
            }}
          >
            Business Profile
          </h3>

          {profileSuccess && (
            <div
              className="mb-4 rounded-xl p-3"
              style={{
                backgroundColor: "#D1FAE5",
                color: "#065F46",
                fontSize: 13,
              }}
            >
              Profile updated successfully!
            </div>
          )}
          {profileError && (
            <div
              className="mb-4 rounded-xl p-3"
              style={{
                backgroundColor: "#FEF2F2",
                color: "#B03A2E",
                fontSize: 13,
              }}
            >
              {profileError}
            </div>
          )}

          <form
            onSubmit={profileForm.handleSubmit(onProfileSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="flex gap-4">
              <div className="flex-1">
                <FormInput
                  label="Business Name"
                  error={profileForm.formState.errors.businessName?.message}
                  {...profileForm.register("businessName")}
                />
              </div>
              <div className="flex-1">
                <FormInput
                  label="Contact Person"
                  error={profileForm.formState.errors.contactName?.message}
                  {...profileForm.register("contactName")}
                />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <FormInput
                  label="Phone"
                  error={profileForm.formState.errors.phone?.message}
                  {...profileForm.register("phone")}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label
                  style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
                >
                  State
                </label>
                <select
                  {...profileForm.register("state")}
                  className="w-full outline-none"
                  style={{
                    backgroundColor: "#EDE8DF",
                    borderRadius: 14,
                    height: 52,
                    padding: "0 16px",
                    fontSize: 14,
                    color: "#1A1A1A",
                    border: "1.5px solid transparent",
                  }}
                >
                  <option value="">Select state</option>
                  {[
                    "Maharashtra",
                    "Karnataka",
                    "Uttar Pradesh",
                    "Punjab",
                    "Gujarat",
                    "Rajasthan",
                    "Madhya Pradesh",
                    "Tamil Nadu",
                    "Andhra Pradesh",
                    "Telangana",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Business Type
              </label>
              <select
                {...profileForm.register("businessType")}
                className="w-full outline-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 14,
                  height: 52,
                  padding: "0 16px",
                  fontSize: 14,
                  color: "#1A1A1A",
                  border: "1.5px solid transparent",
                }}
              >
                <option value="">Select type</option>
                <option value="MANUFACTURER">Manufacturer</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="RETAILER">Retailer</option>
                <option value="WHOLESALER">Wholesaler</option>
              </select>
            </div>
            <FormInput
              label="Business Location Address"
              placeholder="Street, Village/Town, District"
              error={profileForm.formState.errors.locationAddress?.message}
              {...profileForm.register("locationAddress")}
            />
            <input type="hidden" {...profileForm.register("latitude")} />
            <input type="hidden" {...profileForm.register("longitude")} />
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <FormInput
                  label="Service Radius (km)"
                  type="number"
                  placeholder="25"
                  error={profileForm.formState.errors.serviceRadiusKm?.message}
                  step="1"
                  {...profileForm.register("serviceRadiusKm")}
                />
              </div>
              <button
                type="button"
                onClick={useCurrentLocation}
                className="flex items-center justify-center gap-2 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#EDE8DF",
                  color: "#1A1A1A",
                  height: 48,
                  padding: "0 16px",
                  fontSize: 13,
                }}
              >
                <LocateFixed size={16} />
                {locating ? "Fetching..." : "Fetch location"}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#A0A0A0" }}
              >
                Email (read-only)
              </label>
              <div
                className="flex items-center"
                style={{
                  backgroundColor: "#F7F5F0",
                  borderRadius: 14,
                  height: 52,
                  padding: "0 16px",
                  fontSize: 14,
                  color: "#A0A0A0",
                }}
              >
                {vendor?.email}
              </div>
            </div>
            <button
              type="submit"
              disabled={profileForm.formState.isSubmitting}
              className="rounded-xl font-semibold"
              style={{
                backgroundColor: "#2C5F2D",
                color: "white",
                height: 48,
                fontSize: 14,
                fontFamily: "Plus Jakarta Sans",
              }}
            >
              {profileForm.formState.isSubmitting ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>

        {/* Certifications */}
        <div className="bg-white rounded-2xl" style={{ padding: 24 }}>
          <h3
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 16,
              fontWeight: 700,
              color: "#1A1A1A",
              marginBottom: 16,
            }}
          >
            Documents & Certifications
          </h3>
          {documentSuccess && (
            <div
              className="mb-4 rounded-xl p-3"
              style={{
                backgroundColor: "#D1FAE5",
                color: "#065F46",
                fontSize: 13,
              }}
            >
              {documentSuccess}
            </div>
          )}
          {documentError && (
            <div
              className="mb-4 rounded-xl p-3"
              style={{
                backgroundColor: "#FEF2F2",
                color: "#B03A2E",
                fontSize: 13,
              }}
            >
              {documentError}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {VENDOR_DOC_CONFIG.map(({ docType, label }) => {
              const existing = (vendor?.documents ?? []).find(
                (doc) => doc.docType === docType,
              ) as VendorDocument | undefined;

              return (
                <div
                  key={docType}
                  className="flex items-center justify-between rounded-xl"
                  style={{ padding: "12px 16px", backgroundColor: "#F7F5F0" }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#1A1A1A",
                      }}
                    >
                      {label}
                    </p>
                    <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                      {existing
                        ? `Uploaded ${new Date(existing.uploadedAt).toLocaleDateString()}`
                        : "Not uploaded yet"}
                    </p>
                  </div>
                  <label
                    className="flex items-center gap-1.5 rounded-lg"
                    style={{
                      fontSize: 12,
                      color: "#2C5F2D",
                      padding: "6px 12px",
                      backgroundColor: "#D1FAE5",
                      cursor:
                        uploadingDocType && uploadingDocType !== docType
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        uploadingDocType && uploadingDocType !== docType
                          ? 0.5
                          : 1,
                    }}
                  >
                    <Upload size={13} />
                    {uploadingDocType === docType
                      ? "Uploading…"
                      : existing
                        ? "Re-upload"
                        : "Upload"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      disabled={
                        uploadDocumentMutation.isPending &&
                        uploadingDocType !== docType
                      }
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        void onDocumentSelected(docType, file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-5" style={{ width: 360 }}>
        {/* Notifications */}
        <div className="bg-white rounded-2xl" style={{ padding: 24 }}>
          <h3
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 16,
              fontWeight: 700,
              color: "#1A1A1A",
              marginBottom: 16,
            }}
          >
            Notification Preferences
          </h3>
          {[
            {
              label: "New Order Alerts",
              sub: "When a cluster matches your gig",
              on: true,
            },
            {
              label: "Order Updates",
              sub: "Status changes on your orders",
              on: true,
            },
            {
              label: "Payment Released",
              sub: "Escrow releases & payouts",
              on: true,
            },
            { label: "Promotional", sub: "Updates from AgriSetu", on: false },
          ].map(({ label, sub, on }) => (
            <div
              key={label}
              className="flex items-center justify-between py-3"
              style={{ borderBottom: "1px solid #F0EDE8" }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>
                  {label}
                </p>
                <p style={{ fontSize: 12, color: "#A0A0A0" }}>{sub}</p>
              </div>
              <Toggle defaultChecked={on} />
            </div>
          ))}
        </div>

        {/* Security */}
        <div className="bg-white rounded-2xl" style={{ padding: 24 }}>
          <h3
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 16,
              fontWeight: 700,
              color: "#1A1A1A",
              marginBottom: 16,
            }}
          >
            Security
          </h3>

          {passwordSuccess && (
            <div
              className="mb-4 rounded-xl p-3"
              style={{
                backgroundColor: "#D1FAE5",
                color: "#065F46",
                fontSize: 13,
              }}
            >
              Password changed successfully!
            </div>
          )}
          {passwordError && (
            <div
              className="mb-4 rounded-xl p-3"
              style={{
                backgroundColor: "#FEF2F2",
                color: "#B03A2E",
                fontSize: 13,
              }}
            >
              {passwordError}
            </div>
          )}

          <form
            onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
            className="flex flex-col gap-4"
          >
            <FormInput
              label="Current Password"
              type="password"
              placeholder="••••••••"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register("currentPassword")}
            />
            <FormInput
              label="New Password"
              type="password"
              placeholder="Min. 8 characters"
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register("newPassword")}
            />
            <FormInput
              label="Confirm New Password"
              type="password"
              placeholder="••••••••"
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register("confirmPassword")}
            />
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="rounded-xl font-semibold"
              style={{
                backgroundColor: "#2C5F2D",
                color: "white",
                height: 48,
                fontSize: 14,
              }}
            >
              {changePasswordMutation.isPending
                ? "Updating…"
                : "Change Password"}
            </button>
          </form>
        </div>

        {/* Danger zone */}
        <div
          className="rounded-2xl"
          style={{
            padding: 24,
            backgroundColor: "#FEF2F2",
            border: "1.5px solid #FCA5A5",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} color="#B03A2E" />
            <h3
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 16,
                fontWeight: 700,
                color: "#B03A2E",
              }}
            >
              Danger Zone
            </h3>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "#B03A2E",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Deleting your account is permanent and cannot be undone. All your
            gigs, bids, and order history will be removed.
          </p>
          <button
            className="w-full rounded-xl font-semibold"
            style={{
              backgroundColor: "#B03A2E",
              color: "white",
              height: 48,
              fontSize: 14,
            }}
            onClick={() => {
              if (
                window.confirm("Are you sure? This action cannot be undone.")
              ) {
                alert("Account deletion would be processed. (Mock)");
              }
            }}
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
