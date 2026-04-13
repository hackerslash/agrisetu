import type { Vendor } from "@repo/api-client";

export function getPortalHomePath(account?: Pick<Vendor, "role"> | null) {
  if (!account) return "/login";
  return account.role === "SUPERADMIN" ? "/admin" : "/dashboard";
}
