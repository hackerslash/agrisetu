import type {
  OrderStatus,
  ClusterStatus,
  GigStatus,
  PaymentStatus,
} from "@repo/api-client";

type Status = OrderStatus | ClusterStatus | GigStatus | PaymentStatus | string;

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  PENDING: { bg: "#FFF3CD", text: "#D97706", label: "Pending" },
  CLUSTERED: { bg: "#E0F2FE", text: "#0369A1", label: "Clustered" },
  PAYMENT_PENDING: { bg: "#FEF9C3", text: "#A16207", label: "Payment Pending" },
  PAID: { bg: "#DBEAFE", text: "#1D4ED8", label: "Order Received" },
  PROCESSING: { bg: "#FEF3C7", text: "#92400E", label: "Processing" },
  OUT_FOR_DELIVERY: {
    bg: "#F3E8FF",
    text: "#7E22CE",
    label: "Dispatched",
  },
  DISPATCHED: { bg: "#F3E8FF", text: "#7E22CE", label: "Dispatched" },
  DELIVERED: { bg: "#D1FAE5", text: "#065F46", label: "Delivered" },
  REJECTED: { bg: "#FEF2F2", text: "#B03A2E", label: "Rejected" },
  FAILED: { bg: "#FEF2F2", text: "#B03A2E", label: "Failed" },
  FORMING: { bg: "#FFF3CD", text: "#D97706", label: "Forming" },
  VOTING: { bg: "#E0F2FE", text: "#0369A1", label: "Voting" },
  PAYMENT: { bg: "#DBEAFE", text: "#1D4ED8", label: "Order Received" },
  COMPLETED: { bg: "#D1FAE5", text: "#065F46", label: "Completed" },
  DRAFT: { bg: "#F3F4F6", text: "#6B7280", label: "Draft" },
  PUBLISHED: { bg: "#D1FAE5", text: "#065F46", label: "Published" },
  CLOSED: { bg: "#FEF2F2", text: "#B03A2E", label: "Closed" },
  SUCCESS: { bg: "#D1FAE5", text: "#065F46", label: "Success" },
  REFUNDED: { bg: "#F3E8FF", text: "#7E22CE", label: "Refunded" },
  released: { bg: "#D1FAE5", text: "#065F46", label: "Released" },
  escrow: { bg: "#FFF3CD", text: "#D97706", label: "In Escrow" },
};

export function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLES[status] ?? {
    bg: "#F3F4F6",
    text: "#6B7280",
    label: status,
  };

  return (
    <span
      className="inline-flex items-center rounded-full font-medium"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        fontSize: 12,
        padding: "3px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {style.label}
    </span>
  );
}
