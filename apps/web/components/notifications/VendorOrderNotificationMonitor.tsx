"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthToken, vendorApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { useNotifications } from "../../lib/NotificationContext";

const emittedEventKeys = new Set<string>();
const knownStatusesByOrderId = new Map<string, string>();
let seededForSession = false;
let activeSessionToken: string | null = null;
let lastSyncedAtForSession: number | null = null;

const STORAGE_VERSION = 2;
const STORAGE_KEY_PREFIX = "agrisetu_vendor_order_notif_state_v2_";

type PersistedMonitorState = {
  version: number;
  lastSyncedAt: number;
  knownStatuses: Record<string, string>;
};

function getTokenSubject(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadBase64 = parts[1]!
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1]!.length / 4) * 4, "=");
    const payload = JSON.parse(atob(payloadBase64)) as {
      id?: string;
      sub?: string;
      role?: string;
    };
    return payload.id ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

function getStorageKey(token: string | null) {
  const subject = getTokenSubject(token) ?? "unknown";
  return `${STORAGE_KEY_PREFIX}${subject}`;
}

function readPersistedState(token: string | null): PersistedMonitorState | null {
  if (typeof window === "undefined" || !token) return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMonitorState;
    if (
      parsed.version !== STORAGE_VERSION ||
      !Number.isFinite(parsed.lastSyncedAt) ||
      parsed.lastSyncedAt <= 0 ||
      typeof parsed.knownStatuses !== "object" ||
      parsed.knownStatuses === null
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedState(token: string | null) {
  if (typeof window === "undefined" || !token || !seededForSession) return;
  try {
    const knownStatuses: Record<string, string> = {};
    for (const [orderId, status] of knownStatusesByOrderId.entries()) {
      knownStatuses[orderId] = status;
    }
    const payload: PersistedMonitorState = {
      version: STORAGE_VERSION,
      lastSyncedAt: Date.now(),
      knownStatuses,
    };
    window.localStorage.setItem(getStorageKey(token), JSON.stringify(payload));
    lastSyncedAtForSession = payload.lastSyncedAt;
  } catch {
    // Ignore persistence failures; runtime detection still works for active session.
  }
}

function shortOrderId(id: string) {
  return id.slice(-6).toUpperCase();
}

function emitOnce(key: string, fn: () => void) {
  if (emittedEventKeys.has(key)) return;
  emittedEventKeys.add(key);
  fn();
}

export function VendorOrderNotificationMonitor() {
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();
  const token = getAuthToken();
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastTokenRef.current === token) return;
    lastTokenRef.current = token;

    // Reset tracking only when auth session changes.
    if (activeSessionToken !== token) {
      activeSessionToken = token;
      seededForSession = false;
      knownStatusesByOrderId.clear();
      emittedEventKeys.clear();
      lastSyncedAtForSession = null;

      const restored = readPersistedState(token);
      if (restored) {
        for (const [orderId, status] of Object.entries(restored.knownStatuses)) {
          if (typeof status === "string" && status.length > 0) {
            knownStatusesByOrderId.set(orderId, status);
          }
        }
        seededForSession = true;
        lastSyncedAtForSession = restored.lastSyncedAt;
      }
    }
  }, [token]);

  const { data: orders = [], isFetched, isFetchedAfterMount } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: () => vendorApi.getOrders(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnMount: "always",
    enabled: !!token,
  });

  useEffect(() => {
    if (!isFetched || !isFetchedAfterMount) return;

    const currentOrders = orders as Cluster[];
    const previous = knownStatusesByOrderId;
    const missedWhileOffline =
      seededForSession && Number.isFinite(lastSyncedAtForSession);

    if (!seededForSession) {
      currentOrders.forEach((order) => previous.set(order.id, order.status));
      seededForSession = true;
      writePersistedState(token);
      return;
    }

    const seenNow = new Set<string>();
    for (const order of currentOrders) {
      seenNow.add(order.id);
      const prevStatus = previous.get(order.id);

      if (!prevStatus) {
        void queryClient.invalidateQueries({
          queryKey: ["vendor-order", order.id],
          refetchType: "active",
        });
        const orderUpdatedAt = Date.parse(order.updatedAt);
        const qualifiesAsMissedOfflineOrder =
          missedWhileOffline &&
          Number.isFinite(orderUpdatedAt) &&
          orderUpdatedAt >
            (lastSyncedAtForSession ?? Number.NEGATIVE_INFINITY);

        if (order.status === "PAYMENT" && qualifiesAsMissedOfflineOrder) {
          emitOnce(`order_new:${order.id}`, () => {
            addNotification(
              `Order #${shortOrderId(order.id)} is now active.`,
              order.id,
              {
                title: "New Order Received",
                type: "order_new",
                dedupeKey: `order_new:${order.id}`,
              },
            );
          });
        }
        previous.set(order.id, order.status);
        continue;
      }

      if (prevStatus !== order.status) {
        void queryClient.invalidateQueries({
          queryKey: ["vendor-order", order.id],
          refetchType: "active",
        });
        if (prevStatus !== "COMPLETED" && order.status === "COMPLETED") {
          emitOnce(`order_delivered:${order.id}`, () => {
            addNotification(
              `Order #${shortOrderId(order.id)} has been delivered.`,
              order.id,
              {
                title: "Order Delivered",
                type: "order_delivered",
                dedupeKey: `order_delivered:${order.id}`,
              },
            );
          });
        }
        previous.set(order.id, order.status);
      }
    }

    for (const id of Array.from(previous.keys())) {
      if (!seenNow.has(id)) previous.delete(id);
    }

    writePersistedState(token);
  }, [orders, isFetched, isFetchedAfterMount, addNotification, queryClient, token]);

  return null;
}
