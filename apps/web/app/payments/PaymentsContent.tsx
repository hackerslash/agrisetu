"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IndianRupee,
  Lock,
  Clock,
  ShieldCheck,
  Building,
  Wallet,
  ArrowDownToLine,
} from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { VendorPaymentRow } from "@repo/api-client";
import { MetricCard } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { formatCurrency } from "../../lib/utils";

const ESCROW_PAGE_SIZE = 8;

export function PaymentsContent() {
  const [escrowPage, setEscrowPage] = useState(1);

  const { data: summary } = useQuery({
    queryKey: ["payments-summary"],
    queryFn: () => vendorApi.getPaymentSummary(),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["vendor-payments"],
    queryFn: () => vendorApi.getPayments(),
  });

  const releasedPayments = (payments as VendorPaymentRow[]).filter(
    (p) => p.status === "released",
  );
  const escrowRows = payments as VendorPaymentRow[];
  const escrowTotalPages = Math.max(
    1,
    Math.ceil(escrowRows.length / ESCROW_PAGE_SIZE),
  );
  const escrowStart = (escrowPage - 1) * ESCROW_PAGE_SIZE;
  const paginatedEscrowRows = escrowRows.slice(
    escrowStart,
    escrowStart + ESCROW_PAGE_SIZE,
  );
  const escrowFrom = escrowRows.length === 0 ? 0 : escrowStart + 1;
  const escrowTo = Math.min(escrowStart + ESCROW_PAGE_SIZE, escrowRows.length);

  useEffect(() => {
    if (escrowPage > escrowTotalPages) {
      setEscrowPage(escrowTotalPages);
    }
  }, [escrowPage, escrowTotalPages]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 rise">
        <div className="flex items-start gap-3.5">
          <div
            className="flex items-center justify-center rounded-2xl bg-leaf-100 text-leaf-700 shrink-0"
            style={{ width: 48, height: 48 }}
          >
            <Wallet size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h2
              className="font-display text-ink"
              style={{ fontSize: 26, fontWeight: 800 }}
            >
              Payments
            </h2>
            <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 3 }}>
              Track money received, what&apos;s held safely in escrow, and what&apos;s
              on its way to your bank.
            </p>
          </div>
        </div>
      </div>

      {/* Money summary — varied accents, not all green */}
      <div className="flex gap-4 rise" style={{ animationDelay: "60ms" }}>
        <MetricCard
          label="Total Received"
          value={formatCurrency(summary?.totalReceived ?? 0)}
          sub="Released from escrow to you"
          icon={<IndianRupee size={16} />}
          accent="leaf"
        />
        <MetricCard
          label="In Escrow"
          value={formatCurrency(summary?.inEscrow ?? 0)}
          sub="Held safely until delivery"
          icon={<Lock size={16} />}
          accent="gold"
        />
        <MetricCard
          label="Pending Release"
          value={formatCurrency(summary?.pendingRelease ?? 0)}
          sub="Dispatched, awaiting confirm"
          icon={<Clock size={16} />}
          accent="clay"
        />
      </div>

      {/* Escrow explainer */}
      <div
        className="flex items-start gap-3 rise"
        style={{
          background: "var(--color-success-bg)",
          border: "1px solid var(--color-line)",
          borderRadius: 16,
          padding: "14px 18px",
          animationDelay: "100ms",
        }}
      >
        <span
          className="flex items-center justify-center rounded-xl bg-leaf-100 text-leaf-700 shrink-0"
          style={{ width: 34, height: 34 }}
        >
          <ShieldCheck size={18} />
        </span>
        <p className="text-ink-soft" style={{ fontSize: 13, lineHeight: 1.6 }}>
          <span className="font-display text-ink" style={{ fontWeight: 700 }}>
            Your money is protected.
          </span>{" "}
          Every farmer payment sits in escrow until you confirm delivery. Funds
          release to you automatically once farmers confirm they&apos;ve received
          their order. If an order is rejected, farmers are refunded in full.
        </p>
      </div>

      {/* Two columns */}
      <div className="flex gap-5 rise" style={{ animationDelay: "140ms" }}>
        {/* Left: escrow table */}
        <div className="panel flex flex-1 flex-col overflow-hidden">
          <div
            className="flex items-center justify-between"
            style={{
              padding: "18px 22px",
              borderBottom: "1px solid var(--color-line)",
            }}
          >
            <div>
              <p
                className="font-display text-ink"
                style={{ fontSize: 17, fontWeight: 700 }}
              >
                Escrow holdings
              </p>
              <p className="text-ink-faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                Every cluster payment and where it stands
              </p>
            </div>
            {escrowRows.length > 0 && (
              <span className="pill bg-sunk text-ink-soft tnum">
                {escrowRows.length} {escrowRows.length === 1 ? "record" : "records"}
              </span>
            )}
          </div>

          {/* Table header */}
          <div
            className="grid bg-sunk"
            style={{
              gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr",
              padding: "10px 22px",
              borderBottom: "1px solid var(--color-line)",
            }}
          >
            {["Cluster / Product", "Amount", "Status", "Farmers"].map((h) => (
              <span key={h} className="eyebrow">
                {h}
              </span>
            ))}
          </div>

          {paymentsLoading ? (
            <div className="flex flex-col gap-3" style={{ padding: "16px 22px" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 40 }} />
              ))}
            </div>
          ) : escrowRows.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-3"
              style={{ padding: "48px 20px" }}
            >
              <div
                className="flex items-center justify-center rounded-2xl bg-sunk text-ink-faint"
                style={{ width: 56, height: 56 }}
              >
                <Wallet size={26} />
              </div>
              <p
                className="font-display text-ink"
                style={{ fontSize: 16, fontWeight: 700 }}
              >
                No payments yet
              </p>
              <p
                className="text-ink-faint"
                style={{ fontSize: 13, maxWidth: 360, textAlign: "center" }}
              >
                When farmers pay for a cluster you&apos;ve won, the amount appears
                here and stays in escrow until delivery is confirmed.
              </p>
            </div>
          ) : (
            paginatedEscrowRows.map((row) => (
              <div
                key={row.clusterId}
                className="grid items-center transition-colors hover:bg-sunk"
                style={{
                  gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr",
                  padding: "14px 22px",
                  borderBottom: "1px solid var(--color-line)",
                }}
              >
                <div className="min-w-0">
                  <p
                    className="text-ink truncate"
                    style={{ fontSize: 13.5, fontWeight: 600 }}
                  >
                    {row.product}
                  </p>
                  <p className="text-ink-faint tnum" style={{ fontSize: 12 }}>
                    #{row.clusterId.slice(-6).toUpperCase()}
                  </p>
                </div>
                <span
                  className="text-ink tnum"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {formatCurrency(row.totalAmount)}
                </span>
                <div>
                  <StatusBadge status={row.status} />
                </div>
                <span className="text-ink-soft tnum" style={{ fontSize: 13 }}>
                  {row.memberCount} farmers
                </span>
              </div>
            ))
          )}

          {!paymentsLoading && escrowRows.length > 0 && (
            <div
              className="mt-auto flex items-center justify-between bg-sunk"
              style={{
                padding: "12px 22px",
                borderTop: "1px solid var(--color-line)",
              }}
            >
              <span className="text-ink-faint tnum" style={{ fontSize: 12.5 }}>
                Showing {escrowFrom}–{escrowTo} of {escrowRows.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEscrowPage((p) => Math.max(1, p - 1))}
                  disabled={escrowPage === 1}
                >
                  Previous
                </Button>
                <span
                  className="text-ink-soft tnum"
                  style={{ fontSize: 12.5, minWidth: 72, textAlign: "center" }}
                >
                  Page {escrowPage}/{escrowTotalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setEscrowPage((p) => Math.min(escrowTotalPages, p + 1))
                  }
                  disabled={escrowPage === escrowTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: bank + payout history */}
        <div className="flex flex-col gap-5" style={{ width: 360 }}>
          {/* Bank account card */}
          <div className="card" style={{ padding: 22 }}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex items-center justify-center rounded-xl bg-clay-50 text-clay-600"
                style={{ width: 40, height: 40 }}
              >
                <Building size={20} />
              </div>
              <div>
                <p
                  className="font-display text-ink"
                  style={{ fontSize: 16, fontWeight: 700 }}
                >
                  Bank account
                </p>
                <p className="text-ink-faint" style={{ fontSize: 12 }}>
                  Where your payouts land
                </p>
              </div>
            </div>
            <div className="inset flex flex-col gap-2.5" style={{ padding: 16 }}>
              <div className="flex justify-between">
                <span className="text-ink-faint" style={{ fontSize: 12.5 }}>
                  Account name
                </span>
                <span
                  className="text-ink"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  Your Business Name
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint" style={{ fontSize: 12.5 }}>
                  Account no.
                </span>
                <span
                  className="text-ink tnum"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  ••••4521
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint" style={{ fontSize: 12.5 }}>
                  IFSC
                </span>
                <span
                  className="text-ink tnum"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  HDFC0001234
                </span>
              </div>
            </div>
            <Button variant="ghost" block className="mt-3">
              Update bank details
            </Button>
          </div>

          {/* Payout history */}
          <div className="card" style={{ padding: 22 }}>
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="flex items-center justify-center rounded-lg bg-leaf-50 text-leaf-600"
                style={{ width: 30, height: 30 }}
              >
                <ArrowDownToLine size={15} />
              </span>
              <p
                className="font-display text-ink"
                style={{ fontSize: 16, fontWeight: 700 }}
              >
                Released payments
              </p>
            </div>
            {releasedPayments.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-2"
                style={{ padding: "24px 8px" }}
              >
                <p
                  className="text-ink-soft"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  Nothing released yet
                </p>
                <p
                  className="text-ink-faint"
                  style={{ fontSize: 12, textAlign: "center" }}
                >
                  Completed orders show up here once funds leave escrow.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1" style={{ margin: "0 -8px" }}>
                {releasedPayments.slice(0, 5).map((row) => (
                  <div
                    key={row.clusterId}
                    className="flex items-center justify-between rounded-xl"
                    style={{ padding: "8px" }}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-ink truncate"
                        style={{ fontSize: 13, fontWeight: 600 }}
                      >
                        {row.product}
                      </p>
                      <p className="text-ink-faint tnum" style={{ fontSize: 12 }}>
                        #{row.clusterId.slice(-6).toUpperCase()}
                      </p>
                    </div>
                    <span
                      className="text-leaf-700 tnum font-display"
                      style={{ fontSize: 14, fontWeight: 700 }}
                    >
                      {formatCurrency(row.totalAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
