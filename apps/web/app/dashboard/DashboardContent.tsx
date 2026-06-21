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
  Cell,
} from "recharts";
import {
  IndianRupee,
  Briefcase,
  Package,
  Star,
  Gavel,
  ArrowRight,
  Sun,
  Sprout,
  CheckCheck,
} from "lucide-react";
import { vendorApi, authApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { MetricCard } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { formatCurrency, formatDate, formatShortDate } from "../../lib/utils";

type Period = "7d" | "30d" | "90d";

function getGreeting(hour: number) {
  if (hour < 12) return { text: "Good morning", Icon: Sprout };
  if (hour < 17) return { text: "Good afternoon", Icon: Sun };
  return { text: "Good evening", Icon: Star };
}

export function DashboardContent() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const { text: greetText, Icon: GreetIcon } = getGreeting(new Date().getHours());

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

  const { data: openClusters = [] } = useQuery({
    queryKey: ["vendor-clusters"],
    queryFn: () => vendorApi.getClusters(),
    refetchInterval: 30_000,
  });

  const urgentOrders = (orders as Cluster[]).filter(
    (o) =>
      o.status === "PAYMENT" ||
      o.status === "OUT_FOR_DELIVERY" ||
      o.status === "DISPATCHED",
  );

  const unbidClusters = (openClusters as Cluster[]).filter(
    (c) => !c.bids || c.bids.length === 0,
  );

  const recentOrders = (orders as Cluster[]).slice(0, 5);

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const ordersThisMonth = (orders as Cluster[]).filter((order) => {
    const createdAt = new Date(order.createdAt);
    return createdAt >= currentMonthStart && createdAt < nextMonthStart;
  }).length;

  const ordersLastMonth = (orders as Cluster[]).filter((order) => {
    const createdAt = new Date(order.createdAt);
    return createdAt >= previousMonthStart && createdAt < currentMonthStart;
  }).length;

  const ordersTrendPercent =
    ordersLastMonth === 0
      ? ordersThisMonth === 0
        ? 0
        : 100
      : Math.round(((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100);
  const ordersTrendSub = `${ordersTrendPercent > 0 ? "+" : ""}${ordersTrendPercent}% vs last month`;
  const ordersTrendTone =
    ordersTrendPercent > 0 ? "up" : ordersTrendPercent < 0 ? "down" : "muted";

  const attentionCount = unbidClusters.length + urgentOrders.length;

  return (
    <div className="flex flex-col gap-7">
      {/* Greeting */}
      <div className="flex items-end justify-between gap-4 rise">
        <div className="flex items-start gap-3.5">
          <div
            className="flex items-center justify-center rounded-2xl bg-leaf-100 text-leaf-700 shrink-0"
            style={{ width: 48, height: 48 }}
          >
            <GreetIcon size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h2 className="font-display text-ink" style={{ fontSize: 26, fontWeight: 800 }}>
              {greetText}, {vendor?.businessName ?? "Vendor"}
            </h2>
            <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 3 }}>
              {attentionCount > 0
                ? `You have ${attentionCount} ${attentionCount === 1 ? "thing" : "things"} that need your attention today.`
                : "Everything's running smoothly. Here's your business at a glance."}
            </p>
          </div>
        </div>
        <Button onClick={() => router.push("/gigs")} variant="primary">
          <Briefcase size={16} />
          Manage Gigs
        </Button>
      </div>

      {/* Stat strip */}
      <div className="flex gap-4 rise" style={{ animationDelay: "60ms" }}>
        <MetricCard
          label="Total Revenue"
          value={formatCurrency(analytics?.totalRevenue ?? 0)}
          sub={`${formatCurrency(paymentSummary?.inEscrow ?? 0)} held in escrow`}
          icon={<IndianRupee size={16} />}
          accent="leaf"
        />
        <MetricCard
          label="Orders This Month"
          value={ordersThisMonth}
          sub={ordersTrendSub}
          subTone={ordersTrendTone}
          icon={<Package size={16} />}
          accent="ink"
        />
        <MetricCard
          label="Published Gigs"
          value={publishedGigs.length}
          sub="Visible to farmers now"
          icon={<Briefcase size={16} />}
          accent="clay"
        />
        <MetricCard
          label="Avg Rating"
          value={analytics?.avgRating ? `${analytics.avgRating}★` : "—"}
          sub={`From ${analytics?.ratingsCount ?? 0} orders`}
          icon={<Star size={16} />}
          accent="gold"
        />
      </div>

      {/* Needs attention */}
      <section
        className="panel overflow-hidden rise"
        style={{ animationDelay: "120ms" }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "18px 22px", borderBottom: "1px solid var(--color-line)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex items-center justify-center rounded-lg bg-gold-100 text-gold-700"
              style={{ width: 30, height: 30 }}
            >
              <Gavel size={15} />
            </span>
            <h3 className="font-display text-ink" style={{ fontSize: 17, fontWeight: 700 }}>
              Needs your attention
            </h3>
            {attentionCount > 0 && (
              <span className="pill bg-gold-100 text-gold-700 tnum">{attentionCount}</span>
            )}
          </div>
          <button
            onClick={() => router.push("/orders")}
            className="flex items-center gap-1 text-leaf-700"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            View all orders <ArrowRight size={14} />
          </button>
        </div>

        {attentionCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3" style={{ padding: "44px 20px" }}>
            <div
              className="flex items-center justify-center rounded-2xl bg-leaf-50 text-leaf-600"
              style={{ width: 56, height: 56 }}
            >
              <CheckCheck size={26} />
            </div>
            <p className="font-display text-ink" style={{ fontSize: 16, fontWeight: 700 }}>
              You&apos;re all caught up
            </p>
            <p className="text-ink-faint" style={{ fontSize: 13, maxWidth: 360, textAlign: "center" }}>
              No bids or orders need action right now. New farmer clusters appear here the moment
              they&apos;re ready for your quote.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {unbidClusters.slice(0, 4).map((cluster) => (
              <ActionRow
                key={cluster.id}
                kind="bid"
                title={`${cluster.product} — ${cluster.unit}`}
                meta={`${cluster.currentQuantity}/${cluster.targetQuantity} ${cluster.unit} · ${cluster.members?.length ?? 0} farmers${cluster.district ? ` · ${cluster.district}` : ""}`}
                status={cluster.status}
                onAction={() => router.push("/orders")}
              />
            ))}
            {urgentOrders.slice(0, 4).map((order) => (
              <ActionRow
                key={order.id}
                kind="order"
                title={`Cluster #${order.id.slice(-6).toUpperCase()} — ${order.product}`}
                meta={`${order.currentQuantity} ${order.unit} · ${order.members?.length ?? 0} farmers`}
                status={order.status}
                onAction={() => router.push(`/orders/${order.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Chart + recent orders */}
      <div className="flex gap-5 rise" style={{ height: 320, animationDelay: "180ms" }}>
        <div className="card flex-1 flex flex-col" style={{ padding: "20px 22px 14px" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <div>
              <p className="font-display text-ink" style={{ fontSize: 16, fontWeight: 700 }}>
                Revenue over time
              </p>
              <p className="text-ink-faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                Released payments from completed orders
              </p>
            </div>
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
                  style={{ padding: "5px 12px", fontSize: 12 }}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics?.revenueChart ?? []} barSize={22}>
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
                width={46}
              />
              <Tooltip
                cursor={{ fill: "var(--color-sunk)" }}
                formatter={(v: number | undefined) => [formatCurrency(v ?? 0), "Revenue"]}
                labelFormatter={(l) => (typeof l === "string" ? formatDate(l) : String(l))}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--color-line)",
                  boxShadow: "var(--shadow-pop)",
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                }}
              />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {(analytics?.revenueChart ?? []).map((_, i) => (
                  <Cell key={i} fill="oklch(0.55 0.12 150)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card flex flex-col" style={{ width: 360, padding: 22 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
            <p className="font-display text-ink" style={{ fontSize: 16, fontWeight: 700 }}>
              Recent orders
            </p>
            <button
              onClick={() => router.push("/orders")}
              className="text-leaf-700"
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              View all
            </button>
          </div>
          <div className="flex flex-col gap-1 flex-1 overflow-auto" style={{ margin: "0 -8px" }}>
            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 flex-1" style={{ padding: 20 }}>
                <div
                  className="flex items-center justify-center rounded-2xl bg-sunk text-ink-faint"
                  style={{ width: 44, height: 44 }}
                >
                  <Package size={20} />
                </div>
                <p className="text-ink-soft" style={{ fontSize: 13, fontWeight: 600 }}>
                  No orders yet
                </p>
                <p className="text-ink-faint" style={{ fontSize: 12, textAlign: "center" }}>
                  Win a bid and your orders will appear here.
                </p>
              </div>
            ) : (
              recentOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="flex items-center justify-between w-full text-left rounded-xl transition-colors hover:bg-sunk"
                  style={{ padding: "10px 8px" }}
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {order.product}
                    </p>
                    <p className="text-ink-faint tnum" style={{ fontSize: 12 }}>
                      {order.currentQuantity} {order.unit} · {formatShortDate(order.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  kind,
  title,
  meta,
  status,
  onAction,
}: {
  kind: "bid" | "order";
  title: string;
  meta: string;
  status: string;
  onAction: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 transition-colors hover:bg-sunk"
      style={{ padding: "16px 22px", borderBottom: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <span
          className={
            kind === "bid"
              ? "flex items-center justify-center rounded-xl bg-gold-100 text-gold-700 shrink-0"
              : "flex items-center justify-center rounded-xl bg-leaf-100 text-leaf-700 shrink-0"
          }
          style={{ width: 38, height: 38 }}
        >
          {kind === "bid" ? <Gavel size={17} /> : <Package size={17} />}
        </span>
        <div className="min-w-0">
          <p className="text-ink truncate" style={{ fontSize: 14, fontWeight: 600 }}>
            {title}
          </p>
          <p className="text-ink-faint tnum truncate" style={{ fontSize: 12.5, marginTop: 1 }}>
            {meta}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge status={status} />
        <Button onClick={onAction} variant={kind === "bid" ? "secondary" : "primary"} size="sm">
          {kind === "bid" ? (
            <>
              <Gavel size={14} /> Place bid
            </>
          ) : (
            "Open"
          )}
        </Button>
      </div>
    </div>
  );
}
