"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Sprout, Package } from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Gig, GigStatus } from "@repo/api-client";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
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
      role="switch"
      aria-checked={isActive}
      title={isActive ? "Visible to farmers — click to unpublish" : "Hidden — click to publish"}
      className="relative rounded-full transition-colors shrink-0"
      style={{
        width: 40,
        height: 22,
        backgroundColor: isActive
          ? "var(--color-leaf-600)"
          : "var(--color-line-strong)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        className="absolute top-1 rounded-full shadow transition-all"
        style={{
          width: 14,
          height: 14,
          left: isActive ? 23 : 3,
          backgroundColor: "var(--color-surface)",
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

  const list = gigs as Gig[];
  const publishedCount = list.filter((g) => g.status === "PUBLISHED").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 rise">
        <div className="flex items-start gap-3.5">
          <div
            className="flex items-center justify-center rounded-2xl bg-leaf-100 text-leaf-700 shrink-0"
            style={{ width: 48, height: 48 }}
          >
            <Sprout size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h2
              className="font-display text-ink"
              style={{ fontSize: 26, fontWeight: 800 }}
            >
              Your gigs
            </h2>
            <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 3 }}>
              {list.length === 0
                ? "Create offers that farmers can discover and order from."
                : `${publishedCount} live for farmers · ${list.length} total`}
            </p>
          </div>
        </div>
        <Button onClick={() => router.push("/gigs/new")} variant="primary">
          <Plus size={16} />
          Create gig
        </Button>
      </div>

      {/* Filter bar */}
      <div
        className="flex items-center justify-between gap-4 rise"
        style={{ animationDelay: "60ms" }}
      >
        <div className="inset flex gap-1" style={{ padding: 4 }}>
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={
                activeTab === tab.value
                  ? "rounded-lg bg-leaf-600 text-white font-semibold"
                  : "rounded-lg text-ink-soft font-medium transition-colors hover:text-ink"
              }
              style={{ padding: "6px 16px", fontSize: 13 }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 rise" style={{ animationDelay: "120ms" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5 flex flex-col gap-4">
              <div className="skeleton" style={{ height: 22, width: "60%" }} />
              <div className="skeleton" style={{ height: 14, width: "85%" }} />
              <div className="flex gap-6">
                <div className="skeleton" style={{ height: 34, width: 80 }} />
                <div className="skeleton" style={{ height: 34, width: 80 }} />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div
          className="panel flex flex-col items-center justify-center gap-3 rise"
          style={{ padding: "56px 24px", animationDelay: "120ms" }}
        >
          <div
            className="flex items-center justify-center rounded-2xl bg-leaf-50 text-leaf-600"
            style={{ width: 64, height: 64 }}
          >
            <Package size={30} />
          </div>
          <p
            className="font-display text-ink"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            {activeTab === "ALL"
              ? "No gigs yet"
              : `No ${activeTab.toLowerCase()} gigs`}
          </p>
          <p
            className="text-ink-faint"
            style={{ fontSize: 13.5, maxWidth: 380, textAlign: "center" }}
          >
            {activeTab === "ALL"
              ? "Create your first offer for farmers — set a product, your price, and how much you can supply. Published gigs show up in farmers' apps."
              : "Nothing here under this filter. Switch to All to see every gig, or create a new one."}
          </p>
          <div style={{ marginTop: 6 }}>
            <Button onClick={() => router.push("/gigs/new")} variant="primary">
              <Plus size={16} />
              Create your first gig
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 rise" style={{ animationDelay: "120ms" }}>
          {list.map((gig, idx) => (
            <article
              key={gig.id}
              className="card flex flex-col"
              style={{ padding: 20, animationDelay: `${120 + idx * 40}ms` }}
            >
              {/* Top: title + status */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3
                    className="font-display text-ink truncate"
                    style={{ fontSize: 17, fontWeight: 700 }}
                  >
                    {gig.product}
                    {gig.variety ? (
                      <span className="text-ink-faint" style={{ fontWeight: 500 }}>
                        {" "}
                        · {gig.variety}
                      </span>
                    ) : null}
                  </h3>
                  {gig.description ? (
                    <p
                      className="text-ink-soft"
                      style={{
                        fontSize: 13,
                        marginTop: 4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {gig.description}
                    </p>
                  ) : (
                    <p
                      className="text-ink-faint"
                      style={{ fontSize: 13, marginTop: 4, fontStyle: "italic" }}
                    >
                      No description
                    </p>
                  )}
                </div>
                <StatusBadge status={gig.status} />
              </div>

              {/* Stats */}
              <div
                className="inset flex items-center gap-6"
                style={{ padding: "12px 16px", marginTop: 16 }}
              >
                <div>
                  <p className="eyebrow">Price</p>
                  <p
                    className="tnum text-leaf-700 font-display"
                    style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}
                  >
                    {formatCurrency(gig.pricePerUnit)}
                    <span
                      className="text-ink-faint"
                      style={{ fontSize: 12, fontWeight: 500 }}
                    >
                      {" "}
                      /{gig.unit}
                    </span>
                  </p>
                </div>
                <div
                  style={{
                    width: 1,
                    height: 34,
                    backgroundColor: "var(--color-line)",
                  }}
                />
                <div>
                  <p className="eyebrow">Min order</p>
                  <p
                    className="tnum text-ink font-display"
                    style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}
                  >
                    {gig.minQuantity}
                    <span
                      className="text-ink-faint"
                      style={{ fontSize: 12, fontWeight: 500 }}
                    >
                      {" "}
                      {gig.unit}
                    </span>
                  </p>
                </div>
              </div>

              {/* Footer actions */}
              <div
                className="flex items-center justify-between gap-3"
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid var(--color-line)",
                }}
              >
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <ActiveToggle
                    isActive={gig.status === "PUBLISHED"}
                    onChange={() => handleToggleActive(gig)}
                    disabled={togglingId === gig.id}
                  />
                  <span
                    className="text-ink-soft"
                    style={{ fontSize: 13, fontWeight: 500 }}
                  >
                    {gig.status === "PUBLISHED" ? "Visible to farmers" : "Hidden"}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/gigs/${gig.id}/edit`)}
                    className="flex items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sunk hover:text-ink"
                    style={{ width: 34, height: 34 }}
                    title="Edit gig"
                    aria-label="Edit gig"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(gig.id)}
                    className="flex items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger-bg"
                    style={{ width: 34, height: 34 }}
                    title="Delete gig"
                    aria-label="Delete gig"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
