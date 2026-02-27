"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, AlertTriangle } from "lucide-react";
import { vendorApi } from "@repo/api-client";

const REJECT_REASONS = [
  "Stock not available",
  "Price mismatch",
  "Delivery location not serviceable",
  "Minimum quantity not met",
  "Quality standards not aligned",
  "Other",
];

interface RejectModalProps {
  clusterId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RejectModal({
  clusterId,
  onClose,
  onSuccess,
}: RejectModalProps) {
  const [step, setStep] = useState(1);
  const [selectedReason, setSelectedReason] = useState("");
  const [note, setNote] = useState("");

  const rejectMutation = useMutation({
    mutationFn: () =>
      vendorApi.rejectOrder(clusterId, { reason: selectedReason, note }),
    onSuccess,
  });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl flex flex-col gap-5"
        style={{ width: 520, padding: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: step >= s ? "#2C5F2D" : "#EDE8DF",
                    color: step >= s ? "white" : "#A0A0A0",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {s}
                </div>
                {s === 1 && (
                  <div
                    style={{
                      width: 40,
                      height: 2,
                      backgroundColor: step >= 2 ? "#2C5F2D" : "#EDE8DF",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="ml-auto"
            style={{ color: "#A0A0A0" }}
          >
            <X size={20} />
          </button>
        </div>

        {step === 1 ? (
          <>
            <div>
              <h3
                style={{
                  fontFamily: "Plus Jakarta Sans",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#1A1A1A",
                }}
              >
                Select Rejection Reason
              </h3>
              <p style={{ fontSize: 13, color: "#A0A0A0", marginTop: 4 }}>
                Please select a reason for rejecting this order.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {REJECT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSelectedReason(reason)}
                  className="flex items-center gap-3 rounded-xl text-left transition-all"
                  style={{
                    padding: "12px 16px",
                    backgroundColor:
                      selectedReason === reason ? "#FEF2F2" : "#F7F5F0",
                    border:
                      selectedReason === reason
                        ? "1.5px solid #B03A2E"
                        : "1.5px solid transparent",
                    color: selectedReason === reason ? "#B03A2E" : "#1A1A1A",
                    fontSize: 14,
                    fontWeight: selectedReason === reason ? 600 : 400,
                  }}
                >
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: 16,
                      height: 16,
                      border: `2px solid ${selectedReason === reason ? "#B03A2E" : "#A0A0A0"}`,
                      backgroundColor:
                        selectedReason === reason ? "#B03A2E" : "transparent",
                    }}
                  />
                  {reason}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Additional note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add any additional context…"
                rows={3}
                className="w-full outline-none resize-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 14,
                  padding: "12px 16px",
                  fontSize: 14,
                  border: "1.5px solid transparent",
                }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#F7F5F0",
                  color: "#1A1A1A",
                  height: 48,
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!selectedReason}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  backgroundColor: selectedReason ? "#B03A2E" : "#EDE8DF",
                  color: selectedReason ? "white" : "#A0A0A0",
                  height: 48,
                  fontSize: 14,
                }}
              >
                Next →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <div
                className="flex items-center justify-center rounded-full"
                style={{ width: 56, height: 56, backgroundColor: "#FEF2F2" }}
              >
                <AlertTriangle size={28} color="#B03A2E" />
              </div>
              <h3
                style={{
                  fontFamily: "Plus Jakarta Sans",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#1A1A1A",
                }}
              >
                Confirm Rejection
              </h3>
              <p
                className="text-center"
                style={{ fontSize: 14, color: "#A0A0A0", maxWidth: 360 }}
              >
                Are you sure you want to reject this order? This action cannot
                be undone. All farmers will be refunded.
              </p>
            </div>

            <div
              className="rounded-xl"
              style={{ backgroundColor: "#FEF2F2", padding: "12px 16px" }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: "#B03A2E" }}>
                Reason: {selectedReason}
              </p>
              {note && (
                <p style={{ fontSize: 13, color: "#B03A2E", marginTop: 4 }}>
                  Note: {note}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#F7F5F0",
                  color: "#1A1A1A",
                  height: 48,
                  fontSize: 14,
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#B03A2E",
                  color: "white",
                  height: 48,
                  fontSize: 14,
                  opacity: rejectMutation.isPending ? 0.7 : 1,
                }}
              >
                {rejectMutation.isPending ? "Rejecting…" : "Confirm Rejection"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
