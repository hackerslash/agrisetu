// ─── Enums ────────────────────────────────────────────────────────────────────

export type DocType = "PAN" | "GST" | "QUALITY_CERT";
export type GigStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type OrderStatus =
  | "PENDING"
  | "CLUSTERED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "PROCESSING"
  | "OUT_FOR_DELIVERY"
  | "DISPATCHED"
  | "DELIVERED"
  | "REJECTED"
  | "FAILED";
export type ClusterStatus =
  | "FORMING"
  | "VOTING"
  | "PAYMENT"
  | "PROCESSING"
  | "OUT_FOR_DELIVERY"
  | "DISPATCHED"
  | "COMPLETED"
  | "FAILED";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

// ─── Models ───────────────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  email: string;
  businessName: string;
  contactName: string;
  phone: string;
  gstin?: string | null;
  pan?: string | null;
  state?: string | null;
  businessType?: string | null;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  serviceRadiusKm?: number | null;
  isVerified: boolean;
  createdAt: string;
  documents?: VendorDocument[];
}

export interface VendorDocument {
  id: string;
  vendorId: string;
  docType: DocType;
  fileUrl: string;
  uploadedAt: string;
}

export interface Farmer {
  id: string;
  phone: string;
  name?: string | null;
  village?: string | null;
  district?: string | null;
  state?: string | null;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  landArea?: number | null;
  cropsGrown: string[];
  upiId?: string | null;
  language: string;
  aadhaarLinked: boolean;
  createdAt: string;
}

export interface Gig {
  id: string;
  vendorId: string;
  cropName: string;
  variety?: string | null;
  unit: string;
  minQuantity: number;
  pricePerUnit: number;
  availableQuantity: number;
  description?: string | null;
  status: GigStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { bids: number };
}

export interface Order {
  id: string;
  farmerId: string;
  cropName: string;
  quantity: number;
  unit: string;
  deliveryDate?: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  farmer?: Farmer;
  clusterMember?: ClusterMember;
}

export interface Cluster {
  id: string;
  cropName: string;
  unit: string;
  targetQuantity: number;
  currentQuantity: number;
  status: ClusterStatus;
  district?: string | null;
  state?: string | null;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  vendorId?: string | null;
  gigId?: string | null;
  createdAt: string;
  updatedAt: string;
  members?: ClusterMember[];
  bids?: VendorBid[];
  delivery?: Delivery | null;
  payments?: Payment[];
  ratings?: Rating[];
}

export interface ClusterMember {
  id: string;
  clusterId: string;
  farmerId: string;
  orderId: string;
  quantity: number;
  hasPaid: boolean;
  paidAt?: string | null;
  farmer?: Farmer;
  order?: Order;
}

export interface VendorBid {
  id: string;
  clusterId: string;
  vendorId: string;
  gigId?: string | null;
  pricePerUnit: number;
  totalPrice: number;
  note?: string | null;
  votes: number;
  createdAt: string;
  vendor?: Vendor;
  gig?: Gig;
}

export interface Payment {
  id: string;
  clusterId: string;
  farmerId: string;
  amount: number;
  upiRef?: string | null;
  status: PaymentStatus;
  createdAt: string;
}

export interface Delivery {
  id: string;
  clusterId: string;
  trackingSteps: TrackingStep[];
  confirmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingStep {
  step: string;
  status: "completed" | "in_progress" | "pending";
  timestamp: string | null;
}

export interface Rating {
  id: string;
  farmerId: string;
  vendorId: string;
  clusterId: string;
  score: number;
  tags: string[];
  comment?: string | null;
  createdAt: string;
  farmer?: Farmer;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsData {
  totalRevenue: number;
  ordersFulfilled: number;
  bidWinRate: number;
  avgRating: number;
  revenueChart: { date: string; amount: number }[];
  topProducts: { crop: string; revenue: number; orders: number }[];
  ratingsCount: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface PaymentSummary {
  totalReceived: number;
  inEscrow: number;
  pendingRelease: number;
}

export interface VendorPaymentRow {
  clusterId: string;
  cropName: string;
  totalAmount: number;
  status: "released" | "escrow" | "pending";
  clusterStatus: ClusterStatus;
  memberCount: number;
  payments: Payment[];
}
