"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "@repo/api-client";

// ─── Step 1 Schema ────────────────────────────────────────────────────────────

const step1Schema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Valid phone number required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  state: z.string().optional(),
  businessType: z.string().optional(),
});
type Step1Data = z.infer<typeof step1Schema>;

// ─── Step 2 Schema ────────────────────────────────────────────────────────────

const step2Schema = z.object({
  gstin: z
    .string()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
      "Invalid GSTIN format (e.g. 27AAAPZ9999Z1Z5)",
    ),
  pan: z.string().optional(),
});
type Step2Data = z.infer<typeof step2Schema>;

// ─── Step 3 Schema ────────────────────────────────────────────────────────────

const step3Schema = z.object({
  panUrl: z.string().min(1, "PAN document is required"),
  gstUrl: z.string().min(1, "GST document is required"),
  qualityUrl: z.string().optional(),
});
type Step3Data = z.infer<typeof step3Schema>;

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div
      className="relative rounded-full overflow-hidden"
      style={{ height: 4, backgroundColor: "#EDE8DF" }}
    >
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all"
        style={{
          width: `${(step / 3) * 100}%`,
          backgroundColor: "#2C5F2D",
        }}
      />
    </div>
  );
}

// ─── Input Component ──────────────────────────────────────────────────────────

