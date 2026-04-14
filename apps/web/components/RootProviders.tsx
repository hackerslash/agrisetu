"use client";

import { NotificationProvider } from "../lib/NotificationContext";
import { DesktopOnlyOverlay } from "./ui/DesktopOnlyOverlay";
import { ToastContainer } from "./ui/ToastContainer";

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      {children}
      <DesktopOnlyOverlay />
      <ToastContainer />
    </NotificationProvider>
  );
}
