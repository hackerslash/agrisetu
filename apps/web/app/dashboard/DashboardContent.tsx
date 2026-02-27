"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  IndianRupee,
  ShoppingCart,
  GitMerge,
  Star,
  CheckCircle,
  Gavel,
} from "lucide-react";
import { vendorApi, authApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { MetricCard } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency, formatDate, formatShortDate } from "../../lib/utils";

export function DashboardContent() {
  const router = useRouter();

  const { data: vendor } = useQuery({
    queryKey: ["vendor-me"],
    queryFn: () => authApi.getMe(),
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics", "30d"],
    queryFn: () => vendorApi.getAnalytics("30d"),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: () => vendorApi.getOrders(),
  });

  // Open clusters vendor can bid on (FORMING / VOTING matching their gigs)
  const { data: openClusters = [] } = useQuery({
    queryKey: ["vendor-clusters"],
    queryFn: () => vendorApi.getClusters(),
    refetchInterval: 30_000, // poll every 30s for new clusters
  });

  // Urgent orders = PAYMENT status (awaiting dispatch)
  const urgentOrders = (orders as Cluster[]).filter(
    (o) => o.status === "PAYMENT" || o.status === "DISPATCHED",
  );

  // Clusters vendor hasn't bid on yet (no bids entry in response)
  const unbidClusters = (openClusters as Cluster[]).filter(
    (c) => !c.bids || c.bids.length === 0,
  );

  const recentOrders = (orders as Cluster[]).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      {/* Greet row */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 18,
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            Good morning, {vendor?.businessName ?? "Vendor"} 👋
          </h2>
          <p style={{ fontSize: 13, color: "#A0A0A0", marginTop: 2 }}>
            Here&apos;s what&apos;s happening with your orders today.
          </p>
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex gap-4">
        <MetricCard
          label="Total Revenue"
          value={formatCurrency(analytics?.totalRevenue ?? 0)}
          sub="Last 30 days"
          icon={<IndianRupee size={20} color="#2C5F2D" />}
        />
        <MetricCard
          label="Active Orders"
          value={orders.length}
          sub="All clusters"
          icon={<ShoppingCart size={20} color="#D97706" />}
        />
        <MetricCard
          label="Pending Bids"
          value={analytics?.bidWinRate ? `${analytics.bidWinRate}%` : "—"}
          sub="Win rate"
          icon={<GitMerge size={20} color="#7E22CE" />}
        />
        <MetricCard
          label="Avg Rating"
          value={analytics?.avgRating ? `${analytics.avgRating}/5` : "—"}
          sub={`${analytics?.ratingsCount ?? 0} ratings`}
          icon={<Star size={20} color="#D97706" />}
        />
      </div>

      {/* Mid row: chart + recent orders */}
      <div className="flex gap-4" style={{ height: 300 }}>
        {/* Revenue chart */}
        <div
          className="flex-1 rounded-2xl bg-white"
          style={{ padding: "20px 20px 12px" }}
        >
          <p
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 15,
              fontWeight: 700,
              color: "#1A1A1A",
              marginBottom: 16,
            }}
          >
            Revenue Overview
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={analytics?.revenueChart ?? []}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2C5F2D" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2C5F2D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => formatShortDate(v)}
                tick={{ fontSize: 11, fill: "#A0A0A0" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: "#A0A0A0" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                formatter={(v: number | undefined) => [
                  formatCurrency(v ?? 0),
                  "Revenue",
                ]}
                labelFormatter={(l) =>
                  typeof l === "string" ? formatDate(l) : String(l)
                }
                contentStyle={{
                  borderRadius: 12,
                  border: "none",
                  fontSize: 13,
                }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#2C5F2D"
                strokeWidth={2}
                fill="url(#colorRev)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent orders */}
        <div
          className="rounded-2xl bg-white flex flex-col"
          style={{ width: 340, padding: 20 }}
        >
          <p
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 15,
              fontWeight: 700,
              color: "#1A1A1A",
              marginBottom: 16,
            }}
          >
            Recent Orders
          </p>
          <div className="flex flex-col gap-3 flex-1 overflow-auto">
            {recentOrders.length === 0 ? (
              <p style={{ fontSize: 13, color: "#A0A0A0" }}>No orders yet.</p>
            ) : (
              recentOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="flex items-center justify-between w-full text-left rounded-xl p-3 hover:bg-[#F7F5F0] transition-colors"
                >
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#1A1A1A",
                      }}
                    >
                      {order.cropName}
                    </p>
                    <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                      {order.currentQuantity} {order.unit} ·{" "}
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Open clusters — needs vendor bid */}
      {unbidClusters.length > 0 && (
        <div className="flex flex-col gap-3">
          <p
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 15,
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            New Clusters — Place a Bid
          </p>
          {(unbidClusters as Cluster[]).slice(0, 5).map((cluster) => (
            <div
              key={cluster.id}
              className="bg-white rounded-2xl flex items-center justify-between"
              style={{ padding: "16px 20px" }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
                  {cluster.cropName} — {cluster.unit}
                </p>
                <p style={{ fontSize: 12, color: "#A0A0A0", marginTop: 2 }}>
                  {cluster.currentQuantity}/{cluster.targetQuantity} {cluster.unit} ·{" "}
                  {cluster.members?.length ?? 0} farmers
                  {cluster.district ? ` · ${cluster.district}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={cluster.status} />
                <button
                  onClick={() => router.push(`/orders`)}
                  className="flex items-center gap-1.5 rounded-xl font-semibold"
                  style={{
                    backgroundColor: "#2C5F2D",
                    color: "white",
                    fontSize: 13,
                    padding: "8px 16px",
                  }}
                >
                  <Gavel size={14} />
                  Bid
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Urgent orders section */}
      {urgentOrders.length > 0 && (
        <div className="flex flex-col gap-3">
          <p
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 15,
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            Urgent — Awaiting Action
          </p>
          {urgentOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-2xl flex items-center justify-between"
              style={{ padding: "16px 20px" }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
                  Cluster #{order.id.slice(-6).toUpperCase()} — {order.cropName}
                </p>
                <p style={{ fontSize: 12, color: "#A0A0A0", marginTop: 2 }}>
                  {order.currentQuantity} {order.unit} ·{" "}
                  {order.members?.length ?? 0} farmers
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={order.status} />
                <button
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="flex items-center gap-1.5 rounded-xl font-semibold"
                  style={{
                    backgroundColor: "#2C5F2D",
                    color: "white",
                    fontSize: 13,
                    padding: "8px 16px",
                  }}
                >
                  <CheckCircle size={14} />
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
