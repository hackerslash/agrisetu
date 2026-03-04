"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleX,
  Info,
  Loader2,
  PlusCircle,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { formatCurrency } from "../../../../lib/utils";
import { useNotifications } from "../../../../lib/NotificationContext";

const REJECT_REASONS: Array<{ code: string; label: string }> = [
  { code: "OUT_OF_STOCK", label: "Unable to fulfill - stock unavailable" },
  { code: "PRICE_MISMATCH", label: "Price mismatch" },
  {
    code: "LOCATION_NOT_SERVICEABLE",
    label: "Delivery location not serviceable",
  },
  { code: "MINIMUM_QUANTITY_NOT_MET", label: "Minimum quantity not met" },
  {
    code: "QUALITY_STANDARDS_NOT_ALIGNED",
    label: "Quality standards not aligned",
  },
  { code: "OTHER", label: "Other" },
];

interface ProofImage {
  id: string;
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  uploading: boolean;
  uploadError?: string;
}

interface FormErrors {
  reason?: string;
  description?: string;
  proofs?: string;
}

export function RejectOrderContent({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedReason, setSelectedReason] = useState("");
  const [description, setDescription] = useState("");
  const [proofImages, setProofImages] = useState<ProofImage[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [ackRatingImpact, setAckRatingImpact] = useState(false);
  const [ackRefund, setAckRefund] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const proofImagesRef = useRef<ProofImage[]>([]);

  const { data: order, isLoading } = useQuery({
    queryKey: ["vendor-order", id],
    queryFn: () => vendorApi.getOrderDetail(id),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const proofUrls = proofImages
        .map((proof) => proof.uploadedUrl)
        .filter((value): value is string => Boolean(value));
      if (proofUrls.length < 1) {
        throw new Error("Attach and upload at least 1 proof photo.");
      }
      if (proofImages.some((proof) => proof.uploading)) {
        throw new Error("Please wait for all proof photos to finish uploading.");
      }
      if (proofImages.some((proof) => proof.uploadError)) {
        throw new Error("One or more proof photos failed to upload.");
      }

      return vendorApi.rejectOrder(id, {
        reason: selectedReason,
        note: description.trim() || undefined,
        proofUrls,
        acknowledgeRatingImpact: true,
        acknowledgeRefund: true,
      });
    },
    onSuccess: () => {
      addNotification(`Order #${id.slice(-6).toUpperCase()} rejected.`, id);
      void queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      router.push(`/orders/${id}`);
    },
    onError: (e) => {
      setConfirmError(
        e instanceof Error ? e.message : "Failed to reject order. Please try again.",
      );
    },
  });

  useEffect(() => {
    proofImagesRef.current = proofImages;
  }, [proofImages]);

  useEffect(() => {
    return () => {
      for (const proof of proofImagesRef.current) {
        URL.revokeObjectURL(proof.previewUrl);
      }
    };
  }, []);

  async function uploadProof(imageId: string, file: File) {
    try {
      const response = await vendorApi.uploadOrderRejectProof(id, file);
      setProofImages((prev) =>
        prev.map((proof) =>
          proof.id === imageId
            ? {
                ...proof,
                uploadedUrl: response.fileUrl,
                uploading: false,
                uploadError: undefined,
              }
            : proof,
        ),
      );
      setErrors((prev) => ({ ...prev, proofs: undefined }));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not upload this photo.";
      setProofImages((prev) =>
        prev.map((proof) =>
          proof.id === imageId
            ? {
                ...proof,
                uploading: false,
                uploadError: message,
              }
            : proof,
        ),
      );
    }
  }

  function handleProofSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;

    const slotsLeft = Math.max(0, 6 - proofImages.length);
    const selected = files.slice(0, slotsLeft);
    const created = selected.map<ProofImage>((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
    }));

    setProofImages((prev) => [...prev, ...created]);
    setErrors((prev) => ({ ...prev, proofs: undefined }));
    setConfirmError(null);

    for (const image of created) {
      void uploadProof(image.id, image.file);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeProofAt(index: number) {
    setProofImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function goToConfirmStep() {
    const nextErrors: FormErrors = {};
    if (!selectedReason) nextErrors.reason = "Please select a rejection reason.";
    if (!description.trim()) {
      nextErrors.description = "Please provide a short description.";
    }
    if (proofImages.length < 1) {
      nextErrors.proofs = "Attach at least 1 proof photo.";
    } else if (proofImages.some((proof) => proof.uploading)) {
      nextErrors.proofs = "Please wait for all photos to finish uploading.";
    } else if (proofImages.some((proof) => proof.uploadError)) {
      nextErrors.proofs = "Fix failed uploads before continuing.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setAckRatingImpact(false);
    setAckRefund(false);
    setConfirmError(null);
    setStep(2);
  }

  function handleRejectConfirm() {
    if (!ackRatingImpact || !ackRefund) {
      setConfirmError("Please check both confirmations to continue.");
      return;
    }
    setConfirmError(null);
    rejectMutation.mutate();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 300 }}>
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3"
        style={{ height: 300 }}
      >
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>Order not found.</p>
        <button
          onClick={() => router.push("/orders")}
          style={{
            backgroundColor: "#2C5F2D",
            color: "white",
            fontSize: 13,
            padding: "8px 20px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
          }}
        >
          Back to Orders
        </button>
      </div>
    );
  }

  const cluster = order as Cluster;
  const canReject =
    cluster.status === "PAYMENT" || cluster.status === "PROCESSING";
  const totalAmount = (cluster.payments ?? [])
    .filter((payment) => payment.status === "SUCCESS")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const amountDisplay = formatCurrency(totalAmount);
  const shortToken = cluster.id.slice(-3).toUpperCase();
  const orderCode = `ORD-${shortToken}`;
  const clusterCode = `CLU-${shortToken}`;
  const productName = `${cluster.cropName} - ${cluster.unit}`;
  const quantityLabel = `${cluster.currentQuantity} ${cluster.unit}`;
  const selectedReasonLabel =
    REJECT_REASONS.find((reason) => reason.code === selectedReason)?.label ?? "";
  const canSubmit =
    ackRatingImpact &&
    ackRefund &&
    !rejectMutation.isPending &&
    !proofImages.some((proof) => proof.uploading);

  if (!canReject) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="bg-white rounded-2xl flex items-center gap-3"
          style={{ padding: 20 }}
        >
          <XCircle size={18} color="#B03A2E" />
          <p style={{ fontSize: 14, color: "#5A5A5A" }}>
            Rejection is only available when order status is Payment or
            Processing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        {step === 1 ? (
          <>
            <div
              className="flex items-center rounded-full"
              style={{ padding: "6px 14px", gap: 8, backgroundColor: "#2C5F2D" }}
            >
              <span
                style={{
                  color: "#FFFFFF",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "Plus Jakarta Sans",
                }}
              >
                1
              </span>
              <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 600 }}>
                Provide Reason & Proof
              </span>
            </div>
            <div style={{ width: 40, height: 2, backgroundColor: "#D1D5DB" }} />
            <div
              className="flex items-center rounded-full"
              style={{ padding: "6px 14px", gap: 8, backgroundColor: "#E5E7EB" }}
            >
              <span
                style={{
                  color: "#9CA3AF",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "Plus Jakarta Sans",
                }}
              >
                2
              </span>
              <span style={{ color: "#9CA3AF", fontSize: 13, fontWeight: 600 }}>
                Confirm Rejection
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className="flex items-center rounded-full"
              style={{ padding: "6px 14px", gap: 8, backgroundColor: "#D1FAE5" }}
            >
              <span
                style={{
                  color: "#059669",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "Plus Jakarta Sans",
                }}
              >
                1
              </span>
              <span style={{ color: "#059669", fontSize: 13, fontWeight: 600 }}>
                Reason & Proof
              </span>
              <CheckCircle2 size={15} color="#059669" />
            </div>
            <div style={{ width: 40, height: 2, backgroundColor: "#2C5F2D" }} />
            <div
              className="flex items-center rounded-full"
              style={{ padding: "6px 14px", gap: 8, backgroundColor: "#2C5F2D" }}
            >
              <span
                style={{
                  color: "#FFFFFF",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "Plus Jakarta Sans",
                }}
              >
                2
              </span>
              <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 600 }}>
                Confirm Rejection
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-5">
        <div style={{ flex: 1 }}>
          {step === 1 ? (
            <div className="bg-white rounded-2xl flex flex-col" style={{ padding: 28, gap: 20 }}>
              <p
                style={{
                  fontFamily: "Plus Jakarta Sans",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#1A1A1A",
                }}
              >
                Rejection Details
              </p>

              <div className="flex flex-col gap-2">
                <label style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>
                  Reason for Rejection *
                </label>
                <div
                  className="flex items-center justify-between"
                  style={{
                    border: "1px solid #D1D5DB",
                    borderRadius: 10,
                    padding: "12px 16px",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <select
                    value={selectedReason}
                    onChange={(e) => {
                      setSelectedReason(e.target.value);
                      setErrors((prev) => ({ ...prev, reason: undefined }));
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      backgroundColor: "transparent",
                      color: selectedReason ? "#1A1A1A" : "#6B7280",
                      fontSize: 13,
                      appearance: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Select reason</option>
                    {REJECT_REASONS.map((reason) => (
                      <option key={reason.code} value={reason.code}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} color="#A0A0A0" />
                </div>
                {errors.reason && (
                  <p style={{ fontSize: 12, color: "#B91C1C" }}>{errors.reason}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>
                  Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value.slice(0, 500));
                    setErrors((prev) => ({ ...prev, description: undefined }));
                  }}
                  rows={5}
                  placeholder="Describe why this order is being rejected."
                  className="w-full resize-none outline-none"
                  style={{
                    border: "1px solid #D1D5DB",
                    borderRadius: 10,
                    backgroundColor: "#FFFFFF",
                    fontSize: 13,
                    color: "#1A1A1A",
                    padding: "14px 16px",
                    minHeight: 110,
                  }}
                />
                <div className="flex items-center justify-between">
                  {errors.description ? (
                    <p style={{ fontSize: 12, color: "#B91C1C" }}>{errors.description}</p>
                  ) : (
                    <span />
                  )}
                  <p style={{ fontSize: 11, color: "#A0A0A0" }}>
                    {description.length} / 500 characters
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <label style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>
                  Upload Proof Photos *
                </label>
                <p style={{ fontSize: 12, color: "#6B7280" }}>
                  Attach at least 1 photo as evidence (e.g. empty stock, damage,
                  or other reason).
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleProofSelect}
                  style={{ display: "none" }}
                />
                <div className="flex items-center gap-3 flex-wrap">
                  {proofImages.map((proof, index) => (
                    <div
                      key={proof.id}
                      style={{ width: 100, height: 90, position: "relative" }}
                    >
                      <Image
                        src={proof.previewUrl}
                        alt={`Proof ${index + 1}`}
                        width={100}
                        height={90}
                        unoptimized
                        style={{ borderRadius: 10, objectFit: "cover", display: "block" }}
                      />
                      <button
                        onClick={() => removeProofAt(index)}
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          border: "none",
                          borderRadius: 14,
                          width: 22,
                          height: 22,
                          cursor: "pointer",
                          backgroundColor: "rgba(0,0,0,0.6)",
                          color: "#FFFFFF",
                          fontSize: 12,
                          lineHeight: "22px",
                          textAlign: "center",
                        }}
                        aria-label={`Remove proof ${index + 1}`}
                      >
                        ✕
                      </button>
                      {proof.uploading && (
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{
                            borderRadius: 10,
                            backgroundColor: "rgba(0,0,0,0.45)",
                          }}
                        >
                          <Loader2 size={18} color="#FFFFFF" className="animate-spin" />
                        </div>
                      )}
                      {proof.uploadError && (
                        <div
                          className="absolute left-1 right-1 bottom-1 rounded-md"
                          style={{
                            padding: "2px 4px",
                            backgroundColor: "rgba(127, 29, 29, 0.85)",
                            color: "#FFFFFF",
                            fontSize: 9,
                          }}
                        >
                          Upload failed
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center"
                    style={{
                      width: 100,
                      height: 90,
                      borderRadius: 10,
                      border: "1px solid #D1D5DB",
                      backgroundColor: "#FFFFFF",
                      cursor: "pointer",
                      gap: 6,
                    }}
                  >
                    <PlusCircle size={22} color="#2C5F2D" />
                    <span style={{ fontSize: 11, color: "#2C5F2D", fontWeight: 600 }}>
                      Add Photo
                    </span>
                  </button>
                </div>
                {errors.proofs && (
                  <p style={{ fontSize: 12, color: "#B91C1C" }}>{errors.proofs}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/orders/${id}`)}
                  style={{
                    border: "none",
                    borderRadius: 10,
                    backgroundColor: "#F3F4F6",
                    color: "#6B7280",
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "12px 24px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={goToConfirmStep}
                  style={{
                    border: "none",
                    borderRadius: 10,
                    backgroundColor: "#DC2626",
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "12px 24px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  Continue to Confirmation
                  <ArrowRight size={16} color="#FFFFFF" />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl flex flex-col" style={{ padding: 32, gap: 24 }}>
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 64, height: 64, backgroundColor: "#FEF2F2" }}
                >
                  <CircleX size={32} color="#DC2626" />
                </div>
                <p
                  style={{
                    fontFamily: "Plus Jakarta Sans",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1A1A1A",
                  }}
                >
                  Are you sure you want to reject this order?
                </p>
                <p style={{ fontSize: 14, color: "#6B7280", textAlign: "center" }}>
                  This action cannot be undone. Please review the summary below
                  before confirming.
                </p>
              </div>

              <div className="flex flex-col" style={{ borderRadius: 12, backgroundColor: "#F9FAFB" }}>
                {[
                  ["Order ID", orderCode, "#1A1A1A", 600],
                  ["Product", productName, "#1A1A1A", 600],
                  ["Reason", selectedReasonLabel, "#1A1A1A", 600],
                  ["Refund Amount", `${amountDisplay} (Full)`, "#DC2626", 700],
                ].map(([label, value, color, weight], idx) => (
                  <div key={label as string}>
                    <div className="flex items-center justify-between" style={{ padding: "14px 20px" }}>
                      <span style={{ color: "#6B7280", fontSize: 13 }}>{label}</span>
                      <span style={{ color: color as string, fontSize: 13, fontWeight: weight as number }}>
                        {value}
                      </span>
                    </div>
                    {idx < 3 && <div style={{ width: "100%", height: 1, background: "#E5E7EB" }} />}
                  </div>
                ))}
              </div>

              <div
                className="flex items-start gap-3"
                style={{ borderRadius: 10, backgroundColor: "#FEF2F2", padding: "14px 16px" }}
              >
                <TriangleAlert size={18} color="#DC2626" />
                <p style={{ fontSize: 13, color: "#991B1B", fontWeight: 500 }}>
                  Confirming will immediately affect your rating and trigger a
                  full refund of {amountDisplay} to the buyer. This cannot be
                  reversed.
                </p>
              </div>

              <label
                className="flex items-start gap-3"
                style={{
                  borderRadius: 10,
                  backgroundColor: "#FFFBEB",
                  padding: "14px 16px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={ackRatingImpact}
                  onChange={(e) => {
                    setAckRatingImpact(e.target.checked);
                    if (confirmError) setConfirmError(null);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    marginTop: 1,
                    accentColor: "#F59E0B",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                />
                <p style={{ fontSize: 13, color: "#92400E", fontWeight: 500 }}>
                  I understand that rejecting this order will negatively impact my
                  vendor rating.
                </p>
              </label>

              <label
                className="flex items-start gap-3"
                style={{
                  borderRadius: 10,
                  backgroundColor: "#FFFBEB",
                  padding: "14px 16px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={ackRefund}
                  onChange={(e) => {
                    setAckRefund(e.target.checked);
                    if (confirmError) setConfirmError(null);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    marginTop: 1,
                    accentColor: "#F59E0B",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                />
                <p style={{ fontSize: 13, color: "#92400E", fontWeight: 500 }}>
                  I confirm that all accumulated payments for this order will be
                  fully refunded to the buyer.
                </p>
              </label>

              {(confirmError || rejectMutation.isError) && (
                <p style={{ fontSize: 13, color: "#B91C1C" }}>
                  {confirmError ??
                    (rejectMutation.error instanceof Error
                      ? rejectMutation.error.message
                      : "Failed to reject order. Please try again.")}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(1)}
                  style={{
                    border: "none",
                    borderRadius: 10,
                    backgroundColor: "#F3F4F6",
                    color: "#6B7280",
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "12px 24px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <ArrowLeft size={16} color="#6B7280" />
                  Go Back
                </button>
                <button
                  onClick={() => router.push(`/orders/${id}`)}
                  style={{
                    border: "none",
                    borderRadius: 10,
                    backgroundColor: "#F3F4F6",
                    color: "#6B7280",
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "12px 24px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={!canSubmit}
                  style={{
                    border: "none",
                    borderRadius: 10,
                    backgroundColor: canSubmit ? "#DC2626" : "#FCA5A5",
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 700,
                    padding: "12px 28px",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    opacity: rejectMutation.isPending ? 0.8 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {rejectMutation.isPending ? (
                    <Loader2 size={16} color="#FFFFFF" className="animate-spin" />
                  ) : (
                    <TriangleAlert size={16} color="#FFFFFF" />
                  )}
                  {rejectMutation.isPending ? "Rejecting..." : "Yes, Reject This Order"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4" style={{ width: 300 }}>
          {step === 1 ? (
            <>
              <div
                className="rounded-2xl flex flex-col"
                style={{ backgroundColor: "#FEF2F2", padding: 20, gap: 16 }}
              >
                <div className="flex items-center gap-2.5">
                  <TriangleAlert size={22} color="#DC2626" />
                  <p
                    style={{
                      color: "#DC2626",
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: "Plus Jakarta Sans",
                    }}
                  >
                    Warning
                  </p>
                </div>
                <div style={{ width: "100%", height: 1, background: "#FECACA" }} />
                <div className="flex flex-col gap-1.5">
                  <p style={{ color: "#991B1B", fontSize: 13, fontWeight: 700 }}>
                    Rating Impact
                  </p>
                  <p style={{ color: "#B91C1C", fontSize: 12, lineHeight: 1.5 }}>
                    Rejecting an order will negatively affect your vendor rating
                    score. Repeated rejections may lead to account review.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p style={{ color: "#991B1B", fontSize: 13, fontWeight: 700 }}>
                    Full Refund Issued
                  </p>
                  <p style={{ color: "#B91C1C", fontSize: 12, lineHeight: 1.5 }}>
                    All payments received for this order, including any advance
                    amounts, will be fully refunded to the buyer. This cannot be
                    undone.
                  </p>
                </div>
                <div style={{ width: "100%", height: 1, background: "#FECACA" }} />
                <div className="flex items-center gap-2">
                  <Info size={14} color="#DC2626" />
                  <p style={{ color: "#DC2626", fontSize: 11, fontWeight: 600 }}>
                    This action is permanent and irreversible.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl flex flex-col" style={{ padding: 20, gap: 14 }}>
                <p
                  style={{
                    fontFamily: "Plus Jakarta Sans",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1A1A1A",
                  }}
                >
                  Order Summary
                </p>
                <div style={{ width: "100%", height: 1, background: "#F3F4F6" }} />
                {[
                  ["Order ID", orderCode],
                  ["Product", productName],
                  ["Qty", quantityLabel],
                  ["Cluster", clusterCode],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <span style={{ color: "#A0A0A0", fontSize: 12 }}>{label}</span>
                    <span style={{ color: "#1A1A1A", fontSize: 12, fontWeight: 600 }}>
                      {value}
                    </span>
                  </div>
                ))}
                <div style={{ width: "100%", height: 1, background: "#F3F4F6" }} />
                <div className="flex items-center justify-between">
                  <span style={{ color: "#1A1A1A", fontSize: 13, fontWeight: 600 }}>
                    Order Value
                  </span>
                  <span
                    style={{
                      color: "#DC2626",
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "Plus Jakarta Sans",
                    }}
                  >
                    {amountDisplay}
                  </span>
                </div>
                <div
                  className="flex items-center gap-1.5 rounded-lg"
                  style={{ padding: "8px 12px", backgroundColor: "#FEF2F2" }}
                >
                  <RotateCcw size={13} color="#DC2626" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>
                    {amountDisplay} will be refunded on rejection
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-2xl flex flex-col" style={{ padding: 20, gap: 14 }}>
                <p
                  style={{
                    fontFamily: "Plus Jakarta Sans",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1A1A1A",
                  }}
                >
                  Order Summary
                </p>
                <div style={{ width: "100%", height: 1, background: "#F3F4F6" }} />
                {[
                  ["Order ID", orderCode],
                  ["Product", productName],
                  ["Qty", quantityLabel],
                  ["Cluster", clusterCode],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <span style={{ color: "#A0A0A0", fontSize: 12 }}>{label}</span>
                    <span style={{ color: "#1A1A1A", fontSize: 12, fontWeight: 600 }}>
                      {value}
                    </span>
                  </div>
                ))}
                <div style={{ width: "100%", height: 1, background: "#F3F4F6" }} />
                <div className="flex items-center justify-between">
                  <span style={{ color: "#1A1A1A", fontSize: 13, fontWeight: 600 }}>
                    Order Value
                  </span>
                  <span
                    style={{
                      color: "#DC2626",
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "Plus Jakarta Sans",
                    }}
                  >
                    {amountDisplay}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl flex flex-col" style={{ padding: 20, gap: 12 }}>
                <p
                  style={{
                    fontFamily: "Plus Jakarta Sans",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1A1A1A",
                  }}
                >
                  Submitted Proof
                </p>
                <div style={{ width: "100%", height: 1, background: "#F3F4F6" }} />
                <div className="flex items-center gap-2.5 flex-wrap">
                  {proofImages.map((proof, index) => (
                    <Image
                      key={proof.id}
                      src={proof.previewUrl}
                      alt={`Submitted proof ${index + 1}`}
                      width={80}
                      height={70}
                      unoptimized
                      style={{ borderRadius: 8, objectFit: "cover" }}
                    />
                  ))}
                </div>
                <p style={{ color: "#6B7280", fontSize: 12 }}>
                  {proofImages.length} photo{proofImages.length === 1 ? "" : "s"} attached as
                  evidence
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
