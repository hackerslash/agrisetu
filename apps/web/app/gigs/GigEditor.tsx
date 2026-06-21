"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Info } from "lucide-react";
import { vendorApi } from "@repo/api-client";
import type { Gig } from "@repo/api-client";
import { Button } from "../../components/ui/Button";

const gigSchema = z.object({
  product: z.string().min(1, "Product name is required"),
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
    <div>
      <label className="field-label">
        {label}{" "}
        {required && <span className="text-danger">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="field"
        style={
          error ? { borderColor: "var(--color-danger)" } : undefined
        }
        {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
      />
      {error && (
        <p className="text-danger" style={{ fontSize: 12, marginTop: 6 }}>
          {error}
        </p>
      )}
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
          product: initialData.product,
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="flex gap-6 items-start">
        {/* Left: form */}
        <div className="panel flex-1 flex flex-col gap-6" style={{ padding: 24 }}>
          <div>
            <p className="eyebrow">Listing</p>
            <h3
              className="font-display text-ink"
              style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}
            >
              Gig details
            </h3>
            <p className="text-ink-soft" style={{ fontSize: 13, marginTop: 2 }}>
              Tell farmers what you supply and at what price.
            </p>
          </div>

          {apiError && (
            <div
              className="rounded-xl"
              style={{
                backgroundColor: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                fontSize: 13,
                padding: 12,
              }}
            >
              {apiError}
            </div>
          )}

          <div className="flex gap-4">
            <div className="flex-1">
              <FormInput
                label="Product"
                placeholder="e.g. Wheat, Rice, Urea"
                required
                error={errors.product?.message}
                {...register("product")}
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
            <div className="flex-1">
              <label className="field-label">
                Unit <span className="text-danger">*</span>
              </label>
              <select
                {...register("unit")}
                className="field"
                style={
                  errors.unit
                    ? { borderColor: "var(--color-danger)" }
                    : undefined
                }
              >
                <option value="">Select unit</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p
                  className="text-danger"
                  style={{ fontSize: 12, marginTop: 6 }}
                >
                  {errors.unit.message}
                </p>
              )}
            </div>
            <div className="flex-1">
              <FormInput
                label="Min order quantity"
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
                label="Price per unit (₹)"
                type="number"
                placeholder="250"
                required
                error={errors.pricePerUnit?.message}
                {...register("pricePerUnit")}
              />
            </div>
            <div className="flex-1">
              <FormInput
                label="Available quantity"
                type="number"
                placeholder="5000"
                required
                error={errors.availableQuantity?.message}
                {...register("availableQuantity")}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Description (optional)</label>
            <textarea
              {...register("description")}
              placeholder="Describe your product — quality, certifications, delivery terms…"
              className="field"
              rows={4}
            />
          </div>
        </div>

        {/* Right: publish settings + actions */}
        <div className="flex flex-col gap-4" style={{ width: 300 }}>
          {/* Publish Settings card */}
          <div className="card flex flex-col gap-4" style={{ padding: 20 }}>
            <div>
              <p className="eyebrow">Visibility</p>
              <p
                className="font-display text-ink"
                style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}
              >
                Publish settings
              </p>
            </div>

            {/* Status dropdown */}
            <div>
              <label className="field-label">Status</label>
              <select
                value={publishStatus}
                onChange={(e) =>
                  setPublishStatus(e.target.value as "DRAFT" | "PUBLISHED")
                }
                className="field"
                style={{ cursor: "pointer" }}
              >
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            {/* Auto-sync toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <button
                type="button"
                onClick={() => setAutoSync(!autoSync)}
                role="switch"
                aria-checked={autoSync}
                className="relative rounded-full transition-colors shrink-0"
                style={{
                  width: 44,
                  height: 24,
                  backgroundColor: autoSync
                    ? "var(--color-leaf-600)"
                    : "var(--color-line-strong)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <span
                  className="absolute top-1 rounded-full shadow transition-all"
                  style={{
                    width: 16,
                    height: 16,
                    left: autoSync ? 24 : 4,
                    backgroundColor: "var(--color-surface)",
                  }}
                />
              </button>
              <span
                className="text-ink"
                style={{ fontSize: 13, fontWeight: 500 }}
              >
                Auto-sync mandi price
              </span>
            </label>

            {/* Info box */}
            <div
              className="flex gap-2.5 rounded-xl"
              style={{
                backgroundColor: "var(--color-leaf-50)",
                padding: 12,
              }}
            >
              <Info
                size={15}
                className="text-leaf-700 shrink-0"
                style={{ marginTop: 1 }}
              />
              <p
                className="text-leaf-800"
                style={{ fontSize: 12, lineHeight: 1.5 }}
              >
                Publishing makes this gig visible to farmers&apos; mobile apps in
                your selected regions.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <Button type="submit" variant="primary" size="lg" block disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEditing ? "Save changes" : "Create gig"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            block
            onClick={() => router.push("/gigs")}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
