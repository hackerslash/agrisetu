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

        {/* Right: status + actions */}
        <div className="flex flex-col gap-4" style={{ width: 280 }}>
          {/* Status card */}
          <div
            className="bg-white rounded-2xl flex flex-col gap-4"
            style={{ padding: 20 }}
          >
            <p
              style={{
                fontFamily: "Plus Jakarta Sans",
                fontSize: 15,
                fontWeight: 700,
                color: "#1A1A1A",
              }}
            >
              Status
            </p>
            <div className="flex gap-2">
              {(["DRAFT", "PUBLISHED"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPublishStatus(s)}
                  className="flex-1 rounded-xl font-semibold transition-all"
                  style={{
                    padding: "10px 0",
                    fontSize: 13,
                    backgroundColor:
                      publishStatus === s
                        ? s === "PUBLISHED"
                          ? "#2C5F2D"
                          : "#EDE8DF"
                        : "#F7F5F0",
                    color:
                      publishStatus === s
                        ? s === "PUBLISHED"
                          ? "white"
                          : "#1A1A1A"
                        : "#A0A0A0",
                  }}
                >
                  {s === "PUBLISHED" ? "Published" : "Draft"}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#A0A0A0" }}>
              {publishStatus === "PUBLISHED"
                ? "Farmers can see and join this gig."
                : "Only you can see this gig."}
            </p>
          </div>

          {/* Action buttons */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center rounded-xl font-semibold"
            style={{
              backgroundColor: "#2C5F2D",
              color: "white",
              height: 52,
              fontSize: 15,
              fontFamily: "Plus Jakarta Sans",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting
              ? "Saving…"
              : publishStatus === "PUBLISHED"
                ? "Publish Gig"
                : "Save Draft"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/gigs")}
            className="flex items-center justify-center rounded-xl font-semibold"
            style={{
              backgroundColor: "#F7F5F0",
              color: "#1A1A1A",
              height: 48,
              fontSize: 14,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
