"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Eye, Gavel, X, Search, Download } from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Cluster, Gig } from "@repo/api-client";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency, formatDate } from "../../lib/utils";
import { useNotifications } from "../../lib/NotificationContext";

type FilterTab = "ALL" | "PAYMENT" | "DISPATCHED" | "COMPLETED" | "FAILED";

const TABS: { label: string; value: string }[] = [
  { label: "All", value: "ALL" },
  { label: "New", value: "PAYMENT" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Rejected", value: "FAILED" },
];

interface BidState {
  clusterId: string;
  cropName: string;
  unit: string;
  currentQuantity: number;
  gigId?: string;
  price: string;
  note: string;
}

export function OrdersContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FilterTab | "IN_PROGRESS">("ALL");
  const [bidState, setBidState] = useState<BidState | null>(null);
  const [bidError, setBidError] = useState("");
  const { addNotification } = useNotifications();
  const knownOrderIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: () => vendorApi.getOrders(),
    refetchInterval: 15_000,
  });

  // Detect newly accepted orders and fire notifications
  useEffect(() => {
    const currentOrders = orders as Cluster[];
    if (currentOrders.length === 0 && !seeded.current) return;

    if (!seeded.current) {
      // First successful load — seed all existing order IDs silently
      currentOrders.forEach((o) => knownOrderIds.current.add(o.id));
      seeded.current = true;
      return;
    }

    // Subsequent fetches — any order not yet known is a new one
    currentOrders
      .filter((o) => o.status === "PAYMENT")
      .forEach((o) => {
        if (!knownOrderIds.current.has(o.id)) {
          knownOrderIds.current.add(o.id);
          addNotification(
            `Your bid on ${o.cropName} was accepted! Order #${o.id.slice(-6).toUpperCase()} is now active.`,
            o.id,
          );
        }
      });
  }, [orders, addNotification]);

  // Open clusters vendor can bid on
  const { data: openClusters = [], refetch: refetchClusters } = useQuery({
    queryKey: ["vendor-clusters"],
    queryFn: () => vendorApi.getClusters(),
    refetchInterval: 30_000,
  });

  // Vendor's published gigs (for gigId linking)
  const { data: gigs = [] } = useQuery({
    queryKey: ["vendor-gigs", "PUBLISHED"],
    queryFn: () => vendorApi.getGigs("PUBLISHED"),
  });

  const placeBidMutation = useMutation({
    mutationFn: (data: {
      clusterId: string;
      gigId?: string;
      pricePerUnit: number;
      note?: string;
    }) =>
      vendorApi.placeBid(data.clusterId, {
        gigId: data.gigId,
        pricePerUnit: data.pricePerUnit,
        note: data.note,
      }),
    onSuccess: () => {
      setBidState(null);
      setBidError("");
      void queryClient.invalidateQueries({ queryKey: ["vendor-clusters"] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
      void refetchClusters();
    },
    onError: (err: unknown) => {
      setBidError(
        err instanceof Error ? err.message : "Failed to place bid. Try again.",
      );
    },
  });

  const unbidClusters = (openClusters as Cluster[]).filter(
    (c) => !c.bids || c.bids.length === 0,
  );

  const filtered = (orders as Cluster[]).filter((o) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "IN_PROGRESS") {
      // For "In Progress" tab, show orders currently being prepared/shipped.
      return (
        o.status === "PROCESSING" ||
        o.status === "OUT_FOR_DELIVERY" ||
        o.status === "DISPATCHED"
      );
    }
    return o.status === activeTab;
  });

  const stats = {
    new: (orders as Cluster[]).filter((o) => o.status === "PAYMENT").length,
    inProgress: (orders as Cluster[]).filter(
      (o) =>
        o.status === "PROCESSING" ||
        o.status === "OUT_FOR_DELIVERY" ||
        o.status === "DISPATCHED",
    ).length,
    completed: (orders as Cluster[]).filter((o) => o.status === "COMPLETED")
      .length,
  };

  function getTotalAmount(cluster: Cluster) {
    return (cluster.payments ?? [])
      .filter((p) => p.status === "SUCCESS")
      .reduce((sum, p) => sum + p.amount, 0);
  }

  function getUniqueFarmerCount(cluster: Cluster) {
    return new Set((cluster.members ?? []).map((m) => m.farmerId)).size;
  }

  function getFarmerDeliveryProgress(cluster: Cluster) {
    const byFarmer = new Map<string, { totalOrders: number; deliveredOrders: number }>();
    for (const member of cluster.members ?? []) {
      const state = byFarmer.get(member.farmerId) ?? {
        totalOrders: 0,
        deliveredOrders: 0,
      };
      state.totalOrders += 1;
      if (member.order?.status === "DELIVERED") {
        state.deliveredOrders += 1;
      }
      byFarmer.set(member.farmerId, state);
    }
    const total = byFarmer.size;
    const delivered = Array.from(byFarmer.values()).filter(
      (s) => s.totalOrders > 0 && s.deliveredOrders === s.totalOrders,
    ).length;
    return { delivered, total };
  }

  function openBidForm(cluster: Cluster) {
    // Find matching gig for this cluster
    const matchingGig = (gigs as Gig[]).find(
      (g) =>
        g.cropName.toLowerCase() === cluster.cropName.toLowerCase() &&
        g.unit === cluster.unit,
    );
    setBidState({
      clusterId: cluster.id,
      cropName: cluster.cropName,
      unit: cluster.unit,
      currentQuantity: cluster.currentQuantity,
      gigId: matchingGig?.id,
      price: matchingGig ? String(matchingGig.pricePerUnit) : "",
      note: "",
    });
    setBidError("");
  }

  function submitBid() {
    if (!bidState) return;
    const price = parseFloat(bidState.price);
    if (isNaN(price) || price <= 0) {
      setBidError("Enter a valid price per unit");
      return;
    }
    placeBidMutation.mutate({
      clusterId: bidState.clusterId,
      gigId: bidState.gigId,
      pricePerUnit: price,
      note: bidState.note || undefined,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats strip */}
      <div className="flex gap-3">
        {[
          { label: "New Orders", value: stats.new, color: "#1A1A1A" },
          { label: "Processing", value: stats.inProgress, color: "#2C5F2D" },
          {
            label: "Ready for Delivery",
            value: stats.completed,
            color: "#F59E0B",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-2xl"
            style={{
              flex: 1,
              backgroundColor: "#FFFFFF",
              padding: "14px 20px",
            }}
          >
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "Plus Jakarta Sans",
                color,
              }}
            >
              {value}
            </p>
            <p style={{ fontSize: 12, color: "#A0A0A0" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Open Clusters — place bids ─────────────────────────────────────── */}
      {unbidClusters.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Gavel size={16} color="#2C5F2D" />
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Open Clusters — Place Your Bid
            </p>
            <span
              style={{
                fontSize: 12,
                backgroundColor: "#D1FAE5",
                color: "#065F46",
                padding: "2px 8px",
                borderRadius: 20,
                fontWeight: 600,
              }}
            >
              {unbidClusters.length} new
            </span>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden">
            <div
              className="grid items-center"
              style={{
                gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 1.4fr 100px",
                padding: "10px 20px",
                backgroundColor: "#F7F5F0",
                borderBottom: "1px solid #F0EDE8",
              }}
            >
              {[
                "Crop / Location",
                "Quantity",
                "Target",
                "Farmers",
                "Status",
                "",
              ].map((h) => (
                <span
                  key={h}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#A0A0A0",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {h}
                </span>
              ))}
            </div>

            {(unbidClusters as Cluster[]).map((cluster, idx) => (
              <div
                key={cluster.id}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "1.5fr 1fr 1fr 0.8fr 1.4fr 100px",
                  padding: "14px 20px",
                  backgroundColor: idx % 2 === 1 ? "#FAFAF9" : "#FFFFFF",
                  borderBottom: "1px solid #F0EDE8",
                }}
              >
                <div>
                  <p
                    style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}
                  >
                    {cluster.cropName}
                  </p>
                  <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                    {cluster.district ?? "—"}
                    {cluster.state ? `, ${cluster.state}` : ""}
                  </p>
                </div>
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {cluster.currentQuantity} {cluster.unit}
                </span>
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {cluster.targetQuantity} {cluster.unit}
                </span>
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {getUniqueFarmerCount(cluster)}
                </span>
                <div>
                  <StatusBadge status={cluster.status} />
                </div>
                <button
                  onClick={() => openBidForm(cluster)}
                  className="flex items-center gap-1.5 rounded-xl font-semibold"
                  style={{
                    backgroundColor: "#2C5F2D",
                    color: "white",
                    fontSize: 13,
                    padding: "7px 14px",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Gavel size={13} />
                  Bid
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bid dialog ─────────────────────────────────────────────────────── */}
      {bidState && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setBidState(null);
          }}
        >
          <div
            className="bg-white rounded-2xl flex flex-col gap-5"
            style={{ width: 420, padding: 28 }}
          >
            <div className="flex items-center justify-between">
              <p
                style={{
                  fontFamily: "Plus Jakarta Sans",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#1A1A1A",
                }}
              >
                Place Bid
              </p>
              <button
                onClick={() => setBidState(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <X size={20} color="#A0A0A0" />
              </button>
            </div>

            <div
              className="rounded-xl"
              style={{ backgroundColor: "#F7F5F0", padding: "12px 16px" }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>
                {bidState.cropName} — {bidState.currentQuantity} {bidState.unit}
              </p>
              <p style={{ fontSize: 12, color: "#A0A0A0", marginTop: 2 }}>
                Cluster needs {bidState.currentQuantity} {bidState.unit} total
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Your Price per {bidState.unit} (₹) *
              </label>
              <input
                type="number"
                placeholder="e.g. 45"
                value={bidState.price}
                onChange={(e) =>
                  setBidState({ ...bidState, price: e.target.value })
                }
                className="outline-none w-full"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 12,
                  height: 48,
                  padding: "0 14px",
                  fontSize: 14,
                  border: bidError
                    ? "1.5px solid #EF4444"
                    : "1.5px solid transparent",
                }}
              />
              {bidError && (
                <p style={{ fontSize: 12, color: "#EF4444" }}>{bidError}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Note to farmers (optional)
              </label>
              <textarea
                placeholder="e.g. Certified organic, delivery within 3 days"
                value={bidState.note}
                onChange={(e) =>
                  setBidState({ ...bidState, note: e.target.value })
                }
                rows={3}
                className="outline-none w-full resize-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 14,
                  border: "1.5px solid transparent",
                }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBidState(null)}
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
                onClick={submitBid}
                disabled={placeBidMutation.isPending}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  height: 44,
                  backgroundColor: "#2C5F2D",
                  color: "white",
                  fontSize: 14,
                  border: "none",
                  cursor: placeBidMutation.isPending
                    ? "not-allowed"
                    : "pointer",
                  opacity: placeBidMutation.isPending ? 0.7 : 1,
                }}
              >
                {placeBidMutation.isPending ? "Placing…" : "Confirm Bid"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Won Orders ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: "#EDE8DF" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() =>
                setActiveTab(tab.value as FilterTab | "IN_PROGRESS")
              }
              className="rounded-lg font-medium transition-all"
              style={{
                padding: "6px 16px",
                fontSize: 13,
                backgroundColor:
                  activeTab === (tab.value as FilterTab | "IN_PROGRESS")
                    ? "#2C5F2D"
                    : "transparent",
                color:
                  activeTab === (tab.value as FilterTab | "IN_PROGRESS")
                    ? "white"
                    : "#A0A0A0",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          {/* Search */}
          <div
            className="flex items-center gap-2 rounded-xl"
            style={{
              backgroundColor: "#FFFFFF",
              height: 40,
              padding: "0 14px",
              width: 220,
            }}
          >
            <Search size={16} color="#A0A0A0" />
            <span style={{ fontSize: 13, color: "#A0A0A0" }}>
              Search orders...
            </span>
          </div>
          {/* Export CSV */}
          <button
            className="flex items-center gap-1.5 rounded-lg"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#2C5F2D",
              fontSize: 13,
              fontWeight: 600,
              height: 40,
              padding: "0 16px",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Download size={15} color="#2C5F2D" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden">
        {/* Header */}
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: "1.2fr 1.5fr 1fr 0.8fr 1fr 1.4fr 1fr 80px",
            padding: "12px 20px",
            backgroundColor: "#F7F5F0",
            borderBottom: "1px solid #F0EDE8",
          }}
        >
          {[
            "Order ID",
            "Cluster / Crop",
            "Qty",
            "Farmers",
            "Amount",
            "Status",
            "Date",
            "",
          ].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#A0A0A0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          <div
            className="flex items-center justify-center"
            style={{ height: 200 }}
          >
            <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading orders…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3"
            style={{ height: 200 }}
          >
            <p style={{ fontSize: 14, color: "#A0A0A0" }}>
              No orders yet. Place bids on open clusters above to get started.
            </p>
          </div>
        ) : (
          filtered.map((order, idx) => {
            const deliveryProgress = getFarmerDeliveryProgress(order);
            return (
              <div
                key={order.id}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "1.2fr 1.5fr 1fr 0.8fr 1fr 1.4fr 1fr 80px",
                  padding: "14px 20px",
                  backgroundColor: idx % 2 === 1 ? "#FAFAF9" : "#FFFFFF",
                  borderBottom: "1px solid #F0EDE8",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#2C5F2D",
                    fontFamily: "monospace",
                  }}
                >
                  #{order.id.slice(-6).toUpperCase()}
                </span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>
                    {order.cropName}
                  </p>
                  <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                    {order.district ?? "Cluster"}
                  </p>
                </div>
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {order.currentQuantity} {order.unit}
                </span>
                <div className="flex flex-col">
                  <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                    {getUniqueFarmerCount(order)}
                  </span>
                  {(order.status === "DISPATCHED" ||
                    order.status === "OUT_FOR_DELIVERY" ||
                    order.status === "COMPLETED") && (
                    <span style={{ fontSize: 11, color: "#A0A0A0" }}>
                      {deliveryProgress.delivered}/{deliveryProgress.total} delivered
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {formatCurrency(getTotalAmount(order))}
                </span>
                <div>
                  <StatusBadge status={order.status} />
                </div>
                <span style={{ fontSize: 13, color: "#A0A0A0" }}>
                  {formatDate(order.createdAt)}
                </span>
                <button
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="flex items-center gap-1 rounded-lg font-medium hover:bg-[#F7F5F0] transition-colors"
                  style={{ padding: "6px 10px", fontSize: 13, color: "#2C5F2D" }}
                >
                  <Eye size={14} />
                  View
                </button>
              </div>
            );
          })
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "12px 20px", backgroundColor: "#F7F5F0" }}
        >
          <span style={{ fontSize: 13, color: "#A0A0A0" }}>
            {filtered.length} order{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
