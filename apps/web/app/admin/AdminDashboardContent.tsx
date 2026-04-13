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
} from "lucide-react";
import { getPortalHomePath } from "../../lib/portal";
import { formatDate } from "../../lib/utils";

const TABS: Array<{ label: string; value: VendorStatus }> = [
  { label: "Pending", value: "PENDING_REVIEW" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
];

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div
      className="rounded-2xl bg-white"
      style={{ padding: 20, border: "1px solid #E9E4DA" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p style={{ fontSize: 13, color: "#6B7280" }}>{label}</p>
          <p
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#1A1A1A",
              marginTop: 6,
            }}
          >
            {value}
          </p>
        </div>
        <div
          className="flex items-center justify-center rounded-2xl"
          style={{ width: 44, height: 44, backgroundColor: tone }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

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
      className="w-full text-left rounded-2xl transition-colors"
      style={{
        padding: 16,
        border: selected ? "1px solid #2C5F2D" : "1px solid #E9E4DA",
        backgroundColor: selected ? "#F0FDF4" : "#FFFFFF",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>
            {vendor.businessName}
          </p>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            {vendor.contactName} · {vendor.email}
          </p>
        </div>
        <span
          className="rounded-full"
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: "#2C5F2D",
            backgroundColor: "#E8F5E9",
          }}
        >
          {vendor.status.replaceAll("_", " ")}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 10 }}>
        Submitted{" "}
        {vendor.submittedAt ? formatDate(vendor.submittedAt) : formatDate(vendor.createdAt)}
      </p>
      {vendor.reviewNote && (
        <p style={{ fontSize: 12, color: "#B45309", marginTop: 8 }}>
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
      <div
        className="flex items-center justify-center"
        style={{ minHeight: "100vh", backgroundColor: "#F7F5F0" }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: "#2C5F2D" }}>
          Loading admin dashboard...
        </p>
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
    <div style={{ minHeight: "100vh", backgroundColor: "#F7F5F0" }}>
      <header
        className="flex items-center justify-between"
        style={{
          padding: "24px 32px",
          borderBottom: "1px solid #E9E4DA",
          backgroundColor: "#FFFFFF",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#6B7280",
              letterSpacing: "0.08em",
            }}
          >
            SUPERADMIN PORTAL
          </p>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#1A1A1A",
              marginTop: 6,
            }}
          >
            Vendor verification desk
          </h1>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-xl"
          style={{
            padding: "10px 14px",
            border: "1px solid #E9E4DA",
            backgroundColor: "#FFFFFF",
            color: "#1A1A1A",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <LogOut size={16} />
          Logout
        </button>
      </header>

      <main style={{ padding: 32 }}>
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            label="Pending review"
            value={summary?.pending ?? 0}
            icon={<Clock3 size={20} color="#8A5A00" />}
            tone="#FEF3C7"
          />
          <SummaryCard
            label="Active vendors"
            value={summary?.active ?? 0}
            icon={<UserCheck size={20} color="#166534" />}
            tone="#DCFCE7"
          />
          <SummaryCard
            label="Rejected"
            value={summary?.rejected ?? 0}
            icon={<XCircle size={20} color="#991B1B" />}
            tone="#FEE2E2"
          />
          <SummaryCard
            label="Suspended"
            value={summary?.suspended ?? 0}
            icon={<ShieldAlert size={20} color="#9A3412" />}
            tone="#FED7AA"
          />
        </div>

        <div className="grid grid-cols-[420px_minmax(0,1fr)] gap-6" style={{ marginTop: 24 }}>
          <section
            className="rounded-3xl bg-white"
            style={{ padding: 20, border: "1px solid #E9E4DA" }}
          >
            <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className="rounded-full"
                  style={{
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor:
                      activeTab === tab.value ? "#2C5F2D" : "#F3F4F6",
                    color: activeTab === tab.value ? "#FFFFFF" : "#4B5563",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {vendorsLoading ? (
                <p style={{ fontSize: 13, color: "#6B7280" }}>Loading vendors...</p>
              ) : vendors.length === 0 ? (
                <p style={{ fontSize: 13, color: "#6B7280" }}>
                  No vendors found for this status.
                </p>
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

          <section
            className="rounded-3xl bg-white"
            style={{ padding: 24, border: "1px solid #E9E4DA" }}
          >
            {!selectedVendorId ? (
              <p style={{ fontSize: 14, color: "#6B7280" }}>
                Select a vendor to review.
              </p>
            ) : vendorDetailLoading || !selectedVendor ? (
              <p style={{ fontSize: 14, color: "#6B7280" }}>Loading vendor details...</p>
            ) : (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2
                        style={{
                          fontSize: 24,
                          fontWeight: 800,
                          color: "#1A1A1A",
                        }}
                      >
                        {selectedVendor.businessName}
                      </h2>
                      <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
                        {selectedVendor.contactName} · {selectedVendor.email}
                      </p>
                    </div>
                    <span
                      className="rounded-full"
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        backgroundColor: "#EEF2FF",
                        color: "#3730A3",
                      }}
                    >
                      {selectedVendor.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "#6B7280", marginTop: 10 }}>
                    Submitted{" "}
                    {selectedVendor.submittedAt
                      ? formatDate(selectedVendor.submittedAt)
                      : formatDate(selectedVendor.createdAt)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
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
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl"
                      style={{ padding: 16, backgroundColor: "#F9FAFB" }}
                    >
                      <p style={{ fontSize: 12, color: "#6B7280" }}>{label}</p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", marginTop: 6 }}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#1A1A1A",
                      marginBottom: 10,
                    }}
                  >
                    Uploaded documents
                  </p>
                  <div className="flex flex-col gap-3">
                    {(selectedVendor.documents ?? []).length === 0 ? (
                      <p style={{ fontSize: 13, color: "#6B7280" }}>
                        No documents uploaded.
                      </p>
                    ) : (
                      selectedVendor.documents?.map((document) => (
                        <a
                          key={document.id}
                          href={document.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-2xl"
                          style={{
                            padding: 14,
                            backgroundColor: "#F9FAFB",
                            border: "1px solid #E5E7EB",
                            color: "#2C5F2D",
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {document.docType.replaceAll("_", " ")}
                        </a>
                      ))
                    )}
                  </div>
                </div>

                {(selectedVendor.status === "PENDING_REVIEW" ||
                  selectedVendor.status === "ACTIVE" ||
                  selectedVendor.status === "SUSPENDED") && (
                  <div className="flex flex-col gap-3">
                    <label
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#1A1A1A",
                      }}
                    >
                      Review note
                    </label>
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      placeholder="Required for reject and suspend actions."
                      rows={4}
                      style={{
                        borderRadius: 16,
                        border: "1px solid #D1D5DB",
                        padding: 14,
                        fontSize: 14,
                        color: "#1A1A1A",
                        resize: "vertical",
                      }}
                    />
                    {actionError && (
                      <p style={{ fontSize: 13, color: "#B91C1C" }}>{actionError}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {selectedVendor.status === "PENDING_REVIEW" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void runAction("approve")}
                        disabled={actionLoading}
                        className="flex items-center gap-2 rounded-xl"
                        style={{
                          padding: "12px 16px",
                          backgroundColor: "#166534",
                          color: "#FFFFFF",
                          fontSize: 14,
                          fontWeight: 700,
                          opacity: actionLoading ? 0.7 : 1,
                        }}
                      >
                        <CheckCircle2 size={16} />
                        Approve vendor
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction("reject")}
                        disabled={actionLoading}
                        className="rounded-xl"
                        style={{
                          padding: "12px 16px",
                          backgroundColor: "#991B1B",
                          color: "#FFFFFF",
                          fontSize: 14,
                          fontWeight: 700,
                          opacity: actionLoading ? 0.7 : 1,
                        }}
                      >
                        Reject application
                      </button>
                    </>
                  )}

                  {selectedVendor.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => void runAction("suspend")}
                      disabled={actionLoading}
                      className="rounded-xl"
                      style={{
                        padding: "12px 16px",
                        backgroundColor: "#9A3412",
                        color: "#FFFFFF",
                        fontSize: 14,
                        fontWeight: 700,
                        opacity: actionLoading ? 0.7 : 1,
                      }}
                    >
                      Suspend vendor
                    </button>
                  )}

                  {selectedVendor.status === "SUSPENDED" && (
                    <button
                      type="button"
                      onClick={() => void runAction("reactivate")}
                      disabled={actionLoading}
                      className="rounded-xl"
                      style={{
                        padding: "12px 16px",
                        backgroundColor: "#1D4ED8",
                        color: "#FFFFFF",
                        fontSize: 14,
                        fontWeight: 700,
                        opacity: actionLoading ? 0.7 : 1,
                      }}
                    >
                      Reactivate vendor
                    </button>
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
