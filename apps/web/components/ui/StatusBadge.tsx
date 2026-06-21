import type {
  OrderStatus,
  ClusterStatus,
  GigStatus,
  PaymentStatus,
} from "@repo/api-client";

type Status = OrderStatus | ClusterStatus | GigStatus | PaymentStatus | string;

type Tone = "positive" | "progress" | "info" | "negative" | "neutral" | "earth";

/* Tones group statuses by meaning — a calm, limited set of hues with a
   leading dot, never a rainbow of solid pills. */
const TONE_CLASS: Record<Tone, string> = {
  positive: "bg-leaf-50 text-leaf-700",
  progress: "bg-gold-100 text-gold-700",
  info: "bg-info-bg text-info",
  negative: "bg-danger-bg text-danger",
  neutral: "bg-sunk text-ink-soft",
  earth: "bg-clay-50 text-clay-700",
};

const DOT_CLASS: Record<Tone, string> = {
  positive: "bg-leaf-500",
  progress: "bg-gold-500",
  info: "bg-info",
  negative: "bg-danger",
  neutral: "bg-ink-faint",
  earth: "bg-clay-500",
};

const STATUS_MAP: Record<string, { tone: Tone; label: string }> = {
  PENDING: { tone: "progress", label: "Pending" },
  CLUSTERED: { tone: "info", label: "Clustered" },
  PAYMENT_PENDING: { tone: "progress", label: "Payment Pending" },
  PAID: { tone: "info", label: "Order Received" },
  PROCESSING: { tone: "progress", label: "Processing" },
  OUT_FOR_DELIVERY: { tone: "earth", label: "Out for Delivery" },
  DISPATCHED: { tone: "earth", label: "Dispatched" },
  DELIVERED: { tone: "positive", label: "Delivered" },
  REJECTED: { tone: "negative", label: "Rejected" },
  FAILED: { tone: "negative", label: "Failed" },
  FORMING: { tone: "progress", label: "Forming" },
  VOTING: { tone: "info", label: "Voting" },
  PAYMENT: { tone: "info", label: "Order Received" },
  COMPLETED: { tone: "positive", label: "Completed" },
  DRAFT: { tone: "neutral", label: "Draft" },
  PUBLISHED: { tone: "positive", label: "Published" },
  CLOSED: { tone: "negative", label: "Closed" },
  SUCCESS: { tone: "positive", label: "Success" },
  REFUNDED: { tone: "earth", label: "Refunded" },
  refunded: { tone: "earth", label: "Refunded" },
  released: { tone: "positive", label: "Released" },
  escrow: { tone: "progress", label: "In Escrow" },
  // Vendor account statuses (admin)
  PENDING_REVIEW: { tone: "progress", label: "Pending Review" },
  ACTIVE: { tone: "positive", label: "Active" },
  SUSPENDED: { tone: "earth", label: "Suspended" },
};

export function StatusBadge({ status }: { status: Status }) {
  const entry = STATUS_MAP[status] ?? {
    tone: "neutral" as Tone,
    label: String(status).replaceAll("_", " "),
  };

  return (
    <span
      className={`pill ${TONE_CLASS[entry.tone]}`}
      style={{ whiteSpace: "nowrap" }}
    >
      <span
        aria-hidden
        className={`rounded-full ${DOT_CLASS[entry.tone]}`}
        style={{ width: 6, height: 6 }}
      />
      {entry.label}
    </span>
  );
}
