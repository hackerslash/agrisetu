"use client";

import { authApi } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getPortalHomePath } from "../../lib/portal";

interface VendorSessionGateProps {
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
  unauthenticatedRedirect,
  loadingMessage = "Checking your vendor session...",
  children,
}: VendorSessionGateProps) {
  const router = useRouter();
  const { data: session, error, isPending } = useQuery({
    queryKey: ["vendor-session"],
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (session) {
      router.replace(getPortalHomePath(session));
      return;
    }

    if (session === null && unauthenticatedRedirect) {
      router.replace(unauthenticatedRedirect);
      return;
    }

    if (error && unauthenticatedRedirect) {
      router.replace(unauthenticatedRedirect);
    }
  }, [
    error,
    router,
    session,
    unauthenticatedRedirect,
  ]);

  if (
    isPending ||
    Boolean(session) ||
    (session === null && Boolean(unauthenticatedRedirect)) ||
    (Boolean(error) && Boolean(unauthenticatedRedirect))
  ) {
    return <LoadingState message={loadingMessage} />;
  }

  return <>{children}</>;
}
