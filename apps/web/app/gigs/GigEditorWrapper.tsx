"use client";

import { useQuery } from "@tanstack/react-query";
import { vendorApi } from "@repo/api-client";
import { GigEditor } from "./GigEditor";

export function GigEditorWrapper({ id }: { id: string }) {
  const { data: gig, isLoading } = useQuery({
    queryKey: ["gig", id],
    queryFn: async () => {
      const gigs = await vendorApi.getGigs();
      return gigs.find((g) => g.id === id);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 300 }}>
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>Loading gig…</p>
      </div>
    );
  }

  return <GigEditor initialData={gig} />;
}
