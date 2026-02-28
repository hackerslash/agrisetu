"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";

export interface AppNotification {
  id: string;
  title: string;
  type: "order_new" | "order_delivered" | "order_update" | "general";
  message: string;
  orderId?: string;
  createdAt: Date;
  read: boolean;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (
    message: string,
    orderId?: string,
    meta?: {
      title?: string;
      type?: AppNotification["type"];
      dedupeKey?: string;
    },
  ) => void;
  markAllRead: () => void;
  dismissToast: (id: string) => void;
  toasts: AppNotification[];
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const TOAST_DURATION = 5000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const emittedKeys = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addNotification = useCallback(
    (
      message: string,
      orderId?: string,
      meta?: {
        title?: string;
        type?: AppNotification["type"];
        dedupeKey?: string;
      },
    ) => {
      if (meta?.dedupeKey && emittedKeys.current.has(meta.dedupeKey)) return;
      if (meta?.dedupeKey) emittedKeys.current.add(meta.dedupeKey);

      const id = `notif-${Date.now()}-${Math.random()}`;
      const notif: AppNotification = {
        id,
        title: meta?.title ?? "Order Update",
        type: meta?.type ?? "order_update",
        message,
        orderId,
        createdAt: new Date(),
        read: false,
      };
      setNotifications((prev) => [notif, ...prev]);
      setToasts((prev) => [notif, ...prev]);

      const timer = setTimeout(() => {
        dismissToast(id);
      }, TOAST_DURATION);
      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAllRead, dismissToast, toasts }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
