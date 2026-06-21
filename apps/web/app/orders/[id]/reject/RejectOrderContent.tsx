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
import { Button } from "../../../../components/ui/Button";
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
      <div className="flex flex-col gap-4" style={{ maxWidth: 640 }}>
        <div className="skeleton" style={{ height: 40, maxWidth: 360 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (!order) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{ height: 300 }}
      >
        <div
          className="flex items-center justify-center rounded-2xl bg-sunk text-ink-faint"
          style={{ width: 56, height: 56 }}
        >
          <XCircle size={26} />
        </div>
        <p className="font-display text-ink" style={{ fontSize: 16, fontWeight: 700 }}>
          Order not found
        </p>
        <Button onClick={() => router.push("/orders")} variant="primary">
          Back to orders
        </Button>
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
  const productName = `${cluster.product} - ${cluster.unit}`;
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
          className="card flex items-center gap-3"
          style={{ padding: 22 }}
        >
          <span
            className="flex items-center justify-center rounded-xl bg-danger-bg text-danger shrink-0"
            style={{ width: 38, height: 38 }}
          >
            <XCircle size={18} />
          </span>
          <p className="text-ink-soft" style={{ fontSize: 14 }}>
            Rejection is only available when the order status is Order Received
            or Processing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="rise">
        <h2 className="font-display text-ink" style={{ fontSize: 22, fontWeight: 800 }}>
          Reject order
        </h2>
        <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 3 }}>
          Give farmers a clear reason and proof. This action is permanent and
          triggers a full refund.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 rise" style={{ animationDelay: "60ms" }}>
        <div
          className={
            step === 1
              ? "pill bg-leaf-600 text-white"
              : "pill bg-leaf-50 text-leaf-700"
          }
          style={{ padding: "6px 14px", fontSize: 13 }}
        >
          {step === 2 && <CheckCircle2 size={15} />}
          <span style={{ fontWeight: 700 }}>1</span>
          <span style={{ fontWeight: 600 }}>Reason &amp; proof</span>
        </div>
        <div
          className={step === 2 ? "bg-leaf-600" : "bg-line-strong"}
          style={{ width: 40, height: 2, borderRadius: 999 }}
        />
        <div
          className={
            step === 2
              ? "pill bg-leaf-600 text-white"
              : "pill bg-sunk text-ink-faint"
          }
          style={{ padding: "6px 14px", fontSize: 13 }}
        >
          <span style={{ fontWeight: 700 }}>2</span>
          <span style={{ fontWeight: 600 }}>Confirm rejection</span>
        </div>
      </div>

      <div className="flex gap-5 rise" style={{ animationDelay: "120ms" }}>
        <div style={{ flex: 1 }}>
          {step === 1 ? (
            <section className="card flex flex-col" style={{ padding: 28, gap: 22 }}>
              <p
                className="font-display text-ink"
                style={{ fontSize: 17, fontWeight: 700 }}
              >
                Rejection details
              </p>

              <div className="flex flex-col">
                <label className="field-label">Reason for rejection</label>
                <div style={{ position: "relative" }}>
                  <select
                    value={selectedReason}
                    onChange={(e) => {
                      setSelectedReason(e.target.value);
                      setErrors((prev) => ({ ...prev, reason: undefined }));
                    }}
                    className="field"
                    style={{
                      width: "100%",
                      appearance: "none",
                      cursor: "pointer",
                      paddingRight: "2.5rem",
                      color: selectedReason
                        ? "var(--color-ink)"
                        : "var(--color-ink-faint)",
                    }}
                  >
                    <option value="">Select reason</option>
                    {REJECT_REASONS.map((reason) => (
                      <option key={reason.code} value={reason.code}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="text-ink-faint"
                    style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                    }}
                  />
                </div>
                {errors.reason && (
                  <p className="text-danger" style={{ fontSize: 12.5, marginTop: 6 }}>
                    {errors.reason}
                  </p>
                )}
              </div>

              <div className="flex flex-col">
                <label className="field-label">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value.slice(0, 500));
                    setErrors((prev) => ({ ...prev, description: undefined }));
                  }}
                  rows={5}
                  placeholder="Describe why this order is being rejected."
                  className="field"
                  style={{ minHeight: 110 }}
                />
                <div
                  className="flex items-center justify-between"
                  style={{ marginTop: 6 }}
                >
                  {errors.description ? (
                    <p className="text-danger" style={{ fontSize: 12.5 }}>
                      {errors.description}
                    </p>
                  ) : (
                    <span />
                  )}
                  <p className="text-ink-faint tnum" style={{ fontSize: 11.5 }}>
                    {description.length} / 500 characters
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <label className="field-label" style={{ marginBottom: 0 }}>
                  Upload proof photos
                </label>
                <p className="text-ink-faint" style={{ fontSize: 12.5 }}>
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
                        style={{
                          borderRadius: 12,
                          objectFit: "cover",
                          display: "block",
                          border: "1px solid var(--color-line)",
                        }}
                      />
                      <button
                        onClick={() => removeProofAt(index)}
                        className="flex items-center justify-center"
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          border: "none",
                          borderRadius: 999,
                          width: 22,
                          height: 22,
                          cursor: "pointer",
                          backgroundColor: "oklch(0.27 0.014 60 / 0.7)",
                          color: "#FFFFFF",
                        }}
                        aria-label={`Remove proof ${index + 1}`}
                      >
                        <XCircle size={14} />
                      </button>
                      {proof.uploading && (
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{
                            borderRadius: 12,
                            backgroundColor: "oklch(0.27 0.014 60 / 0.5)",
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
                            backgroundColor: "var(--color-danger)",
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
                    className="flex flex-col items-center justify-center gap-1.5 text-leaf-700 transition-colors hover:bg-leaf-50"
                    style={{
                      width: 100,
                      height: 90,
                      borderRadius: 12,
                      border: "1px dashed var(--color-line-strong)",
                      background: "var(--color-surface)",
                      cursor: "pointer",
                    }}
                  >
                    <PlusCircle size={22} />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>
                      Add photo
                    </span>
                  </button>
                </div>
                {errors.proofs && (
                  <p className="text-danger" style={{ fontSize: 12.5 }}>
                    {errors.proofs}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => router.push(`/orders/${id}`)}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button onClick={goToConfirmStep} variant="danger">
                  Continue to confirmation
                  <ArrowRight size={16} />
                </Button>
              </div>
            </section>
          ) : (
            <section className="card flex flex-col" style={{ padding: 32, gap: 24 }}>
              <div className="flex flex-col items-center gap-2.5">
                <div
                  className="flex items-center justify-center rounded-full bg-danger-bg text-danger"
                  style={{ width: 64, height: 64 }}
                >
                  <CircleX size={32} />
                </div>
                <p
                  className="font-display text-ink"
                  style={{ fontSize: 19, fontWeight: 700, textAlign: "center" }}
                >
                  Reject this order?
                </p>
                <p
                  className="text-ink-soft"
                  style={{ fontSize: 14, textAlign: "center", maxWidth: 420 }}
                >
                  This action cannot be undone. Please review the summary below
                  before confirming.
                </p>
              </div>

              <div className="inset flex flex-col">
                {[
                  ["Order ID", orderCode, false],
                  ["Product", productName, false],
                  ["Reason", selectedReasonLabel, false],
                  ["Refund amount", `${amountDisplay} (Full)`, true],
                ].map(([label, value, isDanger], idx) => (
                  <div key={label as string}>
                    <div
                      className="flex items-center justify-between"
                      style={{ padding: "14px 18px" }}
                    >
                      <span className="text-ink-soft" style={{ fontSize: 13 }}>
                        {label}
                      </span>
                      <span
                        className={isDanger ? "text-danger tnum" : "text-ink"}
                        style={{
                          fontSize: 13,
                          fontWeight: isDanger ? 700 : 600,
                        }}
                      >
                        {value}
                      </span>
                    </div>
                    {idx < 3 && (
                      <div
                        style={{
                          width: "100%",
                          height: 1,
                          background: "var(--color-line)",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div
                className="flex items-start gap-3 rounded-xl"
                style={{ background: "var(--color-danger-bg)", padding: "14px 16px" }}
              >
                <TriangleAlert size={18} className="text-danger shrink-0" style={{ marginTop: 1 }} />
                <p className="text-danger" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Confirming will immediately affect your rating and trigger a
                  full refund of {amountDisplay} to the buyer. This cannot be
                  reversed.
                </p>
              </div>

              <label
                className="flex items-start gap-3 rounded-xl"
                style={{
                  background: "var(--color-warning-bg)",
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
                    accentColor: "var(--color-warning)",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                />
                <p className="text-warning" style={{ fontSize: 13, fontWeight: 500 }}>
                  I understand that rejecting this order will negatively impact my
                  vendor rating.
                </p>
              </label>

              <label
                className="flex items-start gap-3 rounded-xl"
                style={{
                  background: "var(--color-warning-bg)",
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
                    accentColor: "var(--color-warning)",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                />
                <p className="text-warning" style={{ fontSize: 13, fontWeight: 500 }}>
                  I confirm that all accumulated payments for this order will be
                  fully refunded to the buyer.
                </p>
              </label>

              {(confirmError || rejectMutation.isError) && (
                <p className="text-danger" style={{ fontSize: 13 }}>
                  {confirmError ??
                    (rejectMutation.error instanceof Error
                      ? rejectMutation.error.message
                      : "Failed to reject order. Please try again.")}
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={() => setStep(1)} variant="ghost">
                  <ArrowLeft size={16} />
                  Go back
                </Button>
                <Button
                  onClick={() => router.push(`/orders/${id}`)}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRejectConfirm}
                  disabled={!canSubmit}
                  variant="danger"
                >
                  {rejectMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <TriangleAlert size={16} />
                  )}
                  {rejectMutation.isPending ? "Rejecting…" : "Yes, reject this order"}
                </Button>
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-4" style={{ width: 300 }}>
          {step === 1 ? (
            <>
              <div
                className="rounded-2xl flex flex-col"
                style={{
                  background: "var(--color-danger-bg)",
                  border: "1px solid var(--color-danger)",
                  padding: 20,
                  gap: 16,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <TriangleAlert size={20} className="text-danger" />
                  <p
                    className="font-display text-danger"
                    style={{ fontSize: 15, fontWeight: 700 }}
                  >
                    Before you reject
                  </p>
                </div>
                <div style={{ width: "100%", height: 1, background: "var(--color-danger)", opacity: 0.25 }} />
                <div className="flex flex-col gap-1.5">
                  <p className="text-danger" style={{ fontSize: 13, fontWeight: 700 }}>
                    Rating impact
                  </p>
                  <p className="text-danger" style={{ fontSize: 12.5, lineHeight: 1.5, opacity: 0.9 }}>
                    Rejecting an order will negatively affect your vendor rating
                    score. Repeated rejections may lead to account review.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-danger" style={{ fontSize: 13, fontWeight: 700 }}>
                    Full refund issued
                  </p>
                  <p className="text-danger" style={{ fontSize: 12.5, lineHeight: 1.5, opacity: 0.9 }}>
                    All payments received for this order, including any advance
                    amounts, will be fully refunded to the buyer. This cannot be
                    undone.
                  </p>
                </div>
                <div style={{ width: "100%", height: 1, background: "var(--color-danger)", opacity: 0.25 }} />
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-danger" />
                  <p className="text-danger" style={{ fontSize: 11.5, fontWeight: 600 }}>
                    This action is permanent and irreversible.
                  </p>
                </div>
              </div>

              <OrderSummaryCard
                rows={[
                  ["Order ID", orderCode],
                  ["Product", productName],
                  ["Qty", quantityLabel],
                  ["Cluster", clusterCode],
                ]}
                amountDisplay={amountDisplay}
                footer={
                  <div
                    className="flex items-center gap-1.5 rounded-lg"
                    style={{ padding: "8px 12px", background: "var(--color-danger-bg)" }}
                  >
                    <RotateCcw size={13} className="text-danger" />
                    <span className="text-danger" style={{ fontSize: 11.5, fontWeight: 600 }}>
                      {amountDisplay} will be refunded on rejection
                    </span>
                  </div>
                }
              />
            </>
          ) : (
            <>
              <OrderSummaryCard
                rows={[
                  ["Order ID", orderCode],
                  ["Product", productName],
                  ["Qty", quantityLabel],
                  ["Cluster", clusterCode],
                ]}
                amountDisplay={amountDisplay}
              />

              <section className="card flex flex-col" style={{ padding: 20, gap: 12 }}>
                <p
                  className="font-display text-ink"
                  style={{ fontSize: 15, fontWeight: 700 }}
                >
                  Submitted proof
                </p>
                <div style={{ width: "100%", height: 1, background: "var(--color-line)" }} />
                <div className="flex items-center gap-2.5 flex-wrap">
                  {proofImages.map((proof, index) => (
                    <Image
                      key={proof.id}
                      src={proof.previewUrl}
                      alt={`Submitted proof ${index + 1}`}
                      width={80}
                      height={70}
                      unoptimized
                      style={{
                        borderRadius: 10,
                        objectFit: "cover",
                        border: "1px solid var(--color-line)",
                      }}
                    />
                  ))}
                </div>
                <p className="text-ink-faint" style={{ fontSize: 12.5 }}>
                  {proofImages.length} photo{proofImages.length === 1 ? "" : "s"} attached as
                  evidence
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderSummaryCard({
  rows,
  amountDisplay,
  footer,
}: {
  rows: Array<[string, string]>;
  amountDisplay: string;
  footer?: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col" style={{ padding: 20, gap: 14 }}>
      <p className="font-display text-ink" style={{ fontSize: 15, fontWeight: 700 }}>
        Order summary
      </p>
      <div style={{ width: "100%", height: 1, background: "var(--color-line)" }} />
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between">
          <span className="text-ink-faint" style={{ fontSize: 12.5 }}>
            {label}
          </span>
          <span className="text-ink" style={{ fontSize: 12.5, fontWeight: 600 }}>
            {value}
          </span>
        </div>
      ))}
      <div style={{ width: "100%", height: 1, background: "var(--color-line)" }} />
      <div className="flex items-center justify-between">
        <span className="text-ink" style={{ fontSize: 13.5, fontWeight: 600 }}>
          Order value
        </span>
        <span
          className="font-display text-danger tnum"
          style={{ fontSize: 15, fontWeight: 700 }}
        >
          {amountDisplay}
        </span>
      </div>
      {footer}
    </section>
  );
}
