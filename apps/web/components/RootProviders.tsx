"use client";

import { NotificationProvider } from "../lib/NotificationContext";
import { ToastContainer } from "./ui/ToastContainer";

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      {children}
      <ToastContainer />
    </NotificationProvider>
  );
}
