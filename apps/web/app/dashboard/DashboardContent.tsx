"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  IndianRupee,
  Briefcase,
  Package,
  Star,
  CheckCircle,
  Gavel,
} from "lucide-react";
import { vendorApi, authApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { MetricCard } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency, formatDate, formatShortDate } from "../../lib/utils";

type Period = "7d" | "30d" | "90d";

function getGreetingByHour(hour: number): string {
  if (hour < 12) return "Good morning 🌾";
  if (hour < 17) return "Good afternoon ☀️";
  return "Good evening 🌙";
}

export function DashboardContent() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const greeting = getGreetingByHour(new Date().getHours());

  const { data: vendor } = useQuery({
    queryKey: ["vendor-me"],
    queryFn: () => authApi.getMe(),
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics", period],
    queryFn: () => vendorApi.getAnalytics(period),
  });

  const { data: paymentSummary } = useQuery({
    queryKey: ["vendor-payment-summary"],
    queryFn: () => vendorApi.getPaymentSummary(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: () => vendorApi.getOrders(),
  });

  const { data: publishedGigs = [] } = useQuery({
    queryKey: ["gigs", "PUBLISHED"],
    queryFn: () => vendorApi.getGigs("PUBLISHED"),
  });

  // Open clusters vendor can bid on (FORMING / VOTING matching their gigs)
  const { data: openClusters = [] } = useQuery({
    queryKey: ["vendor-clusters"],
    queryFn: () => vendorApi.getClusters(),
    refetchInterval: 30_000, // poll every 30s for new clusters
  });

  // Urgent orders = PAYMENT status (awaiting dispatch)
  const urgentOrders = (orders as Cluster[]).filter(
    (o) =>
      o.status === "PAYMENT" ||
      o.status === "OUT_FOR_DELIVERY" ||
      o.status === "DISPATCHED",
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
              fontSize: 22,
              fontWeight: 700,
              color: "#2C5F2D",
            }}
          >
            {greeting}, {vendor?.businessName ?? "Vendor"}
          </h2>
          <p style={{ fontSize: 14, color: "#A0A0A0", marginTop: 4 }}>
            Here&apos;s what&apos;s happening with your orders today.
          </p>
        </div>
        <button
          onClick={() => router.push("/gigs")}
          className="flex items-center gap-2 rounded-xl font-semibold"
          style={{
            backgroundColor: "#2C5F2D",
            color: "white",
            fontSize: 13,
            padding: "10px 18px",
            fontFamily: "Plus Jakarta Sans",
          }}
        >
          <Briefcase size={16} />
          Manage Gigs
        </button>
      </div>

      {/* Metrics row */}
      <div className="flex gap-4">
        <MetricCard
          label="Published Gigs"
          value={publishedGigs.length}
          sub="All visible to farmers"
          icon={<Briefcase size={16} color="#2C5F2D" />}
        />
        <MetricCard
          label="Orders This Month"
          value={orders.length}
          sub="+24% vs last month"
          icon={<Package size={16} color="#2C5F2D" />}
        />
        <MetricCard
          label="Total Revenue"
          value={formatCurrency(analytics?.totalRevenue ?? 0)}
          sub={`${formatCurrency(paymentSummary?.inEscrow ?? 0)} in escrow`}
          icon={<IndianRupee size={16} color="#2C5F2D" />}
        />
        <MetricCard
          label="Avg Rating"
          value={analytics?.avgRating ? `${analytics.avgRating} ★` : "—"}
          sub={`Based on ${analytics?.ratingsCount ?? 0} orders`}
          icon={<Star size={16} color="#2C5F2D" />}
        />
      </div>

      {/* Mid row: chart + recent orders */}
      <div className="flex gap-4" style={{ height: 280 }}>
        {/* Revenue chart */}
        <div
          className="flex-1 rounded-2xl bg-white"
          style={{ padding: "20px 20px 12px" }}
        >
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 16 }}
          >
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Revenue Over Time
            </p>
            <div
              className="flex gap-1 rounded-xl p-1"
              style={{ backgroundColor: "#EDE8DF" }}
            >
              {(["7d", "30d", "90d"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="rounded-lg font-medium transition-all"
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    backgroundColor: period === p ? "#2C5F2D" : "transparent",
                    color: period === p ? "white" : "#A0A0A0",
                  }}
                >
                  {p === "7d" ? "7D" : p === "30d" ? "30D" : "90D"}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={analytics?.revenueChart ?? []} barSize={24}>
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
              <Bar dataKey="amount" fill="#2C5F2D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent orders */}
        <div
          className="rounded-2xl bg-white flex flex-col"
          style={{ width: 340, padding: 20 }}
        >
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 16 }}
          >
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Recent Orders
            </p>
            <button
              onClick={() => router.push("/orders")}
              style={{ fontSize: 13, color: "#2C5F2D", fontWeight: 500 }}
            >
              View all →
            </button>
          </div>
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
                  {cluster.currentQuantity}/{cluster.targetQuantity}{" "}
                  {cluster.unit} · {cluster.members?.length ?? 0} farmers
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
          <div className="flex items-center justify-between">
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Recent Orders — Action Required
            </p>
            <button
              onClick={() => router.push("/orders")}
              style={{ fontSize: 13, color: "#2C5F2D", fontWeight: 500 }}
            >
              View all orders →
            </button>
          </div>
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
