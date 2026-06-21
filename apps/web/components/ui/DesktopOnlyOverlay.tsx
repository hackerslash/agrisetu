"use client";

import { LaptopMinimal, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

const MOBILE_USER_AGENT_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function isMobileViewport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || navigator.vendor || "";
  const hasTouch = navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const canHover = window.matchMedia("(hover: hover)").matches;

  return (
    MOBILE_USER_AGENT_REGEX.test(userAgent) ||
    (hasTouch && coarsePointer && !canHover)
  );
}

function bindMediaQuery(mediaQuery: MediaQueryList, listener: () => void) {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}

export function DesktopOnlyOverlay() {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const syncBlockedState = () => {
      setIsBlocked(isMobileViewport());
    };

    syncBlockedState();

    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const hoverQuery = window.matchMedia("(hover: hover)");
    const unbindCoarsePointer = bindMediaQuery(
      coarsePointerQuery,
      syncBlockedState,
    );
    const unbindHover = bindMediaQuery(hoverQuery, syncBlockedState);

    window.addEventListener("resize", syncBlockedState);
    window.addEventListener("orientationchange", syncBlockedState);

    return () => {
      unbindCoarsePointer();
      unbindHover();
      window.removeEventListener("resize", syncBlockedState);
      window.removeEventListener("orientationchange", syncBlockedState);
    };
  }, []);

  useEffect(() => {
    if (!isBlocked) {
      document.body.style.removeProperty("overflow");
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isBlocked]);

  if (!isBlocked) {
    return null;
  }

  return (
    <div
      aria-labelledby="desktop-only-overlay-title"
      aria-describedby="desktop-only-overlay-description"
      aria-modal="true"
      role="alertdialog"
      className="fixed inset-0 z-9999 flex items-center justify-center p-5"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.33 0.08 152 / 0.96) 0%, oklch(0.27 0.06 153 / 0.92) 100%)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className="w-full max-w-md panel"
        style={{ padding: 30, boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 22 }}>
          <div
            className="flex items-center justify-center rounded-2xl bg-leaf-100 text-leaf-700"
            style={{ width: 56, height: 56 }}
          >
            <LaptopMinimal size={28} />
          </div>
          <div className="pill bg-gold-100 text-gold-700">
            <Smartphone size={13} />
            On a phone
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h1
            id="desktop-only-overlay-title"
            className="font-display text-ink"
            style={{ fontSize: 27, lineHeight: 1.15, fontWeight: 800 }}
          >
            Best opened on a computer
          </h1>
          <p
            id="desktop-only-overlay-description"
            className="text-ink-soft"
            style={{ fontSize: 15, lineHeight: 1.6 }}
          >
            The AgriSetu vendor portal is built for desktop and laptop screens.
            Open this same link on a computer to manage your gigs, orders, and
            payments comfortably.
          </p>
        </div>

        <div className="inset" style={{ marginTop: 24, padding: "16px 18px" }}>
          <p className="text-ink-faint" style={{ fontSize: 13, lineHeight: 1.55 }}>
            A larger screen with a keyboard and mouse gives you the full
            experience — including charts, tables, and bidding tools.
          </p>
        </div>
      </div>
    </div>
  );
}
