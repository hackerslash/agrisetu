"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  authApi,
  clearAuthToken,
  type AdminVendorListItem,
  type VendorStatus,
} from "@repo/api-client";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  LogOut,
  ShieldAlert,
  UserCheck,
  XCircle,
  FileText,
  Inbox,
} from "lucide-react";
import { getPortalHomePath } from "../../lib/portal";
import { formatDate } from "../../lib/utils";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { MetricCard } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";

const TABS: Array<{ label: string; value: VendorStatus }> = [
  { label: "Pending", value: "PENDING_REVIEW" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
];

function VendorRow({
  vendor,
  selected,
  onSelect,
}: {
  vendor: AdminVendorListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left transition-colors"
      style={{
        padding: 16,
        borderRadius: 16,
        border: selected ? "1px solid var(--color-leaf-500)" : "1px solid var(--color-line)",
        backgroundColor: selected ? "var(--color-leaf-50)" : "var(--color-surface)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink truncate" style={{ fontSize: 15, fontWeight: 700 }}>
            {vendor.businessName}
          </p>
          <p className="text-ink-soft truncate" style={{ fontSize: 13, marginTop: 3 }}>
            {vendor.contactName} · {vendor.email}
          </p>
        </div>
        <StatusBadge status={vendor.status} />
      </div>
      <p className="text-ink-faint" style={{ fontSize: 12, marginTop: 10 }}>
        Submitted{" "}
        {vendor.submittedAt ? formatDate(vendor.submittedAt) : formatDate(vendor.createdAt)}
      </p>
      {vendor.reviewNote && (
        <p className="text-clay-700" style={{ fontSize: 12, marginTop: 8 }}>
          Note: {vendor.reviewNote}
        </p>
      )}
    </button>
  );
}

export function AdminDashboardContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<VendorStatus>("PENDING_REVIEW");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [actionError, setActionError] = useState("");

  const { data: account, error: accountError, isLoading: accountLoading } = useQuery({
    queryKey: ["vendor-me"],
    queryFn: () => authApi.getMe(),
    retry: false,
  });

  useEffect(() => {
    if (account?.role && account.role !== "SUPERADMIN") {
      router.replace(getPortalHomePath(account));
      return;
    }

    if (accountError) {
      const err = accountError as { response?: { status?: number } };
      if (err.response?.status === 401 || err.response?.status === 403) {
        clearAuthToken();
        router.replace("/login");
      }
    }
  }, [account, accountError, router]);

  const { data: vendorData, isLoading: vendorsLoading } = useQuery({
    queryKey: ["admin-vendors", activeTab],
    queryFn: () => adminApi.getVendors(activeTab),
    enabled: account?.role === "SUPERADMIN",
  });

  useEffect(() => {
    const firstId = vendorData?.vendors[0]?.id ?? null;
    setSelectedVendorId((current) => {
      if (current && vendorData?.vendors.some((vendor) => vendor.id === current)) {
        return current;
      }
      return firstId;
    });
    setReviewNote("");
    setActionError("");
  }, [vendorData]);

  const { data: selectedVendor, isLoading: vendorDetailLoading } = useQuery({
    queryKey: ["admin-vendor-detail", selectedVendorId],
    queryFn: () => adminApi.getVendorDetail(selectedVendorId!),
    enabled: Boolean(selectedVendorId) && account?.role === "SUPERADMIN",
  });

  const refreshAdminData = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-vendors"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-vendor-detail"] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApi.approveVendor(id),
    onSuccess: async () => {
      setReviewNote("");
      setActionError("");
      await refreshAdminData();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      adminApi.rejectVendor(id, note),
    onSuccess: async () => {
      setReviewNote("");
      setActionError("");
      await refreshAdminData();
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      adminApi.suspendVendor(id, note),
    onSuccess: async () => {
      setReviewNote("");
      setActionError("");
      await refreshAdminData();
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => adminApi.reactivateVendor(id),
    onSuccess: async () => {
      setReviewNote("");
      setActionError("");
      await refreshAdminData();
    },
  });

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      clearAuthToken();
      queryClient.clear();
      router.replace("/login");
    }
  }

  async function runAction(action: "approve" | "reject" | "suspend" | "reactivate") {
    if (!selectedVendorId) return;

    setActionError("");

    try {
      if (action === "approve") {
        await approveMutation.mutateAsync(selectedVendorId);
        return;
      }

      if (action === "reactivate") {
        await reactivateMutation.mutateAsync(selectedVendorId);
        return;
      }

      const trimmedNote = reviewNote.trim();
      if (!trimmedNote) {
        setActionError("A review note is required for this action.");
        return;
      }

      if (action === "reject") {
        await rejectMutation.mutateAsync({ id: selectedVendorId, note: trimmedNote });
        return;
      }

      await suspendMutation.mutateAsync({ id: selectedVendorId, note: trimmedNote });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setActionError(error.response?.data?.error ?? "Action failed.");
    }
  }

  if (accountLoading || (account?.role !== "SUPERADMIN" && !accountError)) {
    return (
      <div className="flex items-center justify-center bg-paper" style={{ minHeight: "100vh" }}>
        <div className="flex flex-col items-center gap-4">
          <span
            aria-hidden
            className="rounded-full"
            style={{
              width: 34,
              height: 34,
              border: "3px solid var(--color-leaf-100)",
              borderTopColor: "var(--color-leaf-600)",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p className="text-ink-soft" style={{ fontSize: 14, fontWeight: 600 }}>
            Loading admin dashboard…
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const summary = vendorData?.summary;
  const vendors = vendorData?.vendors ?? [];
  const actionLoading =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    suspendMutation.isPending ||
    reactivateMutation.isPending;

  return (
    <div className="bg-paper" style={{ minHeight: "100vh" }}>
      <header
        className="flex items-center justify-between bg-surface"
        style={{
          padding: "18px 32px",
          borderBottom: "1px solid var(--color-line)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-4">
          <BrandLogo subtitle="Admin Console" />
          <span className="pill bg-clay-50 text-clay-700">Superadmin</span>
        </div>

        <Button variant="ghost" onClick={handleLogout}>
          <LogOut size={16} />
          Logout
        </Button>
      </header>

      <main style={{ padding: "28px 32px" }}>
        <div className="rise" style={{ marginBottom: 22 }}>
          <p className="eyebrow">Vendor verification</p>
          <h1 className="font-display text-ink" style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
            Verification desk
          </h1>
          <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 3 }}>
            Review applications and manage vendor accounts across the network.
          </p>
        </div>

        <div className="flex gap-4 rise" style={{ animationDelay: "60ms" }}>
          <MetricCard
            label="Pending review"
            value={summary?.pending ?? 0}
            icon={<Clock3 size={16} />}
            accent="gold"
          />
          <MetricCard
            label="Active vendors"
            value={summary?.active ?? 0}
            icon={<UserCheck size={16} />}
            accent="leaf"
          />
          <MetricCard
            label="Rejected"
            value={summary?.rejected ?? 0}
            icon={<XCircle size={16} />}
            accent="ink"
          />
          <MetricCard
            label="Suspended"
            value={summary?.suspended ?? 0}
            icon={<ShieldAlert size={16} />}
            accent="clay"
          />
        </div>

        <div
          className="grid gap-6 rise"
          style={{ gridTemplateColumns: "420px minmax(0,1fr)", marginTop: 24, animationDelay: "120ms" }}
        >
          {/* List */}
          <section className="panel flex flex-col" style={{ padding: 18 }}>
            <div className="inset flex gap-1" style={{ padding: 4, marginBottom: 16 }}>
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={
                    activeTab === tab.value
                      ? "flex-1 rounded-lg bg-leaf-600 text-white font-semibold"
                      : "flex-1 rounded-lg text-ink-soft font-medium transition-colors hover:text-ink"
                  }
                  style={{ padding: "7px 8px", fontSize: 12.5 }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {vendorsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 92 }} />
                ))
              ) : vendors.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center gap-3"
                  style={{ padding: "44px 16px" }}
                >
                  <div
                    className="flex items-center justify-center rounded-2xl bg-sunk text-ink-faint"
                    style={{ width: 52, height: 52 }}
                  >
                    <Inbox size={24} />
                  </div>
                  <p className="text-ink-soft" style={{ fontSize: 13.5, fontWeight: 600 }}>
                    No vendors in this list
                  </p>
                  <p className="text-ink-faint" style={{ fontSize: 12.5, textAlign: "center" }}>
                    Nothing to review under “{TABS.find((t) => t.value === activeTab)?.label}” right now.
                  </p>
                </div>
              ) : (
                vendors.map((vendor) => (
                  <VendorRow
                    key={vendor.id}
                    vendor={vendor}
                    selected={vendor.id === selectedVendorId}
                    onSelect={() => setSelectedVendorId(vendor.id)}
                  />
                ))
              )}
            </div>
          </section>

          {/* Detail */}
          <section className="panel" style={{ padding: 28 }}>
            {!selectedVendorId ? (
              <p className="text-ink-soft" style={{ fontSize: 14 }}>
                Select a vendor to review.
              </p>
            ) : vendorDetailLoading || !selectedVendor ? (
              <div className="flex flex-col gap-4">
                <div className="skeleton" style={{ height: 32, width: "55%" }} />
                <div className="skeleton" style={{ height: 18, width: "40%" }} />
                <div className="grid grid-cols-2 gap-4" style={{ marginTop: 12 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 64 }} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-7">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="font-display text-ink" style={{ fontSize: 24, fontWeight: 800 }}>
                        {selectedVendor.businessName}
                      </h2>
                      <p className="text-ink-soft" style={{ fontSize: 14, marginTop: 4 }}>
                        {selectedVendor.contactName} · {selectedVendor.email}
                      </p>
                    </div>
                    <StatusBadge status={selectedVendor.status} />
                  </div>
                  <p className="text-ink-faint" style={{ fontSize: 13, marginTop: 10 }}>
                    Submitted{" "}
                    {selectedVendor.submittedAt
                      ? formatDate(selectedVendor.submittedAt)
                      : formatDate(selectedVendor.createdAt)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["Phone", selectedVendor.phone],
                      ["State", selectedVendor.state ?? "Not provided"],
                      ["Business type", selectedVendor.businessType ?? "Not provided"],
                      ["GSTIN", selectedVendor.gstin ?? "Not provided"],
                      ["PAN", selectedVendor.pan ?? "Not provided"],
                      [
                        "Service radius",
                        selectedVendor.serviceRadiusKm
                          ? `${selectedVendor.serviceRadiusKm} km`
                          : "Not provided",
                      ],
                    ] as Array<[string, string]>
                  ).map(([label, value]) => (
                    <div key={label} className="inset" style={{ padding: 14 }}>
                      <p className="eyebrow">{label}</p>
                      <p className="text-ink" style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="font-display text-ink" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                    Uploaded documents
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {(selectedVendor.documents ?? []).length === 0 ? (
                      <p className="text-ink-faint" style={{ fontSize: 13 }}>
                        No documents uploaded.
                      </p>
                    ) : (
                      selectedVendor.documents?.map((document) => (
                        <a
                          key={document.id}
                          href={document.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 bg-surface transition-colors hover:bg-sunk"
                          style={{
                            padding: 14,
                            borderRadius: 12,
                            border: "1px solid var(--color-line)",
                          }}
                        >
                          <span
                            className="flex items-center justify-center rounded-lg bg-leaf-50 text-leaf-700 shrink-0"
                            style={{ width: 34, height: 34 }}
                          >
                            <FileText size={16} />
                          </span>
                          <span className="text-ink" style={{ fontSize: 14, fontWeight: 600 }}>
                            {document.docType.replaceAll("_", " ")}
                          </span>
                        </a>
                      ))
                    )}
                  </div>
                </div>

                {(selectedVendor.status === "PENDING_REVIEW" ||
                  selectedVendor.status === "ACTIVE" ||
                  selectedVendor.status === "SUSPENDED") && (
                  <div className="flex flex-col gap-2">
                    <label className="field-label" style={{ marginBottom: 2 }}>
                      Review note
                    </label>
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      placeholder="Required when rejecting or suspending a vendor."
                      rows={4}
                      className="field"
                    />
                    {actionError && (
                      <p className="text-danger" style={{ fontSize: 13 }}>
                        {actionError}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {selectedVendor.status === "PENDING_REVIEW" && (
                    <>
                      <Button onClick={() => void runAction("approve")} disabled={actionLoading}>
                        <CheckCircle2 size={16} />
                        Approve vendor
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => void runAction("reject")}
                        disabled={actionLoading}
                      >
                        Reject application
                      </Button>
                    </>
                  )}

                  {selectedVendor.status === "ACTIVE" && (
                    <Button
                      variant="secondary"
                      onClick={() => void runAction("suspend")}
                      disabled={actionLoading}
                    >
                      <ShieldAlert size={16} />
                      Suspend vendor
                    </Button>
                  )}

                  {selectedVendor.status === "SUSPENDED" && (
                    <Button onClick={() => void runAction("reactivate")} disabled={actionLoading}>
                      <UserCheck size={16} />
                      Reactivate vendor
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
