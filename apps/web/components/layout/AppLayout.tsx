"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearAuthToken } from "@repo/api-client";
import { authApi } from "@repo/api-client";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { VendorOrderNotificationMonitor } from "../notifications/VendorOrderNotificationMonitor";

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  showDatePill?: boolean;
  topBarActions?: React.ReactNode;
}

export function AppLayout({
  children,
  title,
  subtitle,
  showDatePill,
  topBarActions,
}: AppLayoutProps) {
  const router = useRouter();

  const { data: vendor, error: meError } = useQuery({
    queryKey: ["vendor-me"],
    queryFn: () => authApi.getMe(),
    retry: false,
  });

  // If the API rejects the token (401/403), clear it and redirect
  useEffect(() => {
    if (meError) {
      const err = meError as { response?: { status?: number } };
      if (err.response?.status === 401 || err.response?.status === 403) {
        clearAuthToken();
        router.push("/login");
      }
    }
  }, [meError, router]);

  return (
    <div className="flex" style={{ minHeight: "100vh" }}>
      <VendorOrderNotificationMonitor vendorId={vendor?.id} />
      <Sidebar vendorName={vendor?.businessName} />
      <div
        className="flex flex-col flex-1"
        style={{ marginLeft: 240, minHeight: "100vh" }}
      >
        <TopBar
          title={title}
          subtitle={subtitle}
          vendorName={vendor?.businessName}
          showDatePill={showDatePill}
          actions={topBarActions}
        />
        <main
          className="flex-1"
          style={{ padding: "28px 32px", backgroundColor: "#F7F5F0" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
