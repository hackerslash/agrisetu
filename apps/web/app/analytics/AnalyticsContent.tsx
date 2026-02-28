"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { IndianRupee, Package, Target, Star } from "lucide-react";
import { vendorApi } from "@repo/api-client";
import { MetricCard } from "../../components/ui/Card";
import { formatCurrency, formatShortDate } from "../../lib/utils";

type Period = "7d" | "30d" | "90d";

export function AnalyticsContent() {
  const [period, setPeriod] = useState<Period>("30d");

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics", period],
    queryFn: () => vendorApi.getAnalytics(period),
  });
  const ratingDistribution =
    analytics?.ratingDistribution ?? ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as const);
  const totalRatings = analytics?.ratingsCount ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Period selector */}
      <div className="flex justify-end">
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
                padding: "6px 16px",
                fontSize: 13,
                backgroundColor: period === p ? "#2C5F2D" : "transparent",
                color: period === p ? "white" : "#A0A0A0",
              }}
            >
              {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="flex gap-4">
        <MetricCard
          label="Total Revenue"
          value={formatCurrency(analytics?.totalRevenue ?? 0)}
          sub={`Last ${period}`}
          icon={<IndianRupee size={20} color="#2C5F2D" />}
        />
        <MetricCard
          label="Orders Fulfilled"
          value={analytics?.ordersFulfilled ?? 0}
          sub="Completed clusters"
          icon={<Package size={20} color="#0369A1" />}
        />
        <MetricCard
          label="Bid Win Rate"
          value={`${analytics?.bidWinRate ?? 0}%`}
          sub="Bids won vs placed"
          icon={<Target size={20} color="#7E22CE" />}
        />
        <MetricCard
          label="Avg Rating"
          value={`${analytics?.avgRating ?? 0}/5`}
          sub={`${analytics?.ratingsCount ?? 0} ratings`}
          icon={<Star size={20} color="#D97706" />}
        />
      </div>

      {/* Charts row */}
      <div className="flex gap-4" style={{ height: 300 }}>
        {/* Revenue chart */}
        <div
          className="flex-1 bg-white rounded-2xl"
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
            Revenue Over Time
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={analytics?.revenueChart ?? []}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2C5F2D" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2C5F2D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
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
                fill="url(#revGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top products bar chart */}
        <div
          className="bg-white rounded-2xl"
          style={{ width: 360, padding: "20px 20px 12px" }}
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
            Revenue by Product
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics?.topProducts ?? []} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE8" />
              <XAxis
                dataKey="crop"
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
                contentStyle={{
                  borderRadius: 12,
                  border: "none",
                  fontSize: 13,
                }}
              />
              <Bar dataKey="revenue" fill="#2C5F2D" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom: top products table + ratings */}
      <div className="flex gap-4">
        {/* Top products table */}
        <div className="flex-1 bg-white rounded-2xl overflow-hidden">
          <div
            style={{ padding: "16px 20px", borderBottom: "1px solid #F0EDE8" }}
          >
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Top Products
            </p>
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "2fr 1fr 1fr",
              padding: "10px 20px",
              backgroundColor: "#F7F5F0",
              borderBottom: "1px solid #F0EDE8",
            }}
          >
            {["Product", "Revenue", "Orders"].map((h) => (
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
          {isLoading ? (
            <div
              className="flex items-center justify-center"
              style={{ height: 120 }}
            >
              <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading…</p>
            </div>
          ) : (analytics?.topProducts ?? []).length === 0 ? (
            <div
              className="flex items-center justify-center"
              style={{ height: 120 }}
            >
              <p style={{ fontSize: 14, color: "#A0A0A0" }}>No data yet.</p>
            </div>
          ) : (
            analytics?.topProducts.map((product, idx) => (
              <div
                key={product.crop}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "2fr 1fr 1fr",
                  padding: "12px 20px",
                  backgroundColor: idx % 2 === 1 ? "#FAFAF9" : "#FFFFFF",
                  borderBottom: "1px solid #F0EDE8",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full flex items-center justify-center"
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: "#F7F5F0",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#2C5F2D",
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}
                  >
                    {product.crop}
                  </span>
                </div>
                <span
                  style={{ fontSize: 14, fontWeight: 600, color: "#2C5F2D" }}
                >
                  {formatCurrency(product.revenue)}
                </span>
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {product.orders}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Ratings summary */}
        <div
          className="bg-white rounded-2xl"
          style={{ width: 280, padding: 20 }}
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
            Ratings
          </p>
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 72, height: 72, backgroundColor: "#F7F5F0" }}
            >
              <p
                style={{
                  fontFamily: "Plus Jakarta Sans",
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#D97706",
                }}
              >
                {analytics?.avgRating ?? 0}
              </p>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  style={{
                    fontSize: 18,
                    color:
                      star <= Math.round(analytics?.avgRating ?? 0)
                        ? "#D97706"
                        : "#EDE8DF",
                  }}
                >
                  ★
                </span>
              ))}
            </div>
            <p style={{ fontSize: 13, color: "#A0A0A0" }}>
              {analytics?.ratingsCount ?? 0} ratings total
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="flex items-center gap-2">
                <span style={{ fontSize: 12, color: "#A0A0A0", width: 8 }}>
                  {star}
                </span>
                <span style={{ fontSize: 14, color: "#D97706" }}>★</span>
                <div
                  className="flex-1 rounded-full overflow-hidden"
                  style={{ height: 6, backgroundColor: "#EDE8DF" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${
                        totalRatings > 0
                          ? (ratingDistribution[star as 1 | 2 | 3 | 4 | 5] /
                              totalRatings) *
                            100
                          : 0
                      }%`,
                      backgroundColor: "#D97706",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "#5A5A5A",
                    width: 20,
                    textAlign: "right",
                  }}
                >
                  {ratingDistribution[star as 1 | 2 | 3 | 4 | 5]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
