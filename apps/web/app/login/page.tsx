import { LoginForm } from "./LoginForm";
import { ShieldCheck } from "lucide-react";
import { BrandLogo } from "../../components/ui/BrandLogo";

export default function LoginPage() {
  return (
    <div className="flex" style={{ minHeight: "100vh" }}>
      {/* Left panel */}
      <div
        className="flex flex-col justify-between"
        style={{
          width: 720,
          backgroundColor: "#2C5F2D",
          padding: "64px 60px 56px 60px",
          flexShrink: 0,
        }}
      >
        {/* Top section */}
        <div className="flex flex-col gap-12">
          {/* Logo row */}
          <BrandLogo theme="dark" titleSize={18} badgeSize={40} iconSize={20} />

          {/* Hero text */}
          <div className="flex flex-col gap-4">
            <h1
              className="font-extrabold text-white"
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 40,
                lineHeight: 1.15,
              }}
            >
              Connect directly with
              <br />
              1000+ farming clusters
            </h1>
            <p
              style={{
                fontSize: 16,
                color: "rgba(252,246,245,0.85)",
                lineHeight: 1.6,
              }}
            >
              Supply quality agricultural inputs — seeds, fertilizers,
              pesticides — to farmer collectives across rural India. Transparent
              pricing, guaranteed volumes.
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4">
          {[
            { value: "12,000+", label: "Active Farmers" },
            { value: "₹2.4Cr", label: "Monthly GMV" },
            { value: "98%", label: "Payment Success" },
          ].map(({ value, label }) => (
            <div
              key={label}
              className="flex-1 flex flex-col gap-1 rounded-2xl"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                padding: "16px 20px",
              }}
            >
              <p
                className="font-bold text-white"
                style={{ fontFamily: "Plus Jakarta Sans", fontSize: 22 }}
              >
                {value}
              </p>
              <p style={{ fontSize: 13, color: "rgba(252,246,245,0.7)" }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} color="rgba(252,246,245,0.7)" />
          <p style={{ fontSize: 13, color: "rgba(252,246,245,0.7)" }}>
            Government-verified vendors only · AgriStack compliant ·
            NABARD-aligned
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{ backgroundColor: "#FFFFFF", padding: "48px 80px" }}
      >
        <div
          className="flex flex-col gap-6 rounded-2xl bg-white"
          style={{ width: 440, padding: 40 }}
        >
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
