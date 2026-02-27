import { RegisterWizard } from "./RegisterWizard";
import { Sprout, ShieldCheck } from "lucide-react";

const STEPS = [
  { number: 1, label: "Business Details", desc: "Company & contact info" },
  { number: 2, label: "GSTIN Verification", desc: "Tax & compliance" },
  { number: 3, label: "Upload Documents", desc: "Certifications & ID" },
];

export default function RegisterPage() {
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
        {/* Top */}
        <div className="flex flex-col gap-12">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{
                width: 40,
                height: 40,
                backgroundColor: "rgba(255,255,255,0.15)",
              }}
            >
              <Sprout size={20} color="white" />
            </div>
            <div>
              <p
                className="font-bold text-white"
                style={{ fontFamily: "Plus Jakarta Sans", fontSize: 18 }}
              >
                AgriSetu
              </p>
              <p style={{ fontSize: 12, color: "rgba(252,246,245,0.7)" }}>
                Vendor Portal
              </p>
            </div>
          </div>

          {/* Hero */}
          <div className="flex flex-col gap-4">
            <h1
              className="font-extrabold text-white"
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 38,
                lineHeight: 1.15,
              }}
            >
              Join India&apos;s largest
              <br />
              agri-input network
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "rgba(252,246,245,0.85)",
                lineHeight: 1.6,
              }}
            >
              Register as a verified vendor and start supplying quality
              agricultural inputs to farmer clusters across India.
            </p>
          </div>
        </div>

        {/* Steps block */}
        <div className="flex flex-col gap-4">
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(252,246,245,0.7)",
              letterSpacing: "0.08em",
            }}
          >
            REGISTRATION STEPS
          </p>
          {STEPS.map((step) => (
            <div key={step.number} className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "Plus Jakarta Sans",
                }}
              >
                {step.number}
              </div>
              <div>
                <p
                  className="text-white font-semibold"
                  style={{ fontSize: 14 }}
                >
                  {step.label}
                </p>
                <p style={{ fontSize: 12, color: "rgba(252,246,245,0.6)" }}>
                  {step.desc}
                </p>
              </div>
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
        <div style={{ width: 440 }}>
          <RegisterWizard />
        </div>
      </div>
    </div>
  );
}
