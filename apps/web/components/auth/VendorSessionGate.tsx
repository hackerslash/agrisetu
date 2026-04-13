"use client";

import { authApi } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface VendorSessionGateProps {
  authenticatedRedirect: string;
  unauthenticatedRedirect?: string;
  loadingMessage?: string;
  children?: React.ReactNode;
}

function LoadingState({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "100vh", backgroundColor: "#F7F5F0", padding: 24 }}
    >
      <div
        className="rounded-2xl bg-white"
        style={{
          padding: "18px 22px",
          border: "1px solid #F0EDE8",
          color: "#2C5F2D",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "Plus Jakarta Sans",
        }}
      >
        {message}
      </div>
    </div>
  );
}

export function VendorSessionGate({
  authenticatedRedirect,
  unauthenticatedRedirect,
  loadingMessage = "Checking your vendor session...",
  children,
}: VendorSessionGateProps) {
  const router = useRouter();
  const { data: hasSession, error, isPending } = useQuery({
    queryKey: ["vendor-session"],
    queryFn: () => authApi.hasVendorSession(),
    retry: false,
  });

  useEffect(() => {
    if (hasSession === true) {
      router.replace(authenticatedRedirect);
      return;
    }

    if (hasSession === false && unauthenticatedRedirect) {
      router.replace(unauthenticatedRedirect);
      return;
    }

    if (error && unauthenticatedRedirect) {
      router.replace(unauthenticatedRedirect);
    }
  }, [
    authenticatedRedirect,
    error,
    hasSession,
    router,
    unauthenticatedRedirect,
  ]);

  if (
    isPending ||
    hasSession === true ||
    (hasSession === false && Boolean(unauthenticatedRedirect)) ||
    (Boolean(error) && Boolean(unauthenticatedRedirect))
  ) {
    return <LoadingState message={loadingMessage} />;
  }

  return <>{children}</>;
}
