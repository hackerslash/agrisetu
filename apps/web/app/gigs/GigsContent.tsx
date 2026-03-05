"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Gig, GigStatus } from "@repo/api-client";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatCurrency } from "../../lib/utils";

function ActiveToggle({
  isActive,
  onChange,
  disabled,
}: {
  isActive: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      title={isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
      className="relative rounded-full transition-colors shrink-0"
      style={{
        width: 40,
        height: 22,
        backgroundColor: isActive ? "#2C5F2D" : "#D1D5DB",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        className="absolute top-1 rounded-full bg-white shadow transition-all"
        style={{
          width: 14,
          height: 14,
          left: isActive ? 23 : 3,
        }}
      />
    </button>
  );
}

const TABS: { label: string; value: GigStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
];

export function GigsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<GigStatus | "ALL">("ALL");
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Gig> }) =>
      vendorApi.updateGig(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gigs"] });
      setTogglingId(null);
    },
    onError: () => {
      setTogglingId(null);
    },
  });

  async function handleToggleActive(gig: Gig) {
    if (togglingId) return;
    const newStatus: GigStatus =
      gig.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    setTogglingId(gig.id);
    updateMutation.mutate({ id: gig.id, data: { status: newStatus } });
  }

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
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1.4fr 1fr 100px",
            padding: "12px 20px",
            backgroundColor: "#F7F5F0",
            borderBottom: "1px solid #F0EDE8",
          }}
        >
          {[
            "Gig Name",
            "Product",
            "Min Qty",
            "Price/Unit",
            "Status",
            "Active",
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
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1.4fr 1fr 100px",
                padding: "14px 20px",
                backgroundColor: idx % 2 === 1 ? "#FAFAF9" : "#FFFFFF",
                borderBottom: "1px solid #F0EDE8",
              }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
                  {gig.product} {gig.variety ? `(${gig.variety})` : ""}
                </p>
                {gig.description && (
                  <p style={{ fontSize: 12, color: "#A0A0A0", marginTop: 2 }}>
                    {gig.description.slice(0, 40)}…
                  </p>
                )}
              </div>
              <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                {gig.product}
              </span>
              <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                {gig.minQuantity} {gig.unit}
              </span>
              <span style={{ fontSize: 13, color: "#1A1A1A" }}>
                {formatCurrency(gig.pricePerUnit)}/{gig.unit}
              </span>
              <div>
                <StatusBadge status={gig.status} />
              </div>
              <ActiveToggle
                isActive={gig.status === "PUBLISHED"}
                onChange={() => handleToggleActive(gig)}
                disabled={togglingId === gig.id}
              />
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
