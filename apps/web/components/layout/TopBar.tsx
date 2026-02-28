"use client";

import { Bell, Calendar, LogOut, User, ChevronDown, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearAuthToken } from "@repo/api-client";
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

  function handleLogout() {
    clearAuthToken();
    router.push("/login");
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

  // Close panels on outside click
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
      className="flex items-center justify-between"
      style={{
        height: 72,
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #f0ede8",
        padding: "0 32px",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div className="flex flex-col gap-0.5">
        <h1
          className="font-bold"
          style={{
            fontFamily: "Plus Jakarta Sans",
            fontSize: 20,
            color: "#2C5F2D",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: "#A0A0A0" }}>{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {actions}

        {showDatePill && (
          <div
            className="flex items-center gap-2 rounded-xl"
            style={{ padding: "8px 14px", backgroundColor: "#F7F5F0" }}
          >
            <Calendar size={15} color="#A0A0A0" />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#2C5F2D" }}>
              {dateLabel}
            </span>
          </div>
        )}

        {/* Notification bell */}
        <div ref={notifPanelRef} style={{ position: "relative" }}>
          <button
            onClick={handleBellClick}
            className="flex items-center justify-center rounded-xl transition-colors hover:bg-[#F7F5F0]"
            style={{ width: 38, height: 38, position: "relative" }}
          >
            <Bell size={18} color={showNotifPanel ? "#2C5F2D" : "#5A5A5A"} />
            {unreadCount > 0 && (
              <span
                className="absolute flex items-center justify-center rounded-full"
                style={{
                  top: 4,
                  right: 4,
                  width: 16,
                  height: 16,
                  backgroundColor: "#EF4444",
                  color: "white",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifPanel && (
            <div
              className="absolute right-0 bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden"
              style={{
                top: 46,
                width: 340,
                maxHeight: 420,
                border: "1px solid #F0EDE8",
              }}
            >
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #F0EDE8",
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>
                  Notifications
                </p>
                {notifications.length > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{
                      fontSize: 12,
                      color: "#2C5F2D",
                      fontWeight: 600,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {notifications.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center gap-2"
                    style={{ padding: 32 }}
                  >
                    <Bell size={28} color="#D1D5DB" />
                    <p style={{ fontSize: 13, color: "#A0A0A0" }}>
                      No notifications yet
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3"
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #F7F5F0",
                        backgroundColor: n.read ? "white" : "#F0FDF4",
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
                        className="flex items-center justify-center rounded-xl shrink-0"
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: "#D1FAE5",
                        }}
                      >
                        <ShoppingBag size={14} color="#065F46" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#2C5F2D",
                            lineHeight: 1.3,
                          }}
                        >
                          {n.title}
                        </p>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: n.read ? 400 : 500,
                            color: "#1A1A1A",
                            lineHeight: 1.4,
                          }}
                        >
                          {n.message}
                        </p>
                        <p style={{ fontSize: 11, color: "#A0A0A0" }}>
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
            className="flex items-center gap-1.5 rounded-full transition-colors"
            style={{
              backgroundColor: "#2C5F2D",
              color: "white",
              height: 38,
              paddingLeft: 4,
              paddingRight: 8,
              border: "none",
              cursor: "pointer",
            }}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 30,
                height: 30,
                backgroundColor: "rgba(255,255,255,0.2)",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "Plus Jakarta Sans",
              }}
            >
              {vendorName?.[0]?.toUpperCase() ?? "V"}
            </span>
            <ChevronDown
              size={13}
              color="white"
              style={{
                transform: showUserMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 bg-white rounded-xl shadow-xl flex flex-col overflow-hidden"
              style={{
                top: 46,
                width: 200,
                border: "1px solid #F0EDE8",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #F0EDE8",
                }}
              >
                <p
                  style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}
                >
                  {vendorName ?? "Vendor"}
                </p>
                <p style={{ fontSize: 11, color: "#A0A0A0", marginTop: 2 }}>
                  Vendor account
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  router.push("/settings");
                }}
                className="flex items-center gap-2 hover:bg-[#F7F5F0] transition-colors"
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  color: "#1A1A1A",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                }}
              >
                <User size={14} color="#5A5A5A" />
                Profile & Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 hover:bg-[#FEF2F2] transition-colors"
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  color: "#DC2626",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  borderTop: "1px solid #F0EDE8",
                }}
              >
                <LogOut size={14} color="#DC2626" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
