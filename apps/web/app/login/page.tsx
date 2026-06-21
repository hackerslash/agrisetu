import { LoginForm } from "./LoginForm";
import { ShieldCheck, BadgeCheck, HandCoins, Truck } from "lucide-react";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { VendorSessionGate } from "../../components/auth/VendorSessionGate";

const TRUST_POINTS = [
  {
    Icon: BadgeCheck,
    title: "Verified clusters, real demand",
    desc: "Quote to farmer collectives with confirmed volumes — no guesswork.",
  },
  {
    Icon: HandCoins,
    title: "Payments held in escrow",
    desc: "Funds are secured up front and released the moment you deliver.",
  },
  {
    Icon: Truck,
    title: "One portal, end to end",
    desc: "Bids, orders, dispatch and payouts — managed in a single place.",
  },
];

export default function LoginPage() {
  return (
    <VendorSessionGate loadingMessage="Checking your vendor session...">
      <div className="flex" style={{ minHeight: "100vh" }}>
        {/* Left brand panel */}
        <div
          className="relative hidden flex-col justify-between overflow-hidden bg-leaf-800 lg:flex"
          style={{ width: 560, padding: "56px 52px", flexShrink: 0 }}
        >
          {/* soft ambient glows — radial fades blend into the panel */}
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              width: 520,
              height: 520,
              top: -200,
              right: -200,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, var(--color-leaf-500) 0%, transparent 68%)",
              opacity: 0.55,
              filter: "blur(40px)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              width: 420,
              height: 420,
              bottom: -160,
              left: -140,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, var(--color-leaf-600) 0%, transparent 70%)",
              opacity: 0.5,
              filter: "blur(48px)",
            }}
          />

          <div className="relative">
            <BrandLogo theme="dark" titleSize={19} badgeSize={42} iconSize={21} />
          </div>

          <div className="relative flex flex-col gap-10">
            <div className="flex flex-col gap-4">
              <p
                className="eyebrow"
                style={{ color: "var(--color-gold-300)" }}
              >
                AgriSetu Vendor Network
              </p>
              <h1
                className="font-display text-white"
                style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.12 }}
              >
                Grow your business with
                <br />
                India&apos;s farming clusters
              </h1>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: "color-mix(in oklch, white 82%, transparent)",
                }}
              >
                Supply quality seeds, fertilizers and crop inputs to verified
                farmer collectives — with transparent pricing and guaranteed
                volumes.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {TRUST_POINTS.map(({ Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3.5">
                  <span
                    className="flex shrink-0 items-center justify-center rounded-xl"
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: "color-mix(in oklch, white 14%, transparent)",
                    }}
                  >
                    <Icon size={19} color="var(--color-gold-300)" />
                  </span>
                  <div>
                    <p
                      className="font-display text-white"
                      style={{ fontSize: 15, fontWeight: 700 }}
                    >
                      {title}
                    </p>
                    <p
                      style={{
                        fontSize: 13.5,
                        marginTop: 2,
                        lineHeight: 1.5,
                        color: "color-mix(in oklch, white 70%, transparent)",
                      }}
                    >
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center gap-2">
            <ShieldCheck
              size={15}
              color="color-mix(in oklch, white 70%, transparent)"
            />
            <p
              style={{
                fontSize: 12.5,
                color: "color-mix(in oklch, white 65%, transparent)",
              }}
            >
              Government-verified vendors only · AgriStack compliant · NABARD-aligned
            </p>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex flex-1 items-center justify-center bg-paper px-6 py-12">
          <div className="w-full" style={{ maxWidth: 420 }}>
            <LoginForm />
          </div>
        </div>
      </div>
    </VendorSessionGate>
  );
}
