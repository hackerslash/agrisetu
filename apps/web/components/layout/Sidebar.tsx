"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Tag,
  ClipboardList,
  Wallet,
  BarChart2,
  Settings,
} from "lucide-react";
import { BrandLogo } from "../ui/BrandLogo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/gigs", label: "Gigs", icon: Tag },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  vendorName?: string;
}

export function Sidebar({ vendorName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col justify-between py-8"
      style={{
        width: 240,
        backgroundColor: "#ffffff",
        borderRight: "1px solid #f0ede8",
      }}
    >
      {/* Top */}
      <div className="flex flex-col gap-8 px-5">
        {/* Logo */}
        <div className="pb-5">
          <BrandLogo theme="light" titleSize={16} badgeSize={36} iconSize={18} />
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-xl transition-colors"
                style={{
                  height: 44,
                  padding: "0 12px",
                  backgroundColor: isActive ? "#2C5F2D" : "transparent",
                  color: isActive ? "#ffffff" : "#A0A0A0",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "#F7F5F0";
                    e.currentTarget.style.color = "#1A1A1A";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "#A0A0A0";
                  }
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom vendor card */}
      <div className="px-5">
        <div
          className="flex items-center gap-2.5 rounded-xl"
          style={{
            padding: "10px 12px",
            backgroundColor: "#F7F5F0",
          }}
        >
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: 32,
              height: 32,
              backgroundColor: "#2C5F2D",
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "Plus Jakarta Sans",
            }}
          >
            {vendorName?.[0]?.toUpperCase() ?? "V"}
          </div>
          <div className="min-w-0">
            <p
              className="truncate font-semibold"
              style={{ fontSize: 13, color: "#1A1A1A" }}
            >
              {vendorName ?? "Vendor"}
            </p>
            <p style={{ fontSize: 11, color: "#A0A0A0" }}>Vendor Account</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
