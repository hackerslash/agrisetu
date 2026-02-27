"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { authApi } from "@repo/api-client";
import { Building2, CreditCard, ArrowRight } from "lucide-react";

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
      await authApi.login(data);
      router.push("/dashboard");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e.response?.data?.error ?? "Login failed. Please try again.");
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <h2
          className="font-bold"
          style={{
            fontFamily: "Plus Jakarta Sans",
            fontSize: 26,
            color: "#2C5F2D",
          }}
        >
          Vendor Portal
        </h2>
        <p style={{ fontSize: 14, color: "#A0A0A0", lineHeight: 1.4 }}>
          Sign in to manage your bids, orders, and payments.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label style={{ fontSize: 13, fontWeight: 600, color: "#2C5F2D" }}>
            Business Email
          </label>
          <input
            {...register("email")}
            type="email"
            placeholder="vendor@agrimart.in"
            className="w-full outline-none"
            style={{
              backgroundColor: "#F7F5F0",
              borderRadius: 12,
              height: 52,
              padding: "0 16px",
              fontSize: 15,
              color: "#2C5F2D",
              border: errors.email
                ? "1.5px solid #EF4444"
                : "1px solid #EDE8DF",
            }}
          />
          {errors.email && (
            <p style={{ fontSize: 12, color: "#EF4444" }}>
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label style={{ fontSize: 13, fontWeight: 600, color: "#2C5F2D" }}>
            Password
          </label>
          <input
            {...register("password")}
            type="password"
            placeholder="••••••••"
            className="w-full outline-none"
            style={{
              backgroundColor: "#F7F5F0",
              borderRadius: 12,
              height: 52,
              padding: "0 16px",
              fontSize: 14,
              color: "#1A1A1A",
              border: errors.password
                ? "1.5px solid #EF4444"
                : "1px solid #EDE8DF",
            }}
          />
          {errors.password && (
            <p style={{ fontSize: 12, color: "#EF4444" }}>
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Remember me + Forgot password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className="flex items-center justify-center rounded"
              style={{
                width: 18,
                height: 18,
                border: "1px solid #D8D8D8",
                backgroundColor: "#FFFFFF",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: "#A0A0A0" }}>Remember me</span>
          </label>
          <a
            href="#"
            style={{ fontSize: 14, color: "#2C5F2D", fontWeight: 600 }}
          >
            Forgot password?
          </a>
        </div>

        {apiError && (
          <div
            className="rounded-xl p-3"
            style={{
              backgroundColor: "#FEF2F2",
              color: "#B03A2E",
              fontSize: 13,
            }}
          >
            {apiError}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 font-bold rounded-xl transition-opacity"
          style={{
            backgroundColor: "#2C5F2D",
            color: "white",
            height: 52,
            fontSize: 15,
            fontFamily: "Plus Jakarta Sans",
            opacity: isSubmitting ? 0.7 : 1,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          {isSubmitting ? (
            "Signing in…"
          ) : (
            <>
              Sign In
              <ArrowRight size={20} />
            </>
          )}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1"
            style={{ height: 1, backgroundColor: "#EDE8DF" }}
          />
          <span style={{ fontSize: 13, color: "#A0A0A0" }}>
            or continue with
          </span>
          <div
            className="flex-1"
            style={{ height: 1, backgroundColor: "#EDE8DF" }}
          />
        </div>

        {/* GSTIN Login + DigiLocker */}
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold"
            style={{
              backgroundColor: "#F7F5F0",
              color: "#2C5F2D",
              height: 48,
              fontSize: 14,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Building2 size={18} color="#2C5F2D" />
            GSTIN Login
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-semibold"
            style={{
              backgroundColor: "#F7F5F0",
              color: "#2C5F2D",
              height: 48,
              fontSize: 14,
              border: "none",
              cursor: "pointer",
            }}
          >
            <CreditCard size={18} color="#2C5F2D" />
            DigiLocker
          </button>
        </div>

        {/* Register link */}
        <div className="flex items-center justify-center gap-1.5">
          <span style={{ fontSize: 14, color: "#A0A0A0" }}>New Vendor?</span>
          <Link
            href="/register"
            className="font-bold"
            style={{
              fontSize: 14,
              color: "#2C5F2D",
              fontFamily: "Plus Jakarta Sans",
            }}
          >
            Register as Vendor
          </Link>
        </div>
      </form>
    </>
  );
}
