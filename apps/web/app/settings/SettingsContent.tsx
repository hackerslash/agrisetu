"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Upload, AlertTriangle, LocateFixed, FileText } from "lucide-react";
import { INDIAN_STATES_AND_UTS } from "../../lib/indiaStates";
import { vendorApi, authApi } from "@repo/api-client";
import type { Vendor, DocType, VendorDocument } from "@repo/api-client";
import { Button } from "../../components/ui/Button";

function Toggle({ defaultChecked = true }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className="relative rounded-full transition-colors flex-shrink-0"
      style={{
        width: 44,
        height: 24,
        backgroundColor: on ? "var(--color-leaf-600)" : "var(--color-line-strong)",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        className="absolute top-1 rounded-full bg-white transition-all"
        style={{ width: 16, height: 16, left: on ? 24 : 4, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
      />
    </button>
  );
}

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

// ─── Subcomponents ────────────────────────────────────────────────────────────

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
      <label className="field-label" style={{ marginBottom: 0 }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="field"
        style={error ? { borderColor: "var(--color-danger)" } : undefined}
        {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      {error && (
        <p className="text-danger" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Banner({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={tone === "success" ? "bg-leaf-50 text-leaf-700" : "bg-danger-bg text-danger"}
      style={{ borderRadius: 12, padding: 12, fontSize: 13, marginBottom: 16 }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-ink" style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>
      {children}
    </h3>
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
  const [uploadingDocType, setUploadingDocType] = useState<DocType | null>(null);
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
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

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
        <p className="text-ink-faint" style={{ fontSize: 14 }}>
          Loading settings…
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left column */}
      <div className="flex-1 flex flex-col gap-5">
        {/* Business profile */}
        <div className="card" style={{ padding: 24 }}>
          <SectionTitle>Business profile</SectionTitle>

          {profileSuccess && <Banner tone="success">Profile updated successfully.</Banner>}
          {profileError && <Banner tone="error">{profileError}</Banner>}

          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <FormInput
                  label="Business name"
                  error={profileForm.formState.errors.businessName?.message}
                  {...profileForm.register("businessName")}
                />
              </div>
              <div className="flex-1">
                <FormInput
                  label="Contact person"
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
                <label className="field-label" style={{ marginBottom: 0 }}>
                  State
                </label>
                <select {...profileForm.register("state")} className="field">
                  <option value="">Select state</option>
                  {INDIAN_STATES_AND_UTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>
                Business type
              </label>
              <select {...profileForm.register("businessType")} className="field">
                <option value="">Select type</option>
                <option value="MANUFACTURER">Manufacturer</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="RETAILER">Retailer</option>
                <option value="WHOLESALER">Wholesaler</option>
              </select>
            </div>
            <FormInput
              label="Business location address"
              placeholder="Street, Village/Town, District"
              error={profileForm.formState.errors.locationAddress?.message}
              {...profileForm.register("locationAddress")}
            />
            <input type="hidden" {...profileForm.register("latitude")} />
            <input type="hidden" {...profileForm.register("longitude")} />
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <FormInput
                  label="Service radius (km)"
                  type="number"
                  placeholder="25"
                  error={profileForm.formState.errors.serviceRadiusKm?.message}
                  step="1"
                  {...profileForm.register("serviceRadiusKm")}
                />
              </div>
              <Button type="button" variant="ghost" onClick={useCurrentLocation}>
                <LocateFixed size={16} />
                {locating ? "Fetching…" : "Fetch location"}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>
                Email (read-only)
              </label>
              <div
                className="inset flex items-center text-ink-faint"
                style={{ height: 44, padding: "0 14px", fontSize: 14 }}
              >
                {vendor?.email}
              </div>
            </div>
            <div>
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                {profileForm.formState.isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </div>

        {/* Certifications */}
        <div className="card" style={{ padding: 24 }}>
          <SectionTitle>Documents &amp; certifications</SectionTitle>
          {documentSuccess && <Banner tone="success">{documentSuccess}</Banner>}
          {documentError && <Banner tone="error">{documentError}</Banner>}
          <div className="flex flex-col gap-3">
            {VENDOR_DOC_CONFIG.map(({ docType, label }) => {
              const existing = (vendor?.documents ?? []).find(
                (doc) => doc.docType === docType,
              ) as VendorDocument | undefined;

              return (
                <div
                  key={docType}
                  className="inset flex items-center justify-between"
                  style={{ padding: "12px 16px" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        existing
                          ? "flex items-center justify-center rounded-lg bg-leaf-50 text-leaf-700"
                          : "flex items-center justify-center rounded-lg bg-surface text-ink-faint"
                      }
                      style={{ width: 36, height: 36, border: existing ? "none" : "1px solid var(--color-line)" }}
                    >
                      <FileText size={16} />
                    </span>
                    <div>
                      <p className="text-ink" style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {label}
                      </p>
                      <p className="text-ink-faint" style={{ fontSize: 12 }}>
                        {existing
                          ? `Uploaded ${new Date(existing.uploadedAt).toLocaleDateString()}`
                          : "Not uploaded yet"}
                      </p>
                    </div>
                  </div>
                  <label
                    className="btn btn-soft btn-sm"
                    style={{
                      cursor:
                        uploadingDocType && uploadingDocType !== docType ? "not-allowed" : "pointer",
                      opacity: uploadingDocType && uploadingDocType !== docType ? 0.5 : 1,
                    }}
                  >
                    <Upload size={13} />
                    {uploadingDocType === docType ? "Uploading…" : existing ? "Re-upload" : "Upload"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      disabled={uploadDocumentMutation.isPending && uploadingDocType !== docType}
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
        <div className="card" style={{ padding: 24 }}>
          <SectionTitle>Notification preferences</SectionTitle>
          {[
            { label: "New order alerts", sub: "When a cluster matches your gig", on: true },
            { label: "Order updates", sub: "Status changes on your orders", on: true },
            { label: "Payment released", sub: "Escrow releases & payouts", on: true },
            { label: "Promotional", sub: "Updates from AgriSetu", on: false },
          ].map(({ label, sub, on }, i, arr) => (
            <div
              key={label}
              className="flex items-center justify-between py-3"
              style={i < arr.length - 1 ? { borderBottom: "1px solid var(--color-line)" } : undefined}
            >
              <div>
                <p className="text-ink" style={{ fontSize: 14, fontWeight: 500 }}>
                  {label}
                </p>
                <p className="text-ink-faint" style={{ fontSize: 12 }}>
                  {sub}
                </p>
              </div>
              <Toggle defaultChecked={on} />
            </div>
          ))}
        </div>

        {/* Security */}
        <div className="card" style={{ padding: 24 }}>
          <SectionTitle>Security</SectionTitle>

          {passwordSuccess && <Banner tone="success">Password changed successfully.</Banner>}
          {passwordError && <Banner tone="error">{passwordError}</Banner>}

          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="flex flex-col gap-4">
            <FormInput
              label="Current password"
              type="password"
              placeholder="••••••••"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register("currentPassword")}
            />
            <FormInput
              label="New password"
              type="password"
              placeholder="Min. 8 characters"
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register("newPassword")}
            />
            <FormInput
              label="Confirm new password"
              type="password"
              placeholder="••••••••"
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register("confirmPassword")}
            />
            <div>
              <Button type="submit" disabled={changePasswordMutation.isPending} block>
                {changePasswordMutation.isPending ? "Updating…" : "Change password"}
              </Button>
            </div>
          </form>
        </div>

        {/* Danger zone */}
        <div
          style={{
            borderRadius: 20,
            padding: 24,
            backgroundColor: "var(--color-danger-bg)",
            border: "1px solid color-mix(in oklch, var(--color-danger) 35%, transparent)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-danger" />
            <h3 className="font-display text-danger" style={{ fontSize: 16, fontWeight: 700 }}>
              Danger zone
            </h3>
          </div>
          <p className="text-danger" style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            Deleting your account is permanent and cannot be undone. All your gigs, bids, and order
            history will be removed.
          </p>
          <Button
            variant="danger"
            block
            onClick={() => {
              if (window.confirm("Are you sure? This action cannot be undone.")) {
                alert("Account deletion would be processed. (Mock)");
              }
            }}
          >
            Delete account
          </Button>
        </div>
      </div>
    </div>
  );
}
