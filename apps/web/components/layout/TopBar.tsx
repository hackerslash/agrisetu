"use client";

import { Bell, Calendar, LogOut, User, ChevronDown, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { authApi, clearAuthToken } from "@repo/api-client";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "../../lib/NotificationContext";

interface TopBarProps {
  title: string;
  subtitle?: string;
  vendorName?: string;
  showDatePill?: boolean;
  actions?: React.ReactNode;
}

export function TopBar({
  title,
  subtitle,
  vendorName,
  showDatePill,
  actions,
}: TopBarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      clearAuthToken();
      queryClient.clear();
      router.push("/login");
    }
  }

  function handleBellClick() {
    setShowNotifPanel((v) => !v);
    setShowUserMenu(false);
    if (!showNotifPanel) markAllRead();
  }

  function handleUserMenuClick() {
    setShowUserMenu((v) => !v);
    setShowNotifPanel(false);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const dateLabel = new Date().toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });

  return (
    <header
      className="flex items-center justify-between bg-paper"
      style={{
        height: 76,
        borderBottom: "1px solid var(--color-line)",
        padding: "0 36px",
        position: "sticky",
        top: 0,
        zIndex: 20,
        backdropFilter: "saturate(1.1)",
      }}
    >
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-ink" style={{ fontSize: 23, fontWeight: 800 }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-ink-faint" style={{ fontSize: 13 }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {actions}

        {showDatePill && (
          <div
            className="flex items-center gap-2 rounded-xl bg-surface"
            style={{ padding: "9px 14px", border: "1px solid var(--color-line)" }}
          >
            <Calendar size={15} className="text-ink-faint" />
            <span className="text-ink-soft tnum" style={{ fontSize: 13, fontWeight: 600 }}>
              {dateLabel}
            </span>
          </div>
        )}

        {/* Notification bell */}
        <div ref={notifPanelRef} style={{ position: "relative" }}>
          <button
            onClick={handleBellClick}
            aria-label="Notifications"
            className="flex items-center justify-center rounded-xl bg-surface transition-colors hover:bg-sunk"
            style={{
              width: 42,
              height: 42,
              position: "relative",
              border: "1px solid var(--color-line)",
            }}
          >
            <Bell size={18} className={showNotifPanel ? "text-leaf-600" : "text-ink-soft"} />
            {unreadCount > 0 && (
              <span
                className="absolute flex items-center justify-center rounded-full bg-clay-500 text-white"
                style={{
                  top: 5,
                  right: 5,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  fontSize: 9,
                  fontWeight: 700,
                  border: "2px solid var(--color-paper)",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifPanel && (
            <div
              className="absolute right-0 bg-surface flex flex-col overflow-hidden rise"
              style={{
                top: 50,
                width: 360,
                maxHeight: 440,
                borderRadius: 18,
                border: "1px solid var(--color-line)",
                boxShadow: "var(--shadow-pop)",
              }}
            >
              <div
                className="flex items-center justify-between"
                style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-line)" }}
              >
                <p className="font-display text-ink" style={{ fontSize: 15, fontWeight: 700 }}>
                  Notifications
                </p>
                {notifications.length > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-leaf-600"
                    style={{ fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {notifications.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center gap-2.5"
                    style={{ padding: 36 }}
                  >
                    <div
                      className="flex items-center justify-center rounded-2xl bg-sunk"
                      style={{ width: 48, height: 48 }}
                    >
                      <Bell size={22} className="text-ink-faint" />
                    </div>
                    <p className="text-ink-soft" style={{ fontSize: 13, fontWeight: 600 }}>
                      You&apos;re all caught up
                    </p>
                    <p className="text-ink-faint" style={{ fontSize: 12, textAlign: "center" }}>
                      New order activity will show up here.
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 transition-colors hover:bg-sunk"
                      style={{
                        padding: "13px 16px",
                        borderBottom: "1px solid var(--color-line)",
                        backgroundColor: n.read ? "transparent" : "var(--color-leaf-50)",
                        cursor: n.orderId ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (n.orderId) {
                          void queryClient.invalidateQueries({
                            queryKey: ["vendor-order", n.orderId],
                            refetchType: "active",
                          });
                          void queryClient.invalidateQueries({
                            queryKey: ["vendor-orders"],
                            refetchType: "active",
                          });
                          router.push(`/orders/${n.orderId}`);
                          setShowNotifPanel(false);
                        }
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-xl shrink-0 bg-leaf-100"
                        style={{ width: 34, height: 34 }}
                      >
                        <ShoppingBag size={15} className="text-leaf-700" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <p
                          className="text-leaf-700"
                          style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}
                        >
                          {n.title}
                        </p>
                        <p
                          className="text-ink"
                          style={{ fontSize: 13, fontWeight: n.read ? 400 : 500, lineHeight: 1.4 }}
                        >
                          {n.message}
                        </p>
                        <p className="text-ink-faint tnum" style={{ fontSize: 11 }}>
                          {n.createdAt.toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar with dropdown */}
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button
            onClick={handleUserMenuClick}
            className="flex items-center gap-1.5 rounded-full bg-leaf-600 text-white transition-colors hover:bg-leaf-700"
            style={{ height: 42, paddingLeft: 5, paddingRight: 9, cursor: "pointer" }}
          >
            <span
              className="flex items-center justify-center rounded-full font-display"
              style={{
                width: 32,
                height: 32,
                backgroundColor: "color-mix(in oklch, white 22%, transparent)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {vendorName?.[0]?.toUpperCase() ?? "V"}
            </span>
            <ChevronDown
              size={14}
              style={{
                transform: showUserMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 bg-surface flex flex-col overflow-hidden rise"
              style={{
                top: 50,
                width: 216,
                borderRadius: 16,
                border: "1px solid var(--color-line)",
                boxShadow: "var(--shadow-pop)",
              }}
            >
              <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--color-line)" }}>
                <p className="text-ink" style={{ fontSize: 13, fontWeight: 700 }}>
                  {vendorName ?? "Vendor"}
                </p>
                <p className="text-ink-faint" style={{ fontSize: 11, marginTop: 2 }}>
                  Vendor account
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  router.push("/settings");
                }}
                className="flex items-center gap-2.5 text-ink transition-colors hover:bg-sunk"
                style={{
                  padding: "11px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                }}
              >
                <User size={15} className="text-ink-faint" />
                Profile &amp; Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 text-danger transition-colors hover:bg-danger-bg"
                style={{
                  padding: "11px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  borderTop: "1px solid var(--color-line)",
                }}
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
