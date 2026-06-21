"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "@repo/api-client";
import { LocateFixed, Upload, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { INDIAN_STATES_AND_UTS } from "../../lib/indiaStates";
import { Button } from "../../components/ui/Button";

// ─── Step 1 Schema ────────────────────────────────────────────────────────────

const step1Schema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Valid phone number required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  state: z.string().optional(),
  businessType: z.string().optional(),
  locationAddress: z.string().optional(),
  latitude: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(-90).max(90).optional(),
  ),
  longitude: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(-180).max(180).optional(),
  ),
  serviceRadiusKm: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().positive("Radius must be > 0").max(500).optional(),
  ),
});
type Step1Data = z.infer<typeof step1Schema>;
type Step1FormInput = z.input<typeof step1Schema>;
type ReverseGeocodeResult = {
  display_name?: string;
  address?: {
    state?: string;
  };
};

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

type Step3Data = {
  panFile?: FileList;
  gstFile?: FileList;
  qualityFile?: FileList;
};

// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEP_LABELS = ["Business", "GSTIN", "Documents"];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <span
              className={
                done || active
                  ? "flex items-center justify-center rounded-full bg-leaf-600 text-white tnum"
                  : "flex items-center justify-center rounded-full bg-sunk text-ink-faint tnum"
              }
              style={{ width: 26, height: 26, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}
            >
              {done ? <CheckCircle2 size={15} /> : n}
            </span>
            <span
              className={active ? "text-ink font-semibold" : "text-ink-faint"}
              style={{ fontSize: 12.5 }}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <span
                className="flex-1 rounded-full"
                style={{
                  height: 2,
                  minWidth: 12,
                  backgroundColor: done ? "var(--color-leaf-400)" : "var(--color-line)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

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
      <label className="field-label" style={{ marginBottom: 0 }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="field"
        style={error ? { borderColor: "var(--color-danger)" } : undefined}
        {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      {error && (
        <p className="text-danger" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function FormFileInput({
  label,
  error,
  selectedFileName,
  name,
  ...inputProps
}: {
  label: string;
  error?: string;
  selectedFileName?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const inputName = String(name ?? label).replace(/\s+/g, "-");
  const inputId = `upload-${inputName.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="field-label" style={{ marginBottom: 0 }}>
        {label}
      </label>
      <div
        className="flex items-center gap-3 bg-surface"
        style={{
          borderRadius: 12,
          border: error ? "1px solid var(--color-danger)" : "1px solid var(--color-line-strong)",
          minHeight: 56,
          padding: "10px 12px",
        }}
      >
        <input id={inputId} type="file" className="sr-only" name={name} {...inputProps} />
        <label
          htmlFor={inputId}
          className="btn btn-ghost btn-sm shrink-0 cursor-pointer"
        >
          <Upload size={14} />
          Choose file
        </label>
        <span
          className={selectedFileName ? "text-ink truncate" : "text-ink-faint truncate"}
          style={{ fontSize: 13 }}
        >
          {selectedFileName ?? "No file chosen"}
        </span>
      </div>
      {error && (
        <p className="text-danger" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [apiError, setApiError] = useState("");
  const [locating, setLocating] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState("");

  const form1 = useForm<Step1FormInput, unknown, Step1Data>({
    resolver: zodResolver(step1Schema),
  });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Data>();
  const panFileName = form3.watch("panFile")?.[0]?.name;
  const gstFileName = form3.watch("gstFile")?.[0]?.name;
  const qualityFileName = form3.watch("qualityFile")?.[0]?.name;

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

  async function setCurrentLocationForStep1() {
    if (!navigator.geolocation) {
      setApiError("Browser geolocation is not available");
      return;
    }
    setApiError("");
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      form1.setValue("latitude", latitude);
      form1.setValue("longitude", longitude);

      let resolvedAddress: string | undefined;
      try {
        const reverseGeocode = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2`,
        );
        if (reverseGeocode.ok) {
          const data = (await reverseGeocode.json()) as ReverseGeocodeResult;
          if (data.display_name?.trim()) {
            resolvedAddress = data.display_name.trim();
          }
          if (!form1.getValues("state")?.trim() && data.address?.state) {
            form1.setValue("state", data.address.state.trim());
          }
        }
      } catch {
        // Coordinates remain captured even if reverse geocoding fails.
      }

      if (resolvedAddress) {
        form1.setValue("locationAddress", resolvedAddress);
      } else if (!form1.getValues("locationAddress")?.trim()) {
        setApiError(
          "Location captured, but address could not be resolved. Please enter address manually.",
        );
      }
    } catch {
      setApiError("Unable to fetch your location. Please allow location permission.");
    } finally {
      setLocating(false);
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
    form3.clearErrors();

    let hasErrors = false;
    if (!data.panFile || data.panFile.length === 0) {
      form3.setError("panFile", { message: "PAN document is required" });
      hasErrors = true;
    }
    if (!data.gstFile || data.gstFile.length === 0) {
      form3.setError("gstFile", { message: "GST document is required" });
      hasErrors = true;
    }
    if (hasErrors) return;

    try {
      await authApi.uploadRegistrationDocument("PAN", data.panFile![0]!);
      await authApi.uploadRegistrationDocument("GST", data.gstFile![0]!);

      if (data.qualityFile && data.qualityFile.length > 0) {
        await authApi.uploadRegistrationDocument("QUALITY_CERT", data.qualityFile[0]!);
      }

      const result = await authApi.registerStep3({ documents: [] });
      setSubmittedMessage(result.message);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e.response?.data?.error ?? "Upload failed");
    }
  }

  const HEADERS = [
    { title: "Business details", sub: "Tell us about your business" },
    { title: "GSTIN verification", sub: "Verify your tax registration" },
    { title: "Upload documents", sub: "Certifications & identity proof" },
  ];
  const header = HEADERS[step - 1]!;

  const selectStyle: React.CSSProperties = {};

  if (submittedMessage) {
    return (
      <div className="panel flex flex-col gap-6" style={{ padding: 40 }}>
        <div
          className="flex items-center justify-center rounded-2xl bg-leaf-100 text-leaf-700"
          style={{ width: 56, height: 56 }}
        >
          <CheckCircle2 size={28} />
        </div>
        <div className="flex flex-col gap-2.5">
          <h2 className="font-display text-ink" style={{ fontSize: 24, fontWeight: 800 }}>
            Registration submitted
          </h2>
          <p className="text-ink-soft" style={{ fontSize: 15, lineHeight: 1.6 }}>
            {submittedMessage}
          </p>
          <p className="text-ink-faint" style={{ fontSize: 13, lineHeight: 1.6 }}>
            We&apos;ll review your details and let you know. You can sign in once your
            account is approved.
          </p>
        </div>
        <Button onClick={() => router.push("/login")} size="lg" block>
          Back to login
        </Button>
      </div>
    );
  }

  return (
    <div className="panel flex flex-col gap-6" style={{ padding: 36 }}>
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-ink" style={{ fontSize: 23, fontWeight: 800 }}>
            {header.title}
          </h2>
          <span className="text-ink-faint tnum" style={{ fontSize: 13 }}>
            Step {step} of 3
          </span>
        </div>
        <p className="text-ink-soft" style={{ fontSize: 14 }}>
          {header.sub}
        </p>
        <div style={{ marginTop: 4 }}>
          <Stepper step={step} />
        </div>
      </div>

      {apiError && (
        <div
          className="rounded-xl bg-danger-bg text-danger"
          style={{ padding: 12, fontSize: 13, lineHeight: 1.5 }}
        >
          {apiError}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <form onSubmit={form1.handleSubmit(onStep1)} className="flex flex-col gap-4">
          <FormInput
            label="Business name"
            placeholder="AgriSupply Co."
            error={form1.formState.errors.businessName?.message}
            {...form1.register("businessName")}
          />
          <FormInput
            label="Contact person name"
            placeholder="Rajan Sharma"
            error={form1.formState.errors.contactName?.message}
            {...form1.register("contactName")}
          />
          <FormInput
            label="Email address"
            type="email"
            placeholder="vendor@business.com"
            error={form1.formState.errors.email?.message}
            {...form1.register("email")}
          />
          <FormInput
            label="Phone number"
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
              <label className="field-label" style={{ marginBottom: 0 }}>
                State
              </label>
              <select {...form1.register("state")} className="field" style={selectStyle}>
                <option value="">Select state</option>
                {INDIAN_STATES_AND_UTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>
                Business type
              </label>
              <select {...form1.register("businessType")} className="field" style={selectStyle}>
                <option value="">Select type</option>
                <option value="MANUFACTURER">Manufacturer</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="RETAILER">Retailer</option>
                <option value="WHOLESALER">Wholesaler</option>
              </select>
            </div>
          </div>
          <FormInput
            label="Business location address"
            placeholder="Street, Village/Town, District"
            error={form1.formState.errors.locationAddress?.message}
            {...form1.register("locationAddress")}
          />
          <input type="hidden" {...form1.register("latitude")} />
          <input type="hidden" {...form1.register("longitude")} />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <FormInput
                label="Service radius (km)"
                type="number"
                placeholder="25"
                step="1"
                error={form1.formState.errors.serviceRadiusKm?.message}
                {...form1.register("serviceRadiusKm")}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={setCurrentLocationForStep1}
              style={{ height: "2.75rem" }}
            >
              <LocateFixed size={16} />
              {locating ? "Fetching…" : "Use location"}
            </Button>
          </div>
          <Button type="submit" disabled={form1.formState.isSubmitting} size="lg" block>
            {form1.formState.isSubmitting ? "Saving…" : "Continue"}
            {!form1.formState.isSubmitting && <ArrowRight size={16} />}
          </Button>
          <p className="text-center text-ink-faint" style={{ fontSize: 13 }}>
            Already registered?{" "}
            <a href="/login" className="text-leaf-700" style={{ fontWeight: 600 }}>
              Sign in
            </a>
          </p>
        </form>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <form onSubmit={form2.handleSubmit(onStep2)} className="flex flex-col gap-4">
          <div className="inset" style={{ padding: 14 }}>
            <p className="text-ink-soft" style={{ fontSize: 13 }}>
              GSTIN format: <span className="tnum text-ink">27AAAPZ9999Z1Z5</span> (15 characters)
            </p>
          </div>
          <FormInput
            label="GSTIN number"
            placeholder="Enter GSTIN"
            error={form2.formState.errors.gstin?.message}
            {...form2.register("gstin")}
            autoComplete="off"
            maxLength={15}
          />
          <FormInput
            label="PAN number (optional)"
            placeholder="Enter PAN"
            error={form2.formState.errors.pan?.message}
            {...form2.register("pan")}
          />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" size="lg" onClick={() => setStep(1)}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button
              type="submit"
              disabled={form2.formState.isSubmitting}
              size="lg"
              className="flex-1"
            >
              {form2.formState.isSubmitting ? "Verifying…" : "Verify GSTIN"}
              {!form2.formState.isSubmitting && <ArrowRight size={16} />}
            </Button>
          </div>
        </form>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <form onSubmit={form3.handleSubmit(onStep3)} className="flex flex-col gap-4">
          <p className="text-ink-soft" style={{ fontSize: 13 }}>
            Upload your verification files (PDF / JPG / PNG / WEBP).
          </p>
          <FormFileInput
            label="PAN card document"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            error={form3.formState.errors.panFile?.message}
            selectedFileName={panFileName}
            {...form3.register("panFile")}
          />
          <FormFileInput
            label="GST certificate"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            error={form3.formState.errors.gstFile?.message}
            selectedFileName={gstFileName}
            {...form3.register("gstFile")}
          />
          <FormFileInput
            label="Quality certificate (optional)"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            error={form3.formState.errors.qualityFile?.message}
            selectedFileName={qualityFileName}
            {...form3.register("qualityFile")}
          />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" size="lg" onClick={() => setStep(2)}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button
              type="submit"
              disabled={form3.formState.isSubmitting}
              size="lg"
              className="flex-1"
            >
              {form3.formState.isSubmitting ? "Submitting…" : "Complete registration"}
              {!form3.formState.isSubmitting && <ArrowRight size={16} />}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
