"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Eye,
  Gavel,
  X,
  Search,
  Download,
  Package,
  ArrowRight,
} from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Cluster, Gig } from "@repo/api-client";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { formatCurrency, formatDate } from "../../lib/utils";

type FilterTab = "ALL" | "PAYMENT" | "DISPATCHED" | "COMPLETED" | "FAILED";
const PAGE_SIZE = 8;

const TABS: { label: string; value: string }[] = [
  { label: "All", value: "ALL" },
  { label: "New", value: "PAYMENT" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Rejected", value: "FAILED" },
];

interface BidState {
  clusterId: string;
  product: string;
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
  const [currentPage, setCurrentPage] = useState(1);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: () => vendorApi.getOrders(),
    refetchInterval: 15_000,
  });

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
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : pageStart + 1;
  const to = Math.min(pageStart + PAGE_SIZE, filtered.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
      .filter((p) => p.status === "SUCCESS" || p.status === "REFUNDED")
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
        g.product.toLowerCase() === cluster.product.toLowerCase() &&
        g.unit === cluster.unit,
    );
    setBidState({
      clusterId: cluster.id,
      product: cluster.product,
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

  const stat = [
    { label: "New orders", value: stats.new, accent: "leaf" as const },
    { label: "In progress", value: stats.inProgress, accent: "gold" as const },
    { label: "Fulfilled", value: stats.completed, accent: "clay" as const },
  ];

  const STAT_VALUE: Record<"leaf" | "gold" | "clay", string> = {
    leaf: "text-leaf-700",
    gold: "text-gold-700",
    clay: "text-clay-700",
  };

  return (
    <div className="flex flex-col gap-7">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 rise">
        <div>
          <h2
            className="font-display text-ink"
            style={{ fontSize: 26, fontWeight: 800 }}
          >
            Orders &amp; bids
          </h2>
          <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 3 }}>
            Place bids on open farmer clusters and track every order you win
            through to delivery.
          </p>
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────────── */}
      <div className="flex gap-4 rise" style={{ animationDelay: "60ms" }}>
        {stat.map(({ label, value, accent }) => (
          <div key={label} className="card flex-1 p-5">
            <p className="eyebrow">{label}</p>
            <p
              className={`tnum font-display mt-2.5 ${STAT_VALUE[accent]}`}
              style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.05 }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Open Clusters — place bids ─────────────────────────────────────── */}
      {unbidClusters.length > 0 && (
        <section
          className="panel overflow-hidden rise"
          style={{ animationDelay: "120ms" }}
        >
          <div
            className="flex items-center justify-between gap-3"
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid var(--color-line)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex items-center justify-center rounded-lg bg-gold-100 text-gold-700"
                style={{ width: 30, height: 30 }}
              >
                <Gavel size={15} />
              </span>
              <h3
                className="font-display text-ink"
                style={{ fontSize: 17, fontWeight: 700 }}
              >
                Open clusters to bid on
              </h3>
              <span className="pill bg-gold-100 text-gold-700 tnum">
                {unbidClusters.length} new
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            {(unbidClusters as Cluster[]).map((cluster) => (
              <div
                key={cluster.id}
                className="flex items-center justify-between gap-4 transition-colors hover:bg-sunk"
                style={{
                  padding: "16px 22px",
                  borderBottom: "1px solid var(--color-line)",
                }}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span
                    className="flex items-center justify-center rounded-xl bg-leaf-100 text-leaf-700 shrink-0"
                    style={{ width: 38, height: 38 }}
                  >
                    <Package size={17} />
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-ink truncate"
                      style={{ fontSize: 14, fontWeight: 600 }}
                    >
                      {cluster.product}
                    </p>
                    <p
                      className="text-ink-faint tnum truncate"
                      style={{ fontSize: 12.5, marginTop: 1 }}
                    >
                      {cluster.currentQuantity}/{cluster.targetQuantity}{" "}
                      {cluster.unit} · {getUniqueFarmerCount(cluster)} farmers
                      {cluster.district ? ` · ${cluster.district}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={cluster.status} />
                  <Button
                    onClick={() => openBidForm(cluster)}
                    variant="secondary"
                    size="sm"
                  >
                    <Gavel size={14} /> Place bid
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Bid dialog ─────────────────────────────────────────────────────── */}
      {bidState && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "oklch(0.27 0.014 60 / 0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setBidState(null);
          }}
        >
          <div
            className="panel flex flex-col gap-5 rise"
            style={{ width: 440, padding: 28, boxShadow: "var(--shadow-pop)" }}
          >
            <div className="flex items-center justify-between">
              <h3
                className="font-display text-ink"
                style={{ fontSize: 19, fontWeight: 700 }}
              >
                Place your bid
              </h3>
              <button
                onClick={() => setBidState(null)}
                className="flex items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
                style={{ width: 32, height: 32 }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="inset" style={{ padding: "14px 16px" }}>
              <p className="text-ink" style={{ fontSize: 14, fontWeight: 600 }}>
                {bidState.product}
              </p>
              <p
                className="text-ink-faint tnum"
                style={{ fontSize: 12.5, marginTop: 2 }}
              >
                Cluster needs {bidState.currentQuantity} {bidState.unit} total
              </p>
            </div>

            <div>
              <label className="field-label">
                Your price per {bidState.unit} (₹)
              </label>
              <input
                type="number"
                placeholder="e.g. 45"
                value={bidState.price}
                onChange={(e) =>
                  setBidState({ ...bidState, price: e.target.value })
                }
                className="field tnum"
                style={
                  bidError
                    ? { borderColor: "var(--color-danger)" }
                    : undefined
                }
              />
              {bidError && (
                <p className="text-danger" style={{ fontSize: 12.5, marginTop: 6 }}>
                  {bidError}
                </p>
              )}
            </div>

            <div>
              <label className="field-label">Note to farmers (optional)</label>
              <textarea
                placeholder="e.g. Certified organic, delivery within 3 days"
                value={bidState.note}
                onChange={(e) =>
                  setBidState({ ...bidState, note: e.target.value })
                }
                rows={3}
                className="field"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setBidState(null)}
                variant="ghost"
                block
              >
                Cancel
              </Button>
              <Button
                onClick={submitBid}
                disabled={placeBidMutation.isPending}
                variant="primary"
                block
              >
                {placeBidMutation.isPending ? "Placing…" : "Confirm bid"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Won Orders ─────────────────────────────────────────────────────── */}
      <section
        className="panel overflow-hidden rise"
        style={{ animationDelay: "180ms" }}
      >
        {/* Toolbar */}
        <div
          className="flex items-center justify-between gap-3 flex-wrap"
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--color-line)",
          }}
        >
          <div className="inset flex gap-1" style={{ padding: 4 }}>
            {TABS.map((tab) => {
              const isActive =
                activeTab === (tab.value as FilterTab | "IN_PROGRESS");
              return (
                <button
                  key={tab.value}
                  onClick={() =>
                    setActiveTab(tab.value as FilterTab | "IN_PROGRESS")
                  }
                  className={
                    isActive
                      ? "rounded-lg bg-leaf-600 text-white font-semibold"
                      : "rounded-lg text-ink-soft font-medium transition-colors hover:text-ink"
                  }
                  style={{ padding: "6px 14px", fontSize: 13 }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-2 rounded-xl text-ink-faint"
              style={{
                border: "1px solid var(--color-line)",
                height: 40,
                padding: "0 14px",
                width: 220,
                background: "var(--color-surface)",
              }}
            >
              <Search size={16} />
              <span style={{ fontSize: 13 }}>Search orders…</span>
            </div>
            <Button variant="ghost" size="sm">
              <Download size={15} />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Column header */}
        <div
          className="grid items-center bg-sunk"
          style={{
            gridTemplateColumns:
              "1.2fr 1.5fr 0.9fr 0.9fr 1fr 1.4fr 1fr 80px",
            padding: "11px 22px",
            borderBottom: "1px solid var(--color-line)",
          }}
        >
          {[
            "Order",
            "Product",
            "Qty",
            "Farmers",
            "Amount",
            "Status",
            "Date",
            "",
          ].map((h) => (
            <span key={h} className="eyebrow">
              {h}
            </span>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2" style={{ padding: "16px 22px" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3"
            style={{ padding: "52px 20px" }}
          >
            <div
              className="flex items-center justify-center rounded-2xl bg-leaf-50 text-leaf-600"
              style={{ width: 56, height: 56 }}
            >
              <Package size={26} />
            </div>
            <p
              className="font-display text-ink"
              style={{ fontSize: 16, fontWeight: 700 }}
            >
              No orders here yet
            </p>
            <p
              className="text-ink-faint"
              style={{ fontSize: 13, maxWidth: 380, textAlign: "center" }}
            >
              {activeTab === "ALL"
                ? "Win a bid on an open cluster above and your orders will land here, ready to fulfill."
                : "Nothing in this view right now. Try the All tab to see every order."}
            </p>
          </div>
        ) : (
          paginated.map((order) => {
            const deliveryProgress = getFarmerDeliveryProgress(order);
            return (
              <button
                key={order.id}
                onClick={() => router.push(`/orders/${order.id}`)}
                className="grid items-center w-full text-left transition-colors hover:bg-sunk"
                style={{
                  gridTemplateColumns:
                    "1.2fr 1.5fr 0.9fr 0.9fr 1fr 1.4fr 1fr 80px",
                  padding: "14px 22px",
                  borderBottom: "1px solid var(--color-line)",
                }}
              >
                <span
                  className="tnum text-leaf-700"
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  #{order.id.slice(-6).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p
                    className="text-ink truncate"
                    style={{ fontSize: 13.5, fontWeight: 600 }}
                  >
                    {order.product}
                  </p>
                  <p className="text-ink-faint truncate" style={{ fontSize: 12 }}>
                    {order.district ?? "Cluster"}
                  </p>
                </div>
                <span className="text-ink tnum" style={{ fontSize: 13 }}>
                  {order.currentQuantity} {order.unit}
                </span>
                <div className="flex flex-col">
                  <span className="text-ink tnum" style={{ fontSize: 13 }}>
                    {getUniqueFarmerCount(order)}
                  </span>
                  {(order.status === "DISPATCHED" ||
                    order.status === "OUT_FOR_DELIVERY" ||
                    order.status === "COMPLETED") && (
                    <span
                      className="text-ink-faint tnum"
                      style={{ fontSize: 11 }}
                    >
                      {deliveryProgress.delivered}/{deliveryProgress.total}{" "}
                      delivered
                    </span>
                  )}
                </div>
                <span className="text-ink tnum" style={{ fontSize: 13 }}>
                  {formatCurrency(getTotalAmount(order))}
                </span>
                <div>
                  <StatusBadge status={order.status} />
                </div>
                <span
                  className="text-ink-faint tnum"
                  style={{ fontSize: 12.5 }}
                >
                  {formatDate(order.createdAt)}
                </span>
                <span
                  className="flex items-center gap-1 text-leaf-700"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  <Eye size={14} />
                  View
                </span>
              </button>
            );
          })
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between bg-sunk"
          style={{ padding: "12px 22px" }}
        >
          <span className="text-ink-faint tnum" style={{ fontSize: 13 }}>
            Showing {from}–{to} of {filtered.length} order
            {filtered.length !== 1 ? "s" : ""}
          </span>
          {filtered.length > 0 && (
            <div className="flex items-center gap-2.5">
              <Button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                variant="ghost"
                size="sm"
              >
                Previous
              </Button>
              <span
                className="text-ink-soft tnum"
                style={{ fontSize: 12.5, minWidth: 72, textAlign: "center" }}
              >
                Page {currentPage} / {totalPages}
              </span>
              <Button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                variant="ghost"
                size="sm"
              >
                Next
                <ArrowRight size={14} />
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
