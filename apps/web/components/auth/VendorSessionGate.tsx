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
      className="flex items-center justify-center bg-paper"
      style={{ minHeight: "100vh", padding: 24 }}
    >
      <div className="flex flex-col items-center gap-4">
        <span
          aria-hidden
          className="rounded-full"
          style={{
            width: 34,
            height: 34,
            border: "3px solid var(--color-leaf-100)",
            borderTopColor: "var(--color-leaf-600)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <p className="text-ink-soft" style={{ fontSize: 14, fontWeight: 600 }}>
          {message}
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
