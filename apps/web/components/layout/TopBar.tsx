"use client";

import { Bell, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearAuthToken } from "@repo/api-client";

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

  function handleLogout() {
    clearAuthToken();
    router.push("/login");
  }

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
        {/* Optional custom actions (e.g. New Gig button) */}
        {actions}

        {/* Date pill — shown on Dashboard */}
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

        <button
          className="flex items-center justify-center rounded-xl transition-colors hover:bg-[#F7F5F0]"
          style={{ width: 38, height: 38 }}
        >
          <Bell size={18} color="#2C5F2D" />
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 38,
            height: 38,
            backgroundColor: "#2C5F2D",
            color: "white",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "Plus Jakarta Sans",
          }}
          title="Logout"
        >
          {vendorName?.[0]?.toUpperCase() ?? "V"}
        </button>
      </div>
    </header>
  );
}
