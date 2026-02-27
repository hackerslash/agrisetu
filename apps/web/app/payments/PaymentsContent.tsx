"use client";

import { useQuery } from "@tanstack/react-query";
import {
  IndianRupee,
  Lock,
  Clock,
  AlertTriangle,
  Building,
} from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { VendorPaymentRow } from "@repo/api-client";
import { MetricCard } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency } from "../../lib/utils";

export function PaymentsContent() {
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

  return (
    <div className="flex flex-col gap-6">
      {/* Metric cards */}
      <div className="flex gap-4">
        <MetricCard
          label="Total Received"
          value={formatCurrency(summary?.totalReceived ?? 0)}
          sub="Released from escrow"
          icon={<IndianRupee size={20} color="#065F46" />}
          color="#065F46"
        />
        <MetricCard
          label="In Escrow"
          value={formatCurrency(summary?.inEscrow ?? 0)}
          sub="Held pending delivery"
          icon={<Lock size={20} color="#D97706" />}
          color="#D97706"
        />
        <MetricCard
          label="Pending Release"
          value={formatCurrency(summary?.pendingRelease ?? 0)}
          sub="Dispatched, awaiting confirm"
          icon={<Clock size={20} color="#7E22CE" />}
          color="#7E22CE"
        />
      </div>

      {/* Escrow banner */}
      <div
        className="flex items-start gap-3 rounded-xl"
        style={{ backgroundColor: "#FFF3CD", padding: "14px 16px" }}
      >
        <AlertTriangle
          size={18}
          color="#D97706"
          style={{ flexShrink: 0, marginTop: 1 }}
        />
        <p style={{ fontSize: 13, color: "#D97706", lineHeight: 1.6 }}>
          <strong>Escrow Protection:</strong> All farmer payments are held
          securely in escrow until you confirm delivery. Funds are released
          automatically when farmers confirm receipt. In case of rejection, all
          payments are fully refunded to farmers.
        </p>
      </div>

      {/* Two columns */}
      <div className="flex gap-5">
        {/* Left: escrow table */}
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
              Escrow Holdings
            </p>
          </div>

          {/* Table header */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              padding: "10px 20px",
              backgroundColor: "#F7F5F0",
              borderBottom: "1px solid #F0EDE8",
            }}
          >
            {["Cluster / Crop", "Amount", "Status", "Farmers"].map((h) => (
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

          {paymentsLoading ? (
            <div
              className="flex items-center justify-center"
              style={{ height: 160 }}
            >
              <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading…</p>
            </div>
          ) : (payments as VendorPaymentRow[]).length === 0 ? (
            <div
              className="flex items-center justify-center"
              style={{ height: 160 }}
            >
              <p style={{ fontSize: 14, color: "#A0A0A0" }}>
                No payment records yet.
              </p>
            </div>
          ) : (
            (payments as VendorPaymentRow[]).map((row, idx) => (
              <div
                key={row.clusterId}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  padding: "12px 20px",
                  backgroundColor: idx % 2 === 1 ? "#FAFAF9" : "#FFFFFF",
                  borderBottom: "1px solid #F0EDE8",
                }}
              >
                <div>
                  <p
                    style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}
                  >
                    {row.cropName}
                  </p>
                  <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                    #{row.clusterId.slice(-6).toUpperCase()}
                  </p>
                </div>
                <span
                  style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}
                >
                  {formatCurrency(row.totalAmount)}
                </span>
                <StatusBadge status={row.status} />
                <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                  {row.memberCount} farmers
                </span>
              </div>
            ))
          )}
        </div>

        {/* Right: bank + payout history */}
        <div className="flex flex-col gap-4" style={{ width: 360 }}>
          {/* Bank account card */}
          <div className="bg-white rounded-2xl" style={{ padding: 20 }}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ width: 40, height: 40, backgroundColor: "#F7F5F0" }}
              >
                <Building size={20} color="#2C5F2D" />
              </div>
              <div>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: "Plus Jakarta Sans",
                    color: "#1A1A1A",
                  }}
                >
                  Bank Account
                </p>
                <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                  Payouts are processed here
                </p>
              </div>
            </div>
            <div
              className="flex flex-col gap-2 rounded-xl p-4"
              style={{ backgroundColor: "#F7F5F0" }}
            >
              <div className="flex justify-between">
                <span style={{ fontSize: 12, color: "#A0A0A0" }}>
                  Account Name
                </span>
                <span
                  style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
                >
                  Your Business Name
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: 12, color: "#A0A0A0" }}>
                  Account No.
                </span>
                <span
                  style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
                >
                  ****4521
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontSize: 12, color: "#A0A0A0" }}>IFSC</span>
                <span
                  style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
                >
                  HDFC0001234
                </span>
              </div>
            </div>
            <button
              className="mt-3 w-full rounded-xl font-semibold"
              style={{
                backgroundColor: "#F7F5F0",
                color: "#1A1A1A",
                height: 44,
                fontSize: 13,
              }}
            >
              Update Bank Details
            </button>
          </div>

          {/* Payout history */}
          <div className="bg-white rounded-2xl" style={{ padding: 20 }}>
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
                marginBottom: 12,
              }}
            >
              Released Payments
            </p>
            {releasedPayments.length === 0 ? (
              <p style={{ fontSize: 13, color: "#A0A0A0" }}>
                No released payments yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {releasedPayments.slice(0, 5).map((row) => (
                  <div
                    key={row.clusterId}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1A1A1A",
                        }}
                      >
                        {row.cropName}
                      </p>
                      <p style={{ fontSize: 12, color: "#A0A0A0" }}>
                        Cluster #{row.clusterId.slice(-6).toUpperCase()}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#065F46",
                        fontFamily: "Plus Jakarta Sans",
                      }}
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
