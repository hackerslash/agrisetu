"use client";

import { useNotifications } from "../../lib/NotificationContext";
import { X, ShoppingBag, CheckCircle, Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

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
        gap: 10,
        maxWidth: 360,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 rounded-2xl shadow-lg"
          style={{
            backgroundColor: "#1A1A1A",
            color: "white",
            padding: "14px 16px",
            animation: "slideUp 0.25s ease",
          }}
        >
          <div
            className="flex items-center justify-center rounded-xl shrink-0"
            style={{ width: 36, height: 36, backgroundColor: "#2C5F2D" }}
          >
            {toast.type === "order_delivered" ? (
              <CheckCircle size={16} color="white" />
            ) : toast.type === "order_new" ? (
              <ShoppingBag size={16} color="white" />
            ) : (
              <Bell size={16} color="white" />
            )}
          </div>
          <div className="flex flex-col gap-0.5 flex-1">
            <p style={{ fontSize: 13, fontWeight: 600, color: "white" }}>
              {toast.title}
            </p>
            <p style={{ fontSize: 12, color: "#A0A0A0", lineHeight: 1.4 }}>
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
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#4ADE80",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                }}
              >
                View Order →
              </button>
            )}
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <X size={14} color="#A0A0A0" />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
