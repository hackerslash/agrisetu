"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, XCircle, Truck, Package } from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { formatCurrency, formatDate } from "../../../lib/utils";
import { RejectModal } from "./RejectModal";

const ORDER_TIMELINE = [
  { label: "Order Received", statuses: ["PAYMENT", "DISPATCHED", "COMPLETED"] },
  { label: "Accepted", statuses: ["DISPATCHED", "COMPLETED"] },
  { label: "Dispatched", statuses: ["DISPATCHED", "COMPLETED"] },
  { label: "Delivered", statuses: ["COMPLETED"] },
];

export function OrderDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRejectModal, setShowRejectModal] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["vendor-order", id],
    queryFn: () => vendorApi.getOrderDetail(id),
  });

  const acceptMutation = useMutation({
    mutationFn: () => vendorApi.acceptOrder(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: () => vendorApi.dispatchOrder(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: () => vendorApi.deliverOrder(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vendor-order", id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>Order not found.</p>
      </div>
    );
  }

  const cluster = order as Cluster;
  const totalAmount = (cluster.payments ?? [])
    .filter((p) => p.status === "SUCCESS")
    .reduce((sum, p) => sum + p.amount, 0);

  function isStepDone(statuses: string[]) {
    return statuses.includes(cluster.status);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Back + header */}
      <button
        onClick={() => router.push("/orders")}
        className="flex items-center gap-2 w-fit"
        style={{ fontSize: 14, color: "#A0A0A0" }}
      >
        <ArrowLeft size={16} />
        Back to Orders
      </button>

      {/* 3-column layout */}
      <div className="flex gap-6" style={{ minHeight: 500 }}>
        {/* Left: Timeline */}
        <div
          className="bg-white rounded-2xl flex flex-col gap-4"
          style={{ width: 220, padding: 20, flexShrink: 0 }}
        >
          <p
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 15,
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            Timeline
          </p>
          <div className="flex flex-col gap-0">
            {ORDER_TIMELINE.map((step, idx) => {
              const done = isStepDone(step.statuses);
              const isLast = idx === ORDER_TIMELINE.length - 1;
              return (
                <div key={step.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="flex items-center justify-center rounded-full flex-shrink-0"
                      style={{
                        width: 24,
                        height: 24,
                        backgroundColor: done ? "#2C5F2D" : "#EDE8DF",
                        marginTop: 2,
                      }}
                    >
                      {done ? (
                        <CheckCircle size={14} color="white" />
                      ) : (
                        <div
                          className="rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: "#A0A0A0",
                          }}
                        />
                      )}
                    </div>
                    {!isLast && (
                      <div
                        style={{
                          width: 2,
                          height: 32,
                          backgroundColor: done ? "#2C5F2D" : "#EDE8DF",
                          margin: "4px 0",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ paddingBottom: isLast ? 0 : 8 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: done ? 600 : 400,
                        color: done ? "#1A1A1A" : "#A0A0A0",
                      }}
                    >
                      {step.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Summary + Actions */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Order summary card */}
          <div
            className="bg-white rounded-2xl flex flex-col gap-4"
            style={{ padding: 20 }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3
                  style={{
                    fontFamily: "Plus Jakarta Sans",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1A1A1A",
                  }}
                >
                  Cluster #{cluster.id.slice(-6).toUpperCase()}
                </h3>
                <p style={{ fontSize: 13, color: "#A0A0A0", marginTop: 2 }}>
                  Created {formatDate(cluster.createdAt)}
                </p>
              </div>
              <StatusBadge status={cluster.status} />
            </div>

            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              {[
                { label: "Crop", value: cluster.cropName },
                {
                  label: "Total Quantity",
                  value: `${cluster.currentQuantity} ${cluster.unit}`,
                },
                {
                  label: "Farmers",
                  value: `${cluster.members?.length ?? 0} members`,
                },
                { label: "District", value: cluster.district ?? "—" },
                { label: "State", value: cluster.state ?? "—" },
                { label: "Total Amount", value: formatCurrency(totalAmount) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ fontSize: 12, color: "#A0A0A0" }}>{label}</p>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#1A1A1A",
                      marginTop: 2,
                    }}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Farmers in cluster */}
          {(cluster.members?.length ?? 0) > 0 && (
            <div
              className="bg-white rounded-2xl flex flex-col gap-3"
              style={{ padding: 20 }}
            >
              <p
                style={{
                  fontFamily: "Plus Jakarta Sans",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#1A1A1A",
                }}
              >
                Cluster Farmers
              </p>
              {cluster.members?.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-xl"
                  style={{ padding: "10px 14px", backgroundColor: "#F7F5F0" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 32,
                        height: 32,
                        backgroundColor: "#2C5F2D",
                        color: "white",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {member.farmer?.name?.[0]?.toUpperCase() ?? "F"}
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1A1A1A",
                        }}
                      >
                        {member.farmer?.name ??
                          member.farmer?.phone ??
                          "Farmer"}
                      </p>
                      <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                        {member.quantity} {cluster.unit}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.hasPaid ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: "#065F46",
                          fontWeight: 500,
                        }}
                      >
                        ✓ Paid
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#D97706" }}>
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {cluster.status === "PAYMENT" && (
            <div className="flex gap-3">
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#2C5F2D",
                  color: "white",
                  height: 52,
                  fontSize: 15,
                }}
              >
                <CheckCircle size={18} />
                Accept Order
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex items-center justify-center gap-2 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#FEF2F2",
                  color: "#B03A2E",
                  height: 52,
                  fontSize: 15,
                  padding: "0 24px",
                }}
              >
                <XCircle size={18} />
                Reject
              </button>
            </div>
          )}

          {cluster.status === "DISPATCHED" && (
            <button
              onClick={() => deliverMutation.mutate()}
              disabled={deliverMutation.isPending}
              className="flex items-center justify-center gap-2 rounded-xl font-semibold"
              style={{
                backgroundColor: "#2C5F2D",
                color: "white",
                height: 52,
                fontSize: 15,
              }}
            >
              <Package size={18} />
              Mark as Delivered
            </button>
          )}

          {cluster.status !== "DISPATCHED" &&
            cluster.status !== "COMPLETED" &&
            cluster.status !== "FAILED" &&
            cluster.status !== "PAYMENT" && (
              <button
                onClick={() => dispatchMutation.mutate()}
                disabled={dispatchMutation.isPending}
                className="flex items-center justify-center gap-2 rounded-xl font-semibold"
                style={{
                  backgroundColor: "#2C5F2D",
                  color: "white",
                  height: 52,
                  fontSize: 15,
                }}
              >
                <Truck size={18} />
                Mark as Dispatched
              </button>
            )}
        </div>

        {/* Right: Payment info */}
        <div
          className="flex flex-col gap-4"
          style={{ width: 280, flexShrink: 0 }}
        >
          <div
            className="bg-white rounded-2xl flex flex-col gap-4"
            style={{ padding: 20 }}
          >
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Payment Summary
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between">
                <span style={{ fontSize: 13, color: "#A0A0A0" }}>
                  Total Amount
                </span>
                <span
                  style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}
                >
                  {formatCurrency(totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: 13, color: "#A0A0A0" }}>
                  Paid Farmers
                </span>
                <span
                  style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}
                >
                  {cluster.members?.filter((m) => m.hasPaid).length ?? 0} /{" "}
                  {cluster.members?.length ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: 13, color: "#A0A0A0" }}>
                  Escrow Status
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color:
                      cluster.status === "COMPLETED" ? "#065F46" : "#D97706",
                  }}
                >
                  {cluster.status === "COMPLETED" ? "Released" : "In Escrow"}
                </span>
              </div>
            </div>

            <div
              className="rounded-xl p-3"
              style={{ backgroundColor: "#FFF3CD" }}
            >
              <p style={{ fontSize: 12, color: "#D97706", lineHeight: 1.5 }}>
                Payment is held in escrow and released after delivery
                confirmation.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <RejectModal
          clusterId={id}
          onClose={() => setShowRejectModal(false)}
          onSuccess={() => {
            setShowRejectModal(false);
            void queryClient.invalidateQueries({
              queryKey: ["vendor-order", id],
            });
            void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
          }}
        />
      )}
    </div>
  );
}
