"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearAuthToken } from "@repo/api-client";

interface TopBarProps {
  title: string;
  subtitle?: string;
  vendorName?: string;
}

export function TopBar({ title, subtitle, vendorName }: TopBarProps) {
  const router = useRouter();

  function handleLogout() {
    clearAuthToken();
    router.push("/login");
  }

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

      <div className="flex items-center gap-4">
        <button
          className="flex items-center justify-center rounded-xl transition-colors hover:bg-[#F7F5F0]"
          style={{ width: 40, height: 40 }}
        >
          <Bell size={18} color="#A0A0A0" />
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 36,
            height: 36,
            backgroundColor: "#2C5F2D",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
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
