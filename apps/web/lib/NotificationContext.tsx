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
  message: string;
  orderId?: string;
  createdAt: Date;
  read: boolean;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (message: string, orderId?: string) => void;
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

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addNotification = useCallback(
    (message: string, orderId?: string) => {
      const id = `notif-${Date.now()}-${Math.random()}`;
      const notif: AppNotification = {
        id,
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
