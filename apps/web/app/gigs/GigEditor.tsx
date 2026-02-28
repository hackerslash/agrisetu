"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { vendorApi } from "@repo/api-client";
import type { Gig } from "@repo/api-client";

const gigSchema = z.object({
  cropName: z.string().min(1, "Crop name is required"),
  variety: z.string().optional(),
  unit: z.string().min(1, "Unit is required"),
  minQuantity: z.coerce.number().positive("Must be positive"),
  pricePerUnit: z.coerce.number().positive("Must be positive"),
  availableQuantity: z.coerce.number().positive("Must be positive"),
  description: z.string().optional(),
});

type GigFormData = z.infer<typeof gigSchema>;

interface GigEditorProps {
  initialData?: Gig;
}

function FormInput({
  label,
  error,
  required,
  type = "text",
  placeholder,
  ...props
}: {
  label: string;
  error?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  [key: string]: unknown;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>
        {label} {required && <span style={{ color: "#EF4444" }}>*</span>}
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

export function GigEditor({ initialData }: GigEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEditing = !!initialData;
  const [publishStatus, setPublishStatus] = useState<"DRAFT" | "PUBLISHED">(
    initialData?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
  );
  const [autoSync, setAutoSync] = useState(false);
  const [apiError, setApiError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GigFormData>({
    resolver: zodResolver(gigSchema),
    defaultValues: initialData
      ? {
          cropName: initialData.cropName,
          variety: initialData.variety ?? "",
          unit: initialData.unit,
          minQuantity: initialData.minQuantity,
          pricePerUnit: initialData.pricePerUnit,
          availableQuantity: initialData.availableQuantity,
          description: initialData.description ?? "",
        }
      : undefined,
  });

  const createMutation = useMutation({
    mutationFn: (data: GigFormData & { status: "DRAFT" | "PUBLISHED" }) =>
      vendorApi.createGig(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gigs"] });
      router.push("/gigs");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Gig>) =>
      vendorApi.updateGig(initialData!.id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gigs"] });
      router.push("/gigs");
    },
  });

  async function onSubmit(data: GigFormData) {
    setApiError("");
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ ...data, status: publishStatus });
      } else {
        await createMutation.mutateAsync({ ...data, status: publishStatus });
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e.response?.data?.error ?? "Failed to save gig");
    }
  }

  const UNITS = ["kg", "quintal", "ton", "litre", "packet", "bag", "bundle"];

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex gap-6">
        {/* Left: form */}
        <div
          className="flex-1 bg-white rounded-2xl flex flex-col gap-5"
          style={{ padding: 24 }}
        >
          <h3
            style={{
              fontFamily: "Plus Jakarta Sans",
              fontSize: 16,
              fontWeight: 700,
              color: "#1A1A1A",
            }}
          >
            Gig Details
          </h3>

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

          <div className="flex gap-4">
            <div className="flex-1">
              <FormInput
                label="Crop Name"
                placeholder="e.g. Wheat, Rice, Urea"
                required
                error={errors.cropName?.message}
                {...register("cropName")}
              />
            </div>
            <div className="flex-1">
              <FormInput
                label="Variety (optional)"
                placeholder="e.g. Sharbati, Basmati"
                {...register("variety")}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
              >
                Unit <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <select
                {...register("unit")}
                className="w-full outline-none"
                style={{
                  backgroundColor: "#EDE8DF",
                  borderRadius: 14,
                  height: 52,
                  padding: "0 16px",
                  fontSize: 14,
                  color: "#1A1A1A",
                  border: errors.unit
                    ? "1.5px solid #EF4444"
                    : "1.5px solid transparent",
                }}
              >
                <option value="">Select unit</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p style={{ fontSize: 12, color: "#EF4444" }}>
                  {errors.unit.message}
                </p>
              )}
            </div>
            <div className="flex-1">
              <FormInput
                label="Min Quantity"
                type="number"
                placeholder="100"
                required
                error={errors.minQuantity?.message}
                {...register("minQuantity")}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <FormInput
                label="Price per Unit (₹)"
                type="number"
                placeholder="250"
                required
                error={errors.pricePerUnit?.message}
                {...register("pricePerUnit")}
              />
            </div>
            <div className="flex-1">
              <FormInput
                label="Available Quantity"
                type="number"
                placeholder="5000"
                required
                error={errors.availableQuantity?.message}
                {...register("availableQuantity")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>
              Description (optional)
            </label>
            <textarea
              {...register("description")}
              placeholder="Describe your product — quality, certifications, delivery terms…"
              className="w-full outline-none resize-none"
              rows={4}
              style={{
                backgroundColor: "#EDE8DF",
                borderRadius: 14,
                padding: "14px 16px",
                fontSize: 14,
                color: "#1A1A1A",
                border: "1.5px solid transparent",
              }}
            />
          </div>
        </div>

        {/* Right: publish settings + actions */}
        <div className="flex flex-col gap-4" style={{ width: 280 }}>
          {/* Publish Settings card */}
          <div
            className="bg-white rounded-2xl flex flex-col gap-4"
            style={{ padding: 20 }}
          >
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 14,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Publish Settings
            </p>

            {/* Status dropdown */}
            <div className="flex flex-col gap-1.5">
              <label
                style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}
              >
                Status
              </label>
              <div className="relative">
                <select
                  value={publishStatus}
                  onChange={(e) =>
                    setPublishStatus(e.target.value as "DRAFT" | "PUBLISHED")
                  }
                  className="w-full outline-none appearance-none"
                  style={{
                    backgroundColor: "#F7F5F0",
                    borderRadius: 10,
                    height: 40,
                    padding: "0 36px 0 14px",
                    fontSize: 14,
                    color: "#1A1A1A",
                    border: "1.5px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                </select>
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ fontSize: 10, color: "#A0A0A0" }}
                >
                  ▼
                </span>
              </div>
            </div>

            {/* Auto-sync toggle */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setAutoSync(!autoSync)}
                className="relative rounded-full transition-colors shrink-0"
                style={{
                  width: 44,
                  height: 24,
                  backgroundColor: autoSync ? "#2C5F2D" : "#EDE8DF",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <span
                  className="absolute top-1 rounded-full bg-white shadow transition-all"
                  style={{
                    width: 16,
                    height: 16,
                    left: autoSync ? 24 : 4,
                  }}
                />
              </button>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>
                Auto-sync mandi price
              </span>
            </div>

            {/* Info box */}
            <div
              className="flex gap-2 rounded-xl"
              style={{ backgroundColor: "#E8F5E9", padding: 12 }}
            >
              <span style={{ fontSize: 12, color: "#2C5F2D", flexShrink: 0 }}>
                ⓘ
              </span>
              <p style={{ fontSize: 12, color: "#2C5F2D", lineHeight: 1.5 }}>
                Publish makes this gig visible to farmers&apos; mobile apps in
                your selected regions.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center rounded-xl font-bold"
            style={{
              backgroundColor: "#2C5F2D",
              color: "white",
              height: 48,
              fontSize: 15,
              fontFamily: "Plus Jakarta Sans",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? "Saving…" : "Save Status"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/gigs")}
            className="flex items-center justify-center rounded-xl font-semibold"
            style={{
              backgroundColor: "#FEF2F2",
              color: "#DC2626",
              height: 44,
              fontSize: 14,
              fontFamily: "Plus Jakarta Sans",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