function FormInput({
  label,
  error,
  type = "text",
  placeholder,
  ...props
}: {
  label: string;
  error?: string;
  type?: string;
  placeholder?: string;
  [key: string]: unknown;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full outline-none"
        style={{
          backgroundColor: "#EDE8DF",
          borderRadius: 14,
          height: 52,
          padding: "0 16px",
          fontSize: 14,
          color: "#1A1A1A",
          border: error ? "1.5px solid #EF4444" : "1.5px solid transparent",
        }}
        {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      {error && <p style={{ fontSize: 12, color: "#EF4444" }}>{error}</p>}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [apiError, setApiError] = useState("");

  // Step 1 form
  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>({ resolver: zodResolver(step3Schema) });

  async function onStep1(data: Step1Data) {
    setApiError("");
    try {
      await authApi.registerStep1(data);
      setStep(2);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e.response?.data?.error ?? "Registration failed");
    }
  }

  async function onStep2(data: Step2Data) {
    setApiError("");
    try {
      await authApi.registerStep2(data);
      setStep(3);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e.response?.data?.error ?? "Verification failed");
    }
  }

  async function onStep3(data: Step3Data) {
    setApiError("");
    try {
      const docs = [
        { docType: "PAN" as const, fileUrl: data.panUrl },
        { docType: "GST" as const, fileUrl: data.gstUrl },
        ...(data.qualityUrl
          ? [{ docType: "QUALITY_CERT" as const, fileUrl: data.qualityUrl }]
          : []),
      ];
      await authApi.registerStep3({ documents: docs });
      router.push("/dashboard");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e.response?.data?.error ?? "Upload failed");
    }
  }

  const HEADERS = [
    { title: "Business Details", sub: "Tell us about your business" },
    { title: "GSTIN Verification", sub: "Verify your tax registration" },
    { title: "Upload Documents", sub: "Certifications & identity proof" },
  ];
  const header = HEADERS[step - 1]!;

  return (
    <div
      className="flex flex-col gap-6 rounded-2xl bg-white"
      style={{ padding: 40 }}
    >
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h2
            className="font-bold"
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 22,
              color: "#1A1A1A",
            }}
          >
            {header.title}
          </h2>
          <span style={{ fontSize: 13, color: "#A0A0A0" }}>
            Step {step} of 3
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>{header.sub}</p>
      </div>

      {/* Progress */}
      <ProgressBar step={step} />

      {apiError && (
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: "#FEF2F2", color: "#B03A2E", fontSize: 13 }}
        >
          {apiError}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <form
          onSubmit={form1.handleSubmit(onStep1)}
          className="flex flex-col gap-4"
        >
          <FormInput
            label="Business Name"
            placeholder="AgriSupply Co."
            error={form1.formState.errors.businessName?.message}
            {...form1.register("businessName")}
          />
          <FormInput
            label="Contact Person Name"
            placeholder="Rajan Sharma"
            error={form1.formState.errors.contactName?.message}
            {...form1.register("contactName")}
          />
          <FormInput
            label="Email Address"
            type="email"
            placeholder="vendor@business.com"
            error={form1.formState.errors.email?.message}
            {...form1.register("email")}
          />
          <FormInput
            label="Phone Number"
            placeholder="+91 98765 43210"
            error={form1.formState.errors.phone?.message}
            {...form1.register("phone")}
          />
          <FormInput
            label="Password"
            type="password"
            placeholder="Min. 8 characters"
            error={form1.formState.errors.password?.message}
            {...form1.register("password")}
          />
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                State
              </label>
              <select
                {...form1.register("state")}
                className="w-full outline-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 14,
                  height: 52,
                  padding: "0 16px",
                  fontSize: 14,
                  color: "#1A1A1A",
                  border: "1.5px solid transparent",
                }}
              >
                <option value="">Select state</option>
                {[
                  "Maharashtra",
                  "Karnataka",
                  "Uttar Pradesh",
                  "Punjab",
                  "Gujarat",
                  "Rajasthan",
                  "Madhya Pradesh",
                  "Tamil Nadu",
                  "Andhra Pradesh",
                  "Telangana",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Business Type
              </label>
              <select
                {...form1.register("businessType")}
                className="w-full outline-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 14,
                  height: 52,
                  padding: "0 16px",
                  fontSize: 14,
                  color: "#1A1A1A",
                  border: "1.5px solid transparent",
                }}
              >
                <option value="">Select type</option>
                <option value="MANUFACTURER">Manufacturer</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="RETAILER">Retailer</option>
                <option value="WHOLESALER">Wholesaler</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={form1.formState.isSubmitting}
            className="flex items-center justify-center font-semibold rounded-xl"
            style={{
              backgroundColor: "#2C5F2D",
              color: "white",
              height: 52,
              fontSize: 15,
              fontFamily: "Plus Jakarta Sans",
              opacity: form1.formState.isSubmitting ? 0.7 : 1,
              cursor: form1.formState.isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {form1.formState.isSubmitting ? "Saving…" : "Continue →"}
          </button>
          <p className="text-center" style={{ fontSize: 13, color: "#A0A0A0" }}>
            Already registered?{" "}
            <a href="/login" style={{ color: "#2C5F2D", fontWeight: 500 }}>
              Sign in
            </a>
          </p>
        </form>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <form
          onSubmit={form2.handleSubmit(onStep2)}
          className="flex flex-col gap-4"
        >
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: "#F7F5F0" }}
          >
            <p style={{ fontSize: 13, color: "#A0A0A0" }}>
              GSTIN format: 27AAAPZ9999Z1Z5 (15 characters)
            </p>
          </div>
          <FormInput
            label="GSTIN Number"
            placeholder="27AAAPZ9999Z1Z5"
            error={form2.formState.errors.gstin?.message}
            {...form2.register("gstin")}
            style={{ textTransform: "uppercase" }}
          />
          <FormInput
            label="PAN Number (optional)"
            placeholder="AAAPZ9999Z"
            error={form2.formState.errors.pan?.message}
            {...form2.register("pan")}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 flex items-center justify-center font-semibold rounded-xl"
              style={{
                backgroundColor: "#F7F5F0",
                color: "#1A1A1A",
                height: 52,
                fontSize: 15,
              }}
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={form2.formState.isSubmitting}
              className="flex-[2] flex items-center justify-center font-semibold rounded-xl"
              style={{
                backgroundColor: "#2C5F2D",
                color: "white",
                height: 52,
                fontSize: 15,
                fontFamily: "Plus Jakarta Sans",
                opacity: form2.formState.isSubmitting ? 0.7 : 1,
              }}
            >
              {form2.formState.isSubmitting ? "Verifying…" : "Verify GSTIN →"}
            </button>
          </div>
        </form>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <form
          onSubmit={form3.handleSubmit(onStep3)}
          className="flex flex-col gap-4"
        >
          <p style={{ fontSize: 13, color: "#A0A0A0" }}>
            Upload document URLs or base64 strings for verification.
          </p>
          <FormInput
            label="PAN Document (URL or base64)"
            placeholder="https://... or data:image/..."
            error={form3.formState.errors.panUrl?.message}
            {...form3.register("panUrl")}
          />
          <FormInput
            label="GST Certificate (URL or base64)"
            placeholder="https://... or data:image/..."
            error={form3.formState.errors.gstUrl?.message}
            {...form3.register("gstUrl")}
          />
          <FormInput
            label="Quality Certificate (optional)"
            placeholder="https://... or data:image/..."
            error={form3.formState.errors.qualityUrl?.message}
            {...form3.register("qualityUrl")}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 flex items-center justify-center font-semibold rounded-xl"
              style={{
                backgroundColor: "#F7F5F0",
                color: "#1A1A1A",
                height: 52,
                fontSize: 15,
              }}
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={form3.formState.isSubmitting}
              className="flex-[2] flex items-center justify-center font-semibold rounded-xl"
              style={{
                backgroundColor: "#2C5F2D",
                color: "white",
                height: 52,
                fontSize: 15,
                fontFamily: "Plus Jakarta Sans",
                opacity: form3.formState.isSubmitting ? 0.7 : 1,
              }}
            >
              {form3.formState.isSubmitting
                ? "Submitting…"
                : "Complete Registration →"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
