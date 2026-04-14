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
          "linear-gradient(180deg, rgba(18, 36, 22, 0.94) 0%, rgba(24, 50, 30, 0.88) 100%)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="w-full max-w-md rounded-[28px]"
        style={{
          backgroundColor: "#FCFAF5",
          padding: 28,
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.22)",
        }}
      >
        <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{
              width: 56,
              height: 56,
              backgroundColor: "rgba(44, 95, 45, 0.1)",
              color: "#2C5F2D",
            }}
          >
            <LaptopMinimal size={28} />
          </div>
          <div
            className="flex items-center gap-2 rounded-full"
            style={{
              backgroundColor: "#EAF2E5",
              color: "#2C5F2D",
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Smartphone size={14} />
            Mobile device detected
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h1
            id="desktop-only-overlay-title"
            className="font-extrabold"
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 28,
              lineHeight: 1.15,
              color: "#17311B",
            }}
          >
            Please open the vendor portal on a desktop
          </h1>
          <p
            id="desktop-only-overlay-description"
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: "#4F5D52",
            }}
          >
            AgriSetu&apos;s vendor portal is currently optimized for desktop and
            laptop browsers. To continue, reopen this same link on a desktop
            device.
          </p>
        </div>

        <div
          className="rounded-3xl"
          style={{
            marginTop: 24,
            padding: "18px 20px",
            backgroundColor: "#F2EEE4",
          }}
        >
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: "#59685C",
            }}
          >
            For the best experience, use a larger screen with a keyboard and
            mouse or trackpad.
          </p>
        </div>
      </div>
    </div>
  );
}
