"use client";

import { useEffect, useRef, useState } from "react";
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
import { Button } from "../../../components/ui/Button";
import { formatCurrency, formatDate } from "../../../lib/utils";
import { useNotifications } from "../../../lib/NotificationContext";

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
      style={{ backgroundColor: "oklch(0.27 0.014 60 / 0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="panel flex flex-col gap-5 rise"
        style={{ width: 420, padding: 28, boxShadow: "var(--shadow-pop)" }}
      >
        <h3
          className="font-display text-ink"
          style={{ fontSize: 19, fontWeight: 700 }}
        >
          {title}
        </h3>
        {description && (
          <p className="text-ink-soft" style={{ fontSize: 14, lineHeight: 1.55 }}>
            {description}
          </p>
        )}
        {children}
        <div className="flex gap-3">
          <Button onClick={onCancel} variant="ghost" block>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            variant={confirmColor === "danger" ? "danger" : "primary"}
            block
          >
            {loading ? "Processing…" : confirmLabel}
          </Button>
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
  const previousStatusRef = useRef<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    null | "process" | "dispatch"
  >(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["vendor-order", id],
    queryFn: () => vendorApi.getOrderDetail(id),
    refetchInterval: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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

  useEffect(() => {
    const cluster = order as Cluster | undefined;
    if (!cluster) return;

    const prev = previousStatusRef.current;
    if (prev && prev !== "COMPLETED" && cluster.status === "COMPLETED") {
      addNotification(
        `Order #${id.slice(-6).toUpperCase()} has been delivered.`,
        id,
        {
          title: "Order Delivered",
          type: "order_delivered",
          dedupeKey: `order_delivered:${id}`,
        },
      );
    }

    previousStatusRef.current = cluster.status;
  }, [order, id, addNotification]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="skeleton" style={{ height: 56, maxWidth: 320 }} />
        <div className="skeleton" style={{ height: 120 }} />
        <div className="flex gap-5">
          <div className="skeleton flex-1" style={{ height: 260 }} />
          <div className="skeleton" style={{ width: 260, height: 260 }} />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4"
        style={{ height: 320 }}
      >
        <div
          className="flex items-center justify-center rounded-2xl bg-sunk text-ink-faint"
          style={{ width: 56, height: 56 }}
        >
          <Package size={26} />
        </div>
        <p
          className="font-display text-ink"
          style={{ fontSize: 16, fontWeight: 700 }}
        >
          Order not found
        </p>
        <Button onClick={() => router.push("/orders")} variant="primary">
          Back to orders
        </Button>
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
          label: "Mark as processing",
          action: () => setConfirmAction("process"),
          icon: Package,
        };
      case "PROCESSING":
      case "OUT_FOR_DELIVERY":
        return {
          label: "Mark as dispatched",
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
    .filter((p) => p.status === "SUCCESS" || p.status === "REFUNDED")
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

  const ICON_FOR_STATUS = nextAction?.icon;

  return (
    <div className="flex flex-col gap-5">
      {/* Back + header */}
      <div className="flex items-center gap-3 rise">
        <button
          onClick={() => router.push("/orders")}
          className="flex items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-sunk hover:text-ink"
          style={{
            width: 38,
            height: 38,
            border: "1px solid var(--color-line)",
            background: "var(--color-surface)",
          }}
          aria-label="Back to orders"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2
            className="font-display text-ink tnum"
            style={{ fontSize: 22, fontWeight: 800 }}
          >
            Order #{cluster.id.slice(-6).toUpperCase()}
          </h2>
          <p className="text-ink-faint" style={{ fontSize: 13, marginTop: 2 }}>
            {cluster.product} · Created {formatDate(cluster.createdAt)}
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <StatusBadge status={cluster.status} />
        </div>
      </div>

      {/* Progress stepper */}
      {!isFailed && (
        <section
          className="card rise"
          style={{ padding: "22px 24px", animationDelay: "60ms" }}
        >
          <p
            className="font-display text-ink"
            style={{ fontSize: 16, fontWeight: 700, marginBottom: 22 }}
          >
            Order progress
          </p>
          <div className="flex items-start">
            {ORDER_STEPS.map((step, idx) => {
              // A step is "done" if we've passed it (current step index is greater)
              const done = currentStepIdx > idx;
              // A step is "active" if it's the current step and not fully completed
              const active = !isCompleted && currentStepIdx === idx;
              // If fully completed, all steps are done
              const allDone = isCompleted;
              const reached = allDone || done;
              const Icon = step.icon;
              return (
                <div key={step.status} className="flex items-start flex-1">
                  <div
                    className="flex flex-col items-center gap-2"
                    style={{ minWidth: 64 }}
                  >
                    <div
                      className={
                        reached
                          ? "flex items-center justify-center rounded-full bg-leaf-600 text-white"
                          : active
                            ? "flex items-center justify-center rounded-full bg-leaf-100 text-leaf-700"
                            : "flex items-center justify-center rounded-full bg-sunk text-ink-faint"
                      }
                      style={{
                        width: 44,
                        height: 44,
                        border: active
                          ? "2px solid var(--color-leaf-600)"
                          : "2px solid transparent",
                      }}
                    >
                      <Icon size={19} />
                    </div>
                    <p
                      className={
                        reached
                          ? "text-leaf-700"
                          : active
                            ? "text-ink"
                            : "text-ink-faint"
                      }
                      style={{
                        fontSize: 12,
                        fontWeight: reached || active ? 600 : 500,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {step.label}
                    </p>
                  </div>
                  {idx < ORDER_STEPS.length - 1 && (
                    <div
                      className={reached ? "bg-leaf-600" : "bg-line"}
                      style={{
                        flex: 1,
                        height: 2,
                        marginTop: 21,
                        marginLeft: 4,
                        marginRight: 4,
                        borderRadius: 999,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Main content grid */}
      <div className="flex gap-5 rise" style={{ animationDelay: "120ms" }}>
        {/* Left: details */}
        <div className="flex flex-col gap-4 flex-1">
          {/* Cluster info */}
          <section className="card" style={{ padding: 22 }}>
            <p
              className="font-display text-ink"
              style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}
            >
              Cluster details
            </p>
            <div className="flex flex-col gap-1">
              {[
                { label: "Product", value: cluster.product },
                {
                  label: "Quantity",
                  value: `${cluster.currentQuantity} ${cluster.unit}`,
                },
                {
                  label: "Target quantity",
                  value: `${cluster.targetQuantity} ${cluster.unit}`,
                },
                {
                  label: "Total amount",
                  value: formatCurrency(totalAmount),
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between items-center"
                  style={{ padding: "8px 0" }}
                >
                  <span className="text-ink-soft" style={{ fontSize: 13.5 }}>
                    {label}
                  </span>
                  <span
                    className="text-ink tnum"
                    style={{ fontSize: 13.5, fontWeight: 600 }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Location */}
          {(cluster.district ?? cluster.state) && (
            <section
              className="card flex items-start gap-3"
              style={{ padding: 22 }}
            >
              <div
                className="flex items-center justify-center rounded-xl bg-leaf-50 text-leaf-600 shrink-0"
                style={{ width: 38, height: 38 }}
              >
                <MapPin size={17} />
              </div>
              <div>
                <p className="text-ink" style={{ fontSize: 14, fontWeight: 600 }}>
                  Delivery location
                </p>
                <p className="text-ink-soft" style={{ fontSize: 13.5, marginTop: 2 }}>
                  {[cluster.district, cluster.state].filter(Boolean).join(", ")}
                </p>
              </div>
            </section>
          )}

          {/* Members */}
          {(cluster.members ?? []).length > 0 && (
            <section className="card" style={{ padding: 22 }}>
              <div
                className="flex items-center gap-2"
                style={{ marginBottom: 14 }}
              >
                <span
                  className="flex items-center justify-center rounded-lg bg-leaf-50 text-leaf-600"
                  style={{ width: 28, height: 28 }}
                >
                  <Users size={15} />
                </span>
                <p
                  className="font-display text-ink"
                  style={{ fontSize: 16, fontWeight: 700 }}
                >
                  Farmers
                </p>
                <span className="pill bg-sunk text-ink-soft tnum">
                  {deliveredFarmers}/{totalFarmers} delivered
                </span>
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
                      className="inset flex justify-between items-center"
                      style={{ padding: "10px 14px" }}
                    >
                      <div className="flex flex-col">
                        <span className="text-ink" style={{ fontSize: 13.5 }}>
                          {m.farmerName}
                        </span>
                        <span
                          className="text-ink-faint tnum"
                          style={{ fontSize: 12 }}
                        >
                          {m.quantity} {cluster.unit}
                        </span>
                      </div>
                      <span
                        className={
                          isDelivered
                            ? "pill bg-leaf-50 text-leaf-700"
                            : isPartial
                              ? "pill bg-gold-100 text-gold-700"
                              : "pill bg-sunk text-ink-soft"
                        }
                      >
                        {isDelivered
                          ? "Delivered"
                          : isPartial
                            ? `Partial ${m.deliveredOrders}/${m.totalOrders}`
                            : "Pending"}
                      </span>
                    </div>
                  );
                })}
                {farmerDeliverySummary.length > 5 && (
                  <p
                    className="text-ink-faint"
                    style={{ fontSize: 12.5, paddingLeft: 4, marginTop: 2 }}
                  >
                    +{farmerDeliverySummary.length - 5} more farmers
                  </p>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex flex-col gap-4" style={{ width: 264 }}>
          <section className="card flex flex-col gap-3" style={{ padding: 22 }}>
            <p
              className="font-display text-ink"
              style={{ fontSize: 16, fontWeight: 700 }}
            >
              Actions
            </p>

            {isFailed && (
              <div
                className="rounded-xl flex items-start gap-2.5"
                style={{ background: "var(--color-danger-bg)", padding: "12px 14px" }}
              >
                <XCircle size={16} className="text-danger shrink-0" style={{ marginTop: 1 }} />
                <p className="text-danger" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  This order has been rejected.
                </p>
              </div>
            )}

            {isCompleted && (
              <div
                className="rounded-xl flex items-start gap-2.5"
                style={{ background: "var(--color-success-bg)", padding: "12px 14px" }}
              >
                <CheckCircle size={16} className="text-success shrink-0" style={{ marginTop: 1 }} />
                <p className="text-success" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  Order successfully delivered.
                </p>
              </div>
            )}

            {!isFailed && !isCompleted && cluster.status === "PAYMENT" && (
              <div
                className="rounded-xl flex items-start gap-2.5"
                style={{ background: "var(--color-info-bg)", padding: "12px 14px" }}
              >
                <Clock size={16} className="text-info shrink-0" style={{ marginTop: 1 }} />
                <p className="text-info" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  New order received. Review and start processing when ready.
                </p>
              </div>
            )}

            {!isFailed &&
              !isCompleted &&
              (cluster.status === "DISPATCHED" ||
                cluster.status === "OUT_FOR_DELIVERY") && (
                <div
                  className="rounded-xl flex items-start gap-2.5"
                  style={{ background: "var(--color-warning-bg)", padding: "12px 14px" }}
                >
                  <Truck size={16} className="text-warning shrink-0" style={{ marginTop: 1 }} />
                  <p className="text-warning" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {deliveredFarmers} of {totalFarmers} farmers confirmed
                    delivery.
                  </p>
                </div>
              )}

            {nextAction && ICON_FOR_STATUS && (
              <Button onClick={nextAction.action} variant="primary" block>
                <ICON_FOR_STATUS size={16} />
                {nextAction.label}
              </Button>
            )}

            {canReject && (
              <Button
                onClick={() => router.push(`/orders/${id}/reject`)}
                variant="ghost"
                block
              >
                <XCircle size={15} className="text-danger" />
                Reject order
              </Button>
            )}
          </section>

          {/* Payment summary */}
          <section className="card" style={{ padding: 22 }}>
            <p
              className="font-display text-ink"
              style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}
            >
              Payment
            </p>
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-ink-soft" style={{ fontSize: 13.5 }}>
                  Total
                </span>
                <span
                  className="text-leaf-700 tnum"
                  style={{ fontSize: 15, fontWeight: 700 }}
                >
                  {formatCurrency(totalAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-soft" style={{ fontSize: 13.5 }}>
                  Payments
                </span>
                <span className="text-ink tnum" style={{ fontSize: 13.5 }}>
                  {cluster.payments?.length ?? 0}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Confirm action modal */}
      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction === "process"
              ? "Mark as processing?"
              : "Mark as dispatched?"
          }
          description={
            confirmAction === "process"
              ? "This will notify farmers that their order is being processed."
              : "This will notify farmers that their order has been dispatched."
          }
          confirmLabel={
            confirmAction === "process"
              ? "Confirm processing"
              : "Confirm dispatched"
          }
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
          loading={isPending}
        />
      )}
    </div>
  );
}
