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
  Cell,
} from "recharts";
import {
  IndianRupee,
  Package,
  Target,
  Star,
  TrendingUp,
  BarChart3,
  Trophy,
} from "lucide-react";
import { vendorApi } from "@repo/api-client";
import { MetricCard } from "../../components/ui/Card";
import { formatCurrency, formatShortDate, formatDate } from "../../lib/utils";

type Period = "7d" | "30d" | "90d";

const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const CHART_TOOLTIP = {
  borderRadius: 12,
  border: "1px solid var(--color-line)",
  boxShadow: "var(--shadow-pop)",
  fontSize: 13,
  fontFamily: "var(--font-body)",
} as const;

function ChartEmpty({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2"
      style={{ height: 220 }}
    >
      <div
        className="flex items-center justify-center rounded-2xl bg-sunk text-ink-faint"
        style={{ width: 48, height: 48 }}
      >
        <BarChart3 size={22} />
      </div>
      <p
        className="text-ink-faint"
        style={{ fontSize: 12.5, maxWidth: 240, textAlign: "center" }}
      >
        {message}
      </p>
    </div>
  );
}

export function AnalyticsContent() {
  const [period, setPeriod] = useState<Period>("30d");

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics", period],
    queryFn: () => vendorApi.getAnalytics(period),
  });
  const ratingDistribution =
    analytics?.ratingDistribution ?? ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as const);
  const totalRatings = analytics?.ratingsCount ?? 0;

  const revenueChart = analytics?.revenueChart ?? [];
  const topProducts = analytics?.topProducts ?? [];

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 rise">
        <div className="flex items-start gap-3.5">
          <div
            className="flex items-center justify-center rounded-2xl bg-leaf-100 text-leaf-700 shrink-0"
            style={{ width: 48, height: 48 }}
          >
            <TrendingUp size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h2
              className="font-display text-ink"
              style={{ fontSize: 26, fontWeight: 800 }}
            >
              Analytics
            </h2>
            <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 3 }}>
              How your business is doing over {PERIOD_LABEL[period].toLowerCase()}.
            </p>
          </div>
        </div>

        {/* Period selector — pill toggle */}
        <div className="inset flex gap-1" style={{ padding: 4 }}>
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={
                period === p
                  ? "rounded-lg bg-leaf-600 text-white font-semibold"
                  : "rounded-lg text-ink-soft font-medium transition-colors hover:text-ink"
              }
              style={{ padding: "6px 14px", fontSize: 12.5 }}
            >
              {p === "7d" ? "7 days" : p === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards — varied accents */}
      <div className="flex gap-4 rise" style={{ animationDelay: "60ms" }}>
        <MetricCard
          label="Total Revenue"
          value={formatCurrency(analytics?.totalRevenue ?? 0)}
          sub={PERIOD_LABEL[period]}
          icon={<IndianRupee size={16} />}
          accent="leaf"
        />
        <MetricCard
          label="Orders Fulfilled"
          value={analytics?.ordersFulfilled ?? 0}
          sub="Completed clusters"
          icon={<Package size={16} />}
          accent="ink"
        />
        <MetricCard
          label="Bid Win Rate"
          value={`${analytics?.bidWinRate ?? 0}%`}
          sub="Bids won vs placed"
          icon={<Target size={16} />}
          accent="clay"
        />
        <MetricCard
          label="Avg Rating"
          value={`${analytics?.avgRating ?? 0}/5`}
          sub={`From ${analytics?.ratingsCount ?? 0} ratings`}
          icon={<Star size={16} />}
          accent="gold"
        />
      </div>

      {/* Charts row */}
      <div className="flex gap-5 rise" style={{ animationDelay: "120ms" }}>
        {/* Revenue chart */}
        <div className="card flex-1 flex flex-col" style={{ padding: "20px 22px 14px" }}>
          <div style={{ marginBottom: 8 }}>
            <p
              className="font-display text-ink"
              style={{ fontSize: 16, fontWeight: 700 }}
            >
              Revenue over time
            </p>
            <p className="text-ink-faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              Released payments across {PERIOD_LABEL[period].toLowerCase()}
            </p>
          </div>
          {revenueChart.length === 0 ? (
            <ChartEmpty message="Once orders complete and funds release, your revenue trend appears here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueChart}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.55 0.12 150)" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="oklch(0.55 0.12 150)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => formatShortDate(v)}
                  tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
                  formatter={(v: number | undefined) => [formatCurrency(v ?? 0), "Revenue"]}
                  labelFormatter={(l) => (typeof l === "string" ? formatDate(l) : String(l))}
                  contentStyle={CHART_TOOLTIP}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="oklch(0.47 0.115 150)"
                  strokeWidth={2.5}
                  fill="url(#revGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by product bar chart */}
        <div className="card flex flex-col" style={{ width: 360, padding: "20px 22px 14px" }}>
          <div style={{ marginBottom: 8 }}>
            <p
              className="font-display text-ink"
              style={{ fontSize: 16, fontWeight: 700 }}
            >
              Revenue by product
            </p>
            <p className="text-ink-faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              Your strongest sellers this period
            </p>
          </div>
          {topProducts.length === 0 ? (
            <ChartEmpty message="Sell across a few products and you'll see which earn the most here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="product"
                  tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "var(--color-ink-faint)" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-sunk)" }}
                  formatter={(v: number | undefined) => [formatCurrency(v ?? 0), "Revenue"]}
                  contentStyle={CHART_TOOLTIP}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {topProducts.map((_, i) => (
                    <Cell key={i} fill="oklch(0.55 0.12 150)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom: top products table + ratings */}
      <div className="flex gap-5 rise" style={{ animationDelay: "180ms" }}>
        {/* Top products table */}
        <div className="panel flex flex-1 flex-col overflow-hidden">
          <div
            className="flex items-center justify-between"
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid var(--color-line)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex items-center justify-center rounded-lg bg-leaf-50 text-leaf-600"
                style={{ width: 30, height: 30 }}
              >
                <Trophy size={15} />
              </span>
              <p
                className="font-display text-ink"
                style={{ fontSize: 17, fontWeight: 700 }}
              >
                Top products
              </p>
            </div>
            {topProducts.length > 0 && (
              <span className="pill bg-sunk text-ink-soft tnum">
                {topProducts.length}{" "}
                {topProducts.length === 1 ? "product" : "products"}
              </span>
            )}
          </div>

          {/* Table header */}
          <div
            className="grid bg-sunk"
            style={{
              gridTemplateColumns: "2fr 1fr 1fr",
              padding: "10px 22px",
              borderBottom: "1px solid var(--color-line)",
            }}
          >
            {["Product", "Revenue", "Orders"].map((h) => (
              <span key={h} className="eyebrow">
                {h}
              </span>
            ))}
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3" style={{ padding: "16px 22px" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 36 }} />
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-3"
              style={{ padding: "48px 20px" }}
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
                No sales yet
              </p>
              <p
                className="text-ink-faint"
                style={{ fontSize: 13, maxWidth: 360, textAlign: "center" }}
              >
                Win bids and fulfil clusters, and your best-earning products will
                rank here.
              </p>
            </div>
          ) : (
            topProducts.map((product, idx) => (
              <div
                key={product.product}
                className="grid items-center transition-colors hover:bg-sunk"
                style={{
                  gridTemplateColumns: "2fr 1fr 1fr",
                  padding: "14px 22px",
                  borderBottom: "1px solid var(--color-line)",
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="flex items-center justify-center rounded-full bg-leaf-50 text-leaf-700 tnum shrink-0"
                    style={{ width: 26, height: 26, fontSize: 12, fontWeight: 700 }}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className="text-ink truncate"
                    style={{ fontSize: 14, fontWeight: 600 }}
                  >
                    {product.product}
                  </span>
                </div>
                <span
                  className="text-leaf-700 tnum"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {formatCurrency(product.revenue)}
                </span>
                <span className="text-ink-soft tnum" style={{ fontSize: 13 }}>
                  {product.orders}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Ratings summary */}
        <div className="card flex flex-col" style={{ width: 300, padding: 22 }}>
          <div className="flex items-center gap-2.5" style={{ marginBottom: 18 }}>
            <span
              className="flex items-center justify-center rounded-lg bg-gold-100 text-gold-700"
              style={{ width: 30, height: 30 }}
            >
              <Star size={15} />
            </span>
            <p
              className="font-display text-ink"
              style={{ fontSize: 16, fontWeight: 700 }}
            >
              Ratings
            </p>
          </div>

          <div className="flex flex-col items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-full bg-gold-100"
              style={{ width: 76, height: 76 }}
            >
              <p
                className="font-display text-gold-700 tnum"
                style={{ fontSize: 30, fontWeight: 800 }}
              >
                {analytics?.avgRating ?? 0}
              </p>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={18}
                  className={
                    star <= Math.round(analytics?.avgRating ?? 0)
                      ? "text-gold-500"
                      : "text-line-strong"
                  }
                  fill={
                    star <= Math.round(analytics?.avgRating ?? 0)
                      ? "currentColor"
                      : "none"
                  }
                  strokeWidth={1.75}
                />
              ))}
            </div>
            <p className="text-ink-faint tnum" style={{ fontSize: 12.5 }}>
              {totalRatings} {totalRatings === 1 ? "rating" : "ratings"} total
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingDistribution[star as 1 | 2 | 3 | 4 | 5];
              const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2.5">
                  <span
                    className="text-ink-soft tnum"
                    style={{ fontSize: 12, width: 8 }}
                  >
                    {star}
                  </span>
                  <Star
                    size={13}
                    className="text-gold-500"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                  <div
                    className="flex-1 rounded-full overflow-hidden bg-sunk"
                    style={{ height: 7 }}
                  >
                    <div
                      className="h-full rounded-full bg-gold-400"
                      style={{ width: `${pct}%`, transition: "width 0.4s ease" }}
                    />
                  </div>
                  <span
                    className="text-ink-faint tnum"
                    style={{ fontSize: 12, width: 20, textAlign: "right" }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          {totalRatings === 0 && (
            <p
              className="text-ink-faint mt-4"
              style={{ fontSize: 12, textAlign: "center", lineHeight: 1.5 }}
            >
              No reviews yet. Farmers rate you after each completed order.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
