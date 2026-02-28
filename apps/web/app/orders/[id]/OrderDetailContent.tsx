"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Users,
} from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { formatCurrency, formatDate } from "../../../lib/utils";
import { useNotifications } from "../../../lib/NotificationContext";

interface RejectState {
  open: boolean;
  reason: string;
  note: string;
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
  loading,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="bg-white rounded-2xl flex flex-col gap-5"
        style={{ width: 400, padding: 28 }}
      >
        <p
          style={{
            fontFamily: "Plus Jakarta Sans",
            fontSize: 17,
            fontWeight: 700,
            color: "#1A1A1A",
          }}
        >
          {title}
        </p>
        {description && (
          <p style={{ fontSize: 13, color: "#5A5A5A", lineHeight: 1.5 }}>
            {description}
          </p>
        )}
        {children}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl font-medium"
            style={{
              height: 44,
              backgroundColor: "#EDE8DF",
              color: "#1A1A1A",
              fontSize: 14,
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl font-semibold"
            style={{
              height: 44,
              backgroundColor: confirmColor ?? "#2C5F2D",
              color: "white",
              fontSize: 14,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const ORDER_STEPS: {
  status: string;
  label: string;
  icon: React.ElementType;
}[] = [
  { status: "PAYMENT", label: "Order Received", icon: Clock },
  { status: "PROCESSING", label: "Processing", icon: Package },
  { status: "DISPATCHED", label: "Dispatched", icon: Truck },
  { status: "COMPLETED", label: "Delivered", icon: CheckCircle },
];

// Returns the index of the current step, or ORDER_STEPS.length if fully completed
function getStepIndex(status: string): number {
  if (status === "OUT_FOR_DELIVERY") {
    return ORDER_STEPS.findIndex((s) => s.status === "DISPATCHED");
  }
  const idx = ORDER_STEPS.findIndex((s) => s.status === status);
  if (idx !== -1) return idx;
  // COMPLETED = past the last step (fully done)
  if (status === "COMPLETED") return ORDER_STEPS.length;
  return -1; // unknown / FAILED / FORMING / etc.
}

export function OrderDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const [rejectState, setRejectState] = useState<RejectState>({
    open: false,
    reason: "",
    note: "",
  });
  const [confirmAction, setConfirmAction] = useState<
    null | "process" | "dispatch"
  >(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["vendor-order", id],
    queryFn: () => vendorApi.getOrderDetail(id),
  });

  const processMutation = useMutation({
    mutationFn: () => vendorApi.processOrder(id),
    onSuccess: () => {
      setConfirmAction(null);
      addNotification(`Order #${id.slice(-6).toUpperCase()} marked as processing.`);
      void queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: () => vendorApi.dispatchOrder(id),
    onSuccess: () => {
      setConfirmAction(null);
      addNotification(`Order #${id.slice(-6).toUpperCase()} marked as dispatched.`);
      void queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      vendorApi.rejectOrder(id, {
        reason: rejectState.reason,
        note: rejectState.note || undefined,
      }),
    onSuccess: () => {
      setRejectState({ open: false, reason: "", note: "" });
      void queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
  });

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
  const currentStepIdx = getStepIndex(cluster.status);
  const isFailed =
    cluster.status === "FAILED" || cluster.status === ("REJECTED" as string);
  // Fully completed = status is COMPLETED (past last ORDER_STEP) - farmer confirms delivery
  const isCompleted =
    cluster.status === "COMPLETED";

  function getNextAction() {
    switch (cluster.status) {
      case "PAYMENT":
        return {
          label: "Mark as Processing",
          action: () => setConfirmAction("process"),
          icon: Package,
        };
      case "PROCESSING":
      case "OUT_FOR_DELIVERY":
        return {
          label: "Mark as Dispatched",
          action: () => setConfirmAction("dispatch"),
          icon: Truck,
        };
      default:
        return null;
    }
  }

  const nextAction = getNextAction();
  const canReject =
    cluster.status === "PAYMENT" || cluster.status === "PROCESSING";

  function handleConfirmAction() {
    if (confirmAction === "process") processMutation.mutate();
    else if (confirmAction === "dispatch") dispatchMutation.mutate();
  }

  const isPending =
    processMutation.isPending ||
    dispatchMutation.isPending;

  const totalAmount = (cluster.payments ?? [])
    .filter((p) => p.status === "SUCCESS")
    .reduce((sum, p) => sum + p.amount, 0);

  const farmerDeliverySummary = Array.from(
    (cluster.members ?? []).reduce(
      (acc, member) => {
        const existing = acc.get(member.farmerId);
        if (existing) {
          existing.quantity += member.quantity;
          existing.totalOrders += 1;
          if (member.order?.status === "DELIVERED") {
            existing.deliveredOrders += 1;
          }
          return acc;
        }

        acc.set(member.farmerId, {
          farmerId: member.farmerId,
          farmerName: member.farmer?.name ?? member.farmer?.phone ?? "Farmer",
          quantity: member.quantity,
          totalOrders: 1,
          deliveredOrders: member.order?.status === "DELIVERED" ? 1 : 0,
        });
        return acc;
      },
      new Map<
        string,
        {
          farmerId: string;
          farmerName: string;
          quantity: number;
          totalOrders: number;
          deliveredOrders: number;
        }
      >(),
    ).values(),
  );
  const deliveredFarmers = farmerDeliverySummary.filter(
    (f) => f.totalOrders > 0 && f.deliveredOrders === f.totalOrders,
  ).length;
  const totalFarmers = farmerDeliverySummary.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/orders")}
          className="flex items-center justify-center rounded-xl hover:bg-white transition-colors"
          style={{
            width: 36,
            height: 36,
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
          }}
        >
          <ArrowLeft size={18} color="#5A5A5A" />
        </button>
        <div>
          <p
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 18,
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            Order #{cluster.id.slice(-6).toUpperCase()}
          </p>
          <p style={{ fontSize: 13, color: "#A0A0A0" }}>
            Created {formatDate(cluster.createdAt)}
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <StatusBadge status={cluster.status} />
        </div>
      </div>

      {/* Progress stepper */}
      {!isFailed && (
        <div className="bg-white rounded-2xl" style={{ padding: "20px 24px" }}>
          <p
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 14,
              fontWeight: 700,
              color: "#1A1A1A",
              marginBottom: 20,
            }}
          >
            Order Progress
          </p>
          <div className="flex items-center">
            {ORDER_STEPS.map((step, idx) => {
              // A step is "done" if we've passed it (current step index is greater)
              const done = currentStepIdx > idx;
              // A step is "active" if it's the current step and not fully completed
              const active = !isCompleted && currentStepIdx === idx;
              // If fully completed, all steps are done
              const allDone = isCompleted;
              const Icon = step.icon;
              return (
                <div key={step.status} className="flex items-center flex-1">
                  <div
                    className="flex flex-col items-center gap-1.5"
                    style={{ minWidth: 60 }}
                  >
                    <div
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 40,
                        height: 40,
                        backgroundColor:
                          allDone || done
                            ? "#2C5F2D"
                            : active
                              ? "#E8F5E9"
                              : "#F3F4F6",
                        border: active ? "2px solid #2C5F2D" : "none",
                      }}
                    >
                      <Icon
                        size={18}
                        color={
                          allDone || done
                            ? "white"
                            : active
                              ? "#2C5F2D"
                              : "#9CA3AF"
                        }
                      />
                    </div>
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: active || done || allDone ? 600 : 400,
                        color:
                          allDone || done
                            ? "#2C5F2D"
                            : active
                              ? "#1A1A1A"
                              : "#9CA3AF",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {step.label}
                    </p>
                  </div>
                  {idx < ORDER_STEPS.length - 1 && (
                    <div
                      style={{
                        flex: 1,
                        height: 2,
                        backgroundColor:
                          allDone || done ? "#2C5F2D" : "#E5E7EB",
                        marginBottom: 20,
                        marginLeft: 4,
                        marginRight: 4,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="flex gap-5">
        {/* Left: details */}
        <div className="flex flex-col gap-4 flex-1">
          {/* Cluster info */}
          <div className="bg-white rounded-2xl" style={{ padding: 20 }}>
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 14,
                fontWeight: 700,
                color: "#1A1A1A",
                marginBottom: 16,
              }}
            >
              Cluster Details
            </p>
            <div className="flex flex-col gap-3">
              {[
                { label: "Crop", value: cluster.cropName },
                {
                  label: "Quantity",
                  value: `${cluster.currentQuantity} ${cluster.unit}`,
                },
                {
                  label: "Target Quantity",
                  value: `${cluster.targetQuantity} ${cluster.unit}`,
                },
                {
                  label: "Total Amount",
                  value: formatCurrency(totalAmount),
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span style={{ fontSize: 13, color: "#A0A0A0" }}>
                    {label}
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Location */}
          {(cluster.district ?? cluster.state) && (
            <div
              className="bg-white rounded-2xl flex items-start gap-3"
              style={{ padding: 20 }}
            >
              <div
                className="flex items-center justify-center rounded-xl shrink-0"
                style={{ width: 36, height: 36, backgroundColor: "#F0FDF4" }}
              >
                <MapPin size={16} color="#2C5F2D" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>
                  Delivery Location
                </p>
                <p style={{ fontSize: 13, color: "#5A5A5A", marginTop: 2 }}>
                  {[cluster.district, cluster.state].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Members */}
          {(cluster.members ?? []).length > 0 && (
            <div className="bg-white rounded-2xl" style={{ padding: 20 }}>
              <div
                className="flex items-center gap-2"
                style={{ marginBottom: 12 }}
              >
                <Users size={15} color="#2C5F2D" />
                <p
                  style={{
                    fontFamily: "Plus Jakarta Sans",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1A1A1A",
                  }}
                >
                  Farmers ({deliveredFarmers}/{totalFarmers} delivered)
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {farmerDeliverySummary.slice(0, 5).map((m) => {
                  const isDelivered =
                    m.totalOrders > 0 && m.deliveredOrders === m.totalOrders;
                  const isPartial =
                    m.deliveredOrders > 0 && m.deliveredOrders < m.totalOrders;
                  return (
                  <div
                    key={m.farmerId}
                    className="flex justify-between items-center"
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "#F7F5F0",
                      borderRadius: 10,
                    }}
                  >
                    <div className="flex flex-col">
                      <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                        {m.farmerName}
                      </span>
                      <span style={{ fontSize: 12, color: "#5A5A5A" }}>
                        {m.quantity} {cluster.unit}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isDelivered
                          ? "#065F46"
                          : isPartial
                            ? "#92400E"
                            : "#6B7280",
                      }}
                    >
                      {isDelivered
                        ? "Delivered"
                        : isPartial
                          ? `Partial (${m.deliveredOrders}/${m.totalOrders})`
                          : "Pending"}
                    </span>
                  </div>
                );
                })}
                {farmerDeliverySummary.length > 5 && (
                  <p style={{ fontSize: 12, color: "#A0A0A0", paddingLeft: 4 }}>
                    +{farmerDeliverySummary.length - 5} more farmers
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex flex-col gap-4" style={{ width: 260 }}>
          <div
            className="bg-white rounded-2xl flex flex-col gap-3"
            style={{ padding: 20 }}
          >
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 14,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Actions
            </p>

            {isFailed && (
              <div
                className="rounded-xl flex items-center gap-2"
                style={{ backgroundColor: "#FEF2F2", padding: "12px 14px" }}
              >
                <XCircle size={16} color="#DC2626" />
                <p style={{ fontSize: 13, color: "#DC2626" }}>
                  This order has been rejected.
                </p>
              </div>
            )}

            {isCompleted && (
              <div
                className="rounded-xl flex items-center gap-2"
                style={{ backgroundColor: "#D1FAE5", padding: "12px 14px" }}
              >
                <CheckCircle size={16} color="#065F46" />
                <p style={{ fontSize: 13, color: "#065F46" }}>
                  Order successfully delivered.
                </p>
              </div>
            )}

            {!isFailed && !isCompleted && cluster.status === "PAYMENT" && (
              <div
                className="rounded-xl"
                style={{ backgroundColor: "#EFF6FF", padding: "12px 14px" }}
              >
                <p style={{ fontSize: 13, color: "#1D4ED8", lineHeight: 1.5 }}>
                  New order received. Review and start processing when ready.
                </p>
              </div>
            )}

            {!isFailed &&
              !isCompleted &&
              (cluster.status === "DISPATCHED" ||
                cluster.status === "OUT_FOR_DELIVERY") && (
                <div
                  className="rounded-xl"
                  style={{ backgroundColor: "#FEF3C7", padding: "12px 14px" }}
                >
                  <p style={{ fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>
                    {deliveredFarmers} of {totalFarmers} farmers confirmed
                    delivery.
                  </p>
                </div>
              )}

            {nextAction && (
              <button
                onClick={nextAction.action}
                className="flex items-center justify-center gap-2 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#2C5F2D",
                  color: "white",
                  height: 44,
                  fontSize: 14,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <nextAction.icon size={15} />
                {nextAction.label}
              </button>
            )}

            {canReject && (
              <button
                onClick={() =>
                  setRejectState({ open: true, reason: "", note: "" })
                }
                className="flex items-center justify-center gap-2 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#FEF2F2",
                  color: "#DC2626",
                  height: 44,
                  fontSize: 14,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <XCircle size={15} />
                Reject Order
              </button>
            )}
          </div>

          {/* Payment summary */}
          <div className="bg-white rounded-2xl" style={{ padding: 20 }}>
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 14,
                fontWeight: 700,
                color: "#1A1A1A",
                marginBottom: 12,
              }}
            >
              Payment
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span style={{ fontSize: 13, color: "#A0A0A0" }}>Total</span>
                <span
                  style={{ fontSize: 13, fontWeight: 700, color: "#2C5F2D" }}
                >
                  {formatCurrency(totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: 13, color: "#A0A0A0" }}>Payments</span>
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {cluster.payments?.length ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm action modal */}
      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction === "process"
              ? "Mark as Processing?"
              : "Mark as Dispatched?"
          }
          description={
            confirmAction === "process"
              ? "This will notify farmers that their order is being processed."
              : "This will notify farmers that their order has been dispatched."
          }
          confirmLabel={
            confirmAction === "process"
              ? "Confirm Processing"
              : "Confirm Dispatched"
          }
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
          loading={isPending}
        />
      )}

      {/* Reject modal */}
      {rejectState.open && (
        <ConfirmModal
          title="Reject Order"
          description="Please provide a reason for rejecting this order. Farmers will be notified."
          confirmLabel="Reject Order"
          confirmColor="#DC2626"
          onConfirm={() => {
            if (!rejectState.reason) return;
            rejectMutation.mutate();
          }}
          onCancel={() => setRejectState({ open: false, reason: "", note: "" })}
          loading={rejectMutation.isPending}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Reason <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <select
                value={rejectState.reason}
                onChange={(e) =>
                  setRejectState({ ...rejectState, reason: e.target.value })
                }
                className="w-full outline-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 12,
                  height: 44,
                  padding: "0 14px",
                  fontSize: 14,
                  border: "1.5px solid transparent",
                }}
              >
                <option value="">Select a reason…</option>
                <option value="OUT_OF_STOCK">Out of stock</option>
                <option value="PRICE_MISMATCH">Price mismatch</option>
                <option value="LOCATION_NOT_SERVICEABLE">
                  Location not serviceable
                </option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Additional note (optional)
              </label>
              <textarea
                value={rejectState.note}
                onChange={(e) =>
                  setRejectState({ ...rejectState, note: e.target.value })
                }
                rows={3}
                placeholder="Any additional details…"
                className="w-full outline-none resize-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  border: "1.5px solid transparent",
                }}
              />
            </div>
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}
