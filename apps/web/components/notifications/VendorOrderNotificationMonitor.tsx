"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthToken, vendorApi } from "@repo/api-client";
import type { Cluster } from "@repo/api-client";
import { useNotifications } from "../../lib/NotificationContext";

const emittedEventKeys = new Set<string>();

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
  const seeded = useRef(false);
  const knownStatuses = useRef<Map<string, string>>(new Map());

  const { data: orders = [], isFetched } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: () => vendorApi.getOrders(),
    refetchInterval: 15_000,
    enabled: !!getAuthToken(),
  });

  useEffect(() => {
    if (!isFetched) return;

    const currentOrders = orders as Cluster[];
    const previous = knownStatuses.current;

    if (!seeded.current) {
      currentOrders.forEach((order) => previous.set(order.id, order.status));
      seeded.current = true;
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
        if (order.status === "PAYMENT") {
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
  }, [orders, isFetched, addNotification, queryClient]);

  return null;
}
