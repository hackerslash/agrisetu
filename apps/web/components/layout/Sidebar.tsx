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
      className="fixed left-0 top-0 h-screen flex flex-col justify-between bg-surface"
      style={{ width: 248, borderRight: "1px solid var(--color-line)" }}
    >
      <div className="flex flex-col gap-7 px-4 pt-7">
        <div className="px-2">
          <BrandLogo titleSize={17} badgeSize={38} iconSize={20} />
        </div>

        <nav className="flex flex-col gap-1">
          <p className="eyebrow px-3 pb-1">Menu</p>
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={
                  isActive
                    ? "flex items-center gap-3 rounded-xl bg-leaf-600 text-white font-semibold"
                    : "flex items-center gap-3 rounded-xl text-ink-soft font-medium transition-colors hover:bg-sunk hover:text-ink"
                }
                style={{
                  height: 44,
                  padding: "0 12px",
                  fontSize: 14,
                  boxShadow: isActive
                    ? "0 6px 16px oklch(0.47 0.115 150 / 0.25)"
                    : "none",
                }}
              >
                <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-4 pb-6">
        <div className="inset flex items-center gap-2.5" style={{ padding: "11px 12px" }}>
          <div
            className="flex items-center justify-center rounded-full bg-leaf-600 text-white flex-shrink-0 font-display"
            style={{ width: 34, height: 34, fontSize: 14, fontWeight: 700 }}
          >
            {vendorName?.[0]?.toUpperCase() ?? "V"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink" style={{ fontSize: 13 }}>
              {vendorName ?? "Vendor"}
            </p>
            <p className="text-ink-faint" style={{ fontSize: 11 }}>
              Vendor account
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
