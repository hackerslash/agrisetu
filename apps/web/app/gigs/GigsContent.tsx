"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Gig, GigStatus } from "@repo/api-client";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency } from "../../lib/utils";

const TABS: { label: string; value: GigStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Closed", value: "CLOSED" },
];

export function GigsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<GigStatus | "ALL">("ALL");

  const { data: gigs = [], isLoading } = useQuery({
    queryKey: ["gigs", activeTab],
    queryFn: () =>
      vendorApi.getGigs(activeTab === "ALL" ? undefined : activeTab),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vendorApi.deleteGig(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gigs"] });
    },
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: "#EDE8DF" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className="rounded-lg font-medium transition-all"
              style={{
                padding: "6px 16px",
                fontSize: 13,
                backgroundColor:
                  activeTab === tab.value ? "#2C5F2D" : "transparent",
                color: activeTab === tab.value ? "white" : "#A0A0A0",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => router.push("/gigs/new")}
          className="flex items-center gap-2 rounded-xl font-semibold"
          style={{
            backgroundColor: "#2C5F2D",
            color: "white",
            fontSize: 14,
            padding: "10px 20px",
            fontFamily: "Plus Jakarta Sans",
          }}
        >
          <Plus size={16} />
          New Gig
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden">
        {/* Header */}
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr 120px",
            padding: "12px 20px",
            backgroundColor: "#F7F5F0",
            borderBottom: "1px solid #F0EDE8",
          }}
        >
          {[
            "Gig Name",
            "Crop",
            "Min Qty",
            "Price/Unit",
            "Status",
            "Active Bids",
            "Actions",
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

        {/* Rows */}
        {isLoading ? (
          <div
            className="flex items-center justify-center"
            style={{ height: 200 }}
          >
            <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading gigs…</p>
          </div>
        ) : (gigs as Gig[]).length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3"
            style={{ height: 200 }}
          >
            <p style={{ fontSize: 15, color: "#A0A0A0" }}>No gigs found.</p>
            <button
              onClick={() => router.push("/gigs/new")}
              className="rounded-xl font-semibold"
              style={{
                backgroundColor: "#2C5F2D",
                color: "white",
                fontSize: 13,
                padding: "8px 20px",
              }}
            >
              Create your first gig
            </button>
          </div>
        ) : (
          (gigs as Gig[]).map((gig, idx) => (
            <div
              key={gig.id}
              className="grid items-center"
              style={{
                gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr 120px",
                padding: "14px 20px",
                backgroundColor: idx % 2 === 1 ? "#FAFAF9" : "#FFFFFF",
                borderBottom: "1px solid #F0EDE8",
              }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
                  {gig.cropName} {gig.variety ? `(${gig.variety})` : ""}
                </p>
                {gig.description && (
                  <p style={{ fontSize: 12, color: "#A0A0A0", marginTop: 2 }}>
                    {gig.description.slice(0, 40)}…
                  </p>
                )}
              </div>
              <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                {gig.cropName}
              </span>
              <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                {gig.minQuantity} {gig.unit}
              </span>
              <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                {formatCurrency(gig.pricePerUnit)}/{gig.unit}
              </span>
              <StatusBadge status={gig.status} />
              <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                {gig._count?.bids ?? 0}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push(`/gigs/${gig.id}/edit`)}
                  className="flex items-center justify-center rounded-lg hover:bg-[#F7F5F0] transition-colors"
                  style={{ width: 32, height: 32 }}
                  title="Edit"
                >
                  <Pencil size={14} color="#A0A0A0" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(gig.id)}
                  className="flex items-center justify-center rounded-lg hover:bg-[#FEF2F2] transition-colors"
                  style={{ width: 32, height: 32 }}
                  title="Delete"
                >
                  <Trash2 size={14} color="#B03A2E" />
                </button>
              </div>
            </div>
          ))
        )}

        {/* Pagination footer */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "12px 20px", backgroundColor: "#F7F5F0" }}
        >
          <span style={{ fontSize: 13, color: "#A0A0A0" }}>
            {(gigs as Gig[]).length} gig
            {(gigs as Gig[]).length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
