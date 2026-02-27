"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { authApi } from "@repo/api-client";

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
            fontSize: 24,
            color: "#1A1A1A",
          }}
        >
          Welcome back
        </h2>
        <p style={{ fontSize: 14, color: "#A0A0A0" }}>
          Sign in to your vendor account
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>
            Email address
          </label>
          <input
            {...register("email")}
            type="email"
            placeholder="you@business.com"
            className="w-full outline-none"
            style={{
              backgroundColor: "#EDE8DF",
              borderRadius: 14,
              height: 52,
              padding: "0 16px",
              fontSize: 14,
              color: "#1A1A1A",
              border: errors.email
                ? "1.5px solid #EF4444"
                : "1.5px solid transparent",
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
          <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>
            Password
          </label>
          <input
            {...register("password")}
            type="password"
            placeholder="••••••••"
            className="w-full outline-none"
            style={{
              backgroundColor: "#EDE8DF",
              borderRadius: 14,
              height: 52,
              padding: "0 16px",
              fontSize: 14,
              color: "#1A1A1A",
              border: errors.password
                ? "1.5px solid #EF4444"
                : "1.5px solid transparent",
            }}
          />
          {errors.password && (
            <p style={{ fontSize: 12, color: "#EF4444" }}>
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Forgot password */}
        <div className="flex justify-end">
          <a style={{ fontSize: 13, color: "#2C5F2D", fontWeight: 500 }}>
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
          className="flex items-center justify-center font-semibold rounded-xl transition-opacity"
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
          {isSubmitting ? "Signing in…" : "Sign In"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1"
            style={{ height: 1, backgroundColor: "#EDE8DF" }}
          />
          <span style={{ fontSize: 13, color: "#A0A0A0" }}>or</span>
          <div
            className="flex-1"
            style={{ height: 1, backgroundColor: "#EDE8DF" }}
          />
        </div>

        {/* Register link */}
        <div className="flex items-center justify-center gap-1.5">
          <span style={{ fontSize: 14, color: "#A0A0A0" }}>
            Don&apos;t have an account?
          </span>
          <Link
            href="/register"
            className="font-semibold"
            style={{ fontSize: 14, color: "#2C5F2D" }}
          >
            Register as vendor
          </Link>
        </div>
      </form>
    </>
  );
}
