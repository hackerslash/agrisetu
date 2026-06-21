import { RegisterWizard } from "./RegisterWizard";
import { ShieldCheck } from "lucide-react";
import { BrandLogo } from "../../components/ui/BrandLogo";

const STEPS = [
  { number: 1, label: "Business details", desc: "Company & contact info" },
  { number: 2, label: "GSTIN verification", desc: "Tax & compliance" },
  { number: 3, label: "Upload documents", desc: "Certifications & ID" },
];

export default function RegisterPage() {
  return (
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
            background: "radial-gradient(circle, var(--color-leaf-500) 0%, transparent 68%)",
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
            background: "radial-gradient(circle, var(--color-leaf-600) 0%, transparent 70%)",
            opacity: 0.5,
            filter: "blur(48px)",
          }}
        />

        <div className="relative">
          <BrandLogo theme="dark" titleSize={19} badgeSize={42} iconSize={21} />
        </div>

        <div className="relative flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <p className="eyebrow" style={{ color: "var(--color-gold-300)" }}>
              Become a verified vendor
            </p>
            <h1
              className="font-display text-white"
              style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.12 }}
            >
              Join India&apos;s largest
              <br />
              agri-input network
            </h1>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                color: "color-mix(in oklch, white 82%, transparent)",
              }}
            >
              Register once, get verified, and start supplying quality
              agricultural inputs to farmer clusters across India.
            </p>
          </div>

          <div className="flex flex-col gap-3.5">
            <p className="eyebrow" style={{ color: "color-mix(in oklch, white 60%, transparent)" }}>
              Registration steps
            </p>
            {STEPS.map((step) => (
              <div key={step.number} className="flex items-center gap-3.5">
                <div
                  className="flex items-center justify-center rounded-xl flex-shrink-0 font-display text-white"
                  style={{
                    width: 38,
                    height: 38,
                    backgroundColor: "color-mix(in oklch, white 14%, transparent)",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {step.number}
                </div>
                <div>
                  <p className="font-display text-white" style={{ fontSize: 14.5, fontWeight: 700 }}>
                    {step.label}
                  </p>
                  <p style={{ fontSize: 12.5, color: "color-mix(in oklch, white 60%, transparent)" }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          <ShieldCheck size={15} color="color-mix(in oklch, white 70%, transparent)" />
          <p style={{ fontSize: 12.5, color: "color-mix(in oklch, white 65%, transparent)" }}>
            Government-verified vendors only · AgriStack compliant · NABARD-aligned
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-paper px-6 py-12">
        <div className="w-full" style={{ maxWidth: 460 }}>
          <RegisterWizard />
        </div>
      </div>
    </div>
  );
}
