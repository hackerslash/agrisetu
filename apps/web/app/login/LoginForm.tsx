"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { authApi } from "@repo/api-client";
import { Building2, CreditCard, ArrowRight, AlertCircle } from "lucide-react";
import { getPortalHomePath } from "../../lib/portal";
import { Button } from "../../components/ui/Button";
import { BrandLogo } from "../../components/ui/BrandLogo";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [apiError, setApiError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginFormData) {
    setApiError("");
    try {
      const response = await authApi.login(data);
      router.push(getPortalHomePath(response.vendor));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e.response?.data?.error ?? "Login failed. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-7 rise">
      {/* Logo — only shown on small screens where the brand panel is hidden */}
      <div className="lg:hidden">
        <BrandLogo theme="light" titleSize={18} badgeSize={40} iconSize={20} />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <p className="eyebrow">Vendor Portal</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: 28, fontWeight: 800 }}
        >
          Welcome back
        </h1>
        <p className="text-ink-soft" style={{ fontSize: 14.5, lineHeight: 1.5 }}>
          Sign in to manage your gigs, orders and payouts.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="field-label">
            Business email
          </label>
          <input
            id="login-email"
            {...register("email")}
            type="email"
            placeholder="vendor@agrimart.in"
            className="field"
            aria-invalid={errors.email ? "true" : "false"}
            style={errors.email ? { borderColor: "var(--color-danger)" } : undefined}
          />
          {errors.email && (
            <p className="text-danger" style={{ fontSize: 12.5, marginTop: 6 }}>
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
            <label htmlFor="login-password" className="field-label" style={{ marginBottom: 0 }}>
              Password
            </label>
            <a
              href="#"
              className="text-leaf-700"
              style={{ fontSize: 12.5, fontWeight: 600 }}
            >
              Forgot password?
            </a>
          </div>
          <input
            id="login-password"
            {...register("password")}
            type="password"
            placeholder="••••••••"
            className="field"
            style={{
              marginTop: 6,
              ...(errors.password ? { borderColor: "var(--color-danger)" } : {}),
            }}
            aria-invalid={errors.password ? "true" : "false"}
          />
          {errors.password && (
            <p className="text-danger" style={{ fontSize: 12.5, marginTop: 6 }}>
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Remember me */}
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="rounded"
            style={{ width: 16, height: 16, accentColor: "var(--color-leaf-600)" }}
          />
          <span className="text-ink-soft" style={{ fontSize: 13.5 }}>
            Keep me signed in
          </span>
        </label>

        {apiError && (
          <div
            className="flex items-start gap-2.5 rounded-xl"
            style={{
              backgroundColor: "var(--color-danger-bg)",
              color: "var(--color-danger)",
              fontSize: 13,
              padding: "12px 14px",
            }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{apiError}</span>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" size="lg" block disabled={isSubmitting}>
          {isSubmitting ? (
            "Signing in…"
          ) : (
            <>
              Sign in
              <ArrowRight size={18} />
            </>
          )}
        </Button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: "var(--color-line)" }} />
          <span className="text-ink-faint" style={{ fontSize: 12.5 }}>
            or continue with
          </span>
          <div className="h-px flex-1" style={{ backgroundColor: "var(--color-line)" }} />
        </div>

        {/* GSTIN Login + DigiLocker */}
        <div className="flex gap-3">
          <Button type="button" variant="ghost" block>
            <Building2 size={17} />
            GSTIN Login
          </Button>
          <Button type="button" variant="ghost" block>
            <CreditCard size={17} />
            DigiLocker
          </Button>
        </div>

        {/* Register link */}
        <p className="text-center text-ink-soft" style={{ fontSize: 14 }}>
          New vendor?{" "}
          <Link href="/register" className="font-semibold text-leaf-700">
            Register as a vendor
          </Link>
        </p>
      </form>
    </div>
  );
}
