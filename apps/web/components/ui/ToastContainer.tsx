"use client";

import { useNotifications } from "../../lib/NotificationContext";
import { X, ShoppingBag, CheckCircle, Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

const TONE: Record<string, { chip: string; icon: React.ReactNode }> = {
  order_delivered: {
    chip: "bg-leaf-100 text-leaf-700",
    icon: <CheckCircle size={16} />,
  },
  order_new: {
    chip: "bg-gold-100 text-gold-700",
    icon: <ShoppingBag size={16} />,
  },
};

export function ToastContainer() {
  const { toasts, dismissToast } = useNotifications();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 380,
      }}
    >
      {toasts.map((toast) => {
        const tone = TONE[toast.type] ?? {
          chip: "bg-info-bg text-info",
          icon: <Bell size={16} />,
        };
        return (
          <div
            key={toast.id}
            className="card flex items-start gap-3"
            style={{
              padding: "14px 16px",
              boxShadow: "var(--shadow-pop)",
              animation: "toastIn 0.32s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <div
              className={`flex items-center justify-center rounded-xl shrink-0 ${tone.chip}`}
              style={{ width: 36, height: 36 }}
            >
              {tone.icon}
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <p className="text-ink" style={{ fontSize: 13.5, fontWeight: 700 }}>
                {toast.title}
              </p>
              <p className="text-ink-soft" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                {toast.message}
              </p>
              {toast.orderId && (
                <button
                  onClick={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["vendor-order", toast.orderId],
                      refetchType: "active",
                    });
                    void queryClient.invalidateQueries({
                      queryKey: ["vendor-orders"],
                      refetchType: "active",
                    });
                    router.push(`/orders/${toast.orderId}`);
                    dismissToast(toast.id);
                  }}
                  className="text-leaf-700"
                  style={{
                    marginTop: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  View order →
                </button>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss"
              className="text-ink-faint transition-colors hover:text-ink"
              style={{ cursor: "pointer", padding: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes toastIn {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
