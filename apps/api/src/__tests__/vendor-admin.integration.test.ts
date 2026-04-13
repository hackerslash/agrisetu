import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type VendorStatus =
  | "ONBOARDING"
  | "PENDING_REVIEW"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";
type VendorRole = "VENDOR" | "SUPERADMIN";
type DocType = "PAN" | "GST" | "QUALITY_CERT";

type VendorRecord = {
  id: string;
  email: string;
  password: string;
  businessName: string;
  contactName: string;
  phone: string;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  businessType: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceRadiusKm: number;
  role: VendorRole;
  status: VendorStatus;
  isVerified: boolean;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type VendorDocumentRecord = {
  id: string;
  vendorId: string;
  docType: DocType;
  fileUrl: string;
  uploadedAt: Date;
};

let vendors = new Map<string, VendorRecord>();
let vendorDocuments = new Map<string, VendorDocumentRecord[]>();
let vendorCounter = 2;
let vendorDocumentCounter = 1;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function resetStores() {
  const now = new Date();
  const hashedPassword = bcrypt.hashSync("password", 10);
  vendors = new Map([
    [
      "vendor-1",
      {
        id: "vendor-1",
        email: "vendor@example.com",
        password: hashedPassword,
        businessName: "Agri Vendor",
        contactName: "Vendor User",
        phone: "9876543210",
        gstin: null,
        pan: null,
        state: null,
        businessType: null,
        locationAddress: null,
        latitude: null,
        longitude: null,
        serviceRadiusKm: 25,
        role: "VENDOR",
        status: "ACTIVE",
        isVerified: true,
        submittedAt: now,
        reviewedAt: now,
        reviewedById: "admin-1",
        reviewNote: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      "vendor-2",
      {
        id: "vendor-2",
        email: "pending@example.com",
        password: hashedPassword,
        businessName: "Pending Vendor",
        contactName: "Pending User",
        phone: "9999999999",
        gstin: null,
        pan: null,
        state: null,
        businessType: null,
        locationAddress: null,
        latitude: null,
        longitude: null,
        serviceRadiusKm: 25,
        role: "VENDOR",
        status: "PENDING_REVIEW",
        isVerified: false,
        submittedAt: now,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      "admin-1",
      {
        id: "admin-1",
        email: "admin@example.com",
        password: hashedPassword,
        businessName: "AgriSetu Admin",
        contactName: "Super Admin",
        phone: "9000000000",
        gstin: null,
        pan: null,
        state: null,
        businessType: null,
        locationAddress: null,
        latitude: null,
        longitude: null,
        serviceRadiusKm: 25,
        role: "SUPERADMIN",
        status: "ACTIVE",
        isVerified: true,
        submittedAt: now,
        reviewedAt: now,
        reviewedById: "admin-1",
        reviewNote: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  ]);
  vendorDocuments = new Map();
  vendorCounter = 3;
  vendorDocumentCounter = 1;
}

function findVendor(where: { id?: string; email?: string; role?: VendorRole }) {
  for (const vendor of vendors.values()) {
    if (where.id && vendor.id !== where.id) continue;
    if (where.email && vendor.email !== where.email) continue;
    if (where.role && vendor.role !== where.role) continue;
    return vendor;
  }
  return null;
}

function filterDocuments(where: { vendorId?: string; docType?: DocType }) {
  const docs = where.vendorId ? vendorDocuments.get(where.vendorId) ?? [] : [];
  return docs.filter((doc) => (where.docType ? doc.docType === where.docType : true));
}

function firstSetCookie(value: string | string[] | undefined) {
  if (!value) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function joinedSetCookie(value: string | string[] | undefined) {
  if (!value) return "";
  return Array.isArray(value) ? value.join(";") : value;
}

const mockPrisma = {
  vendor: {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
      return clone(findVendor(where) ?? null);
    }),
    findFirst: vi.fn(
      async ({ where }: { where: { id?: string; email?: string; role?: VendorRole } }) => {
        return clone(findVendor(where) ?? null);
      },
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where?: { role?: VendorRole; status?: VendorStatus };
      }) => {
        return clone(
          [...vendors.values()].filter((vendor) => {
            if (where?.role && vendor.role !== where.role) return false;
            if (where?.status && vendor.status !== where.status) return false;
            return true;
          }),
        );
      },
    ),
    count: vi.fn(
      async ({
        where,
      }: {
        where?: { role?: VendorRole; status?: VendorStatus };
      }) => {
        return [...vendors.values()].filter((vendor) => {
          if (where?.role && vendor.role !== where.role) return false;
          if (where?.status && vendor.status !== where.status) return false;
          return true;
        }).length;
      },
    ),
    create: vi.fn(async ({ data }: { data: Partial<VendorRecord> }) => {
      const vendor: VendorRecord = {
        id: `vendor-${vendorCounter++}`,
        email: String(data.email),
        password: String(data.password),
        businessName: String(data.businessName),
        contactName: String(data.contactName),
        phone: String(data.phone),
        gstin: (data.gstin as string | null | undefined) ?? null,
        pan: (data.pan as string | null | undefined) ?? null,
        state: (data.state as string | null | undefined) ?? null,
        businessType: (data.businessType as string | null | undefined) ?? null,
        locationAddress: (data.locationAddress as string | null | undefined) ?? null,
        latitude: (data.latitude as number | null | undefined) ?? null,
        longitude: (data.longitude as number | null | undefined) ?? null,
        serviceRadiusKm: (data.serviceRadiusKm as number | undefined) ?? 25,
        role: (data.role as VendorRole | undefined) ?? "VENDOR",
        status: (data.status as VendorStatus | undefined) ?? "ONBOARDING",
        isVerified: (data.isVerified as boolean | undefined) ?? false,
        submittedAt: (data.submittedAt as Date | null | undefined) ?? null,
        reviewedAt: (data.reviewedAt as Date | null | undefined) ?? null,
        reviewedById: (data.reviewedById as string | null | undefined) ?? null,
        reviewNote: (data.reviewNote as string | null | undefined) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vendors.set(vendor.id, vendor);
      return clone(vendor);
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<VendorRecord>;
      }) => {
        const existing = vendors.get(where.id);
        if (!existing) throw new Error("Vendor not found");
        const nextValue = { ...existing, ...data, updatedAt: new Date() };
        vendors.set(where.id, nextValue);
        return clone(nextValue);
      },
    ),
    upsert: vi.fn(),
  },
  vendorDocument: {
    findMany: vi.fn(async ({ where }: { where: { vendorId: string; docType?: DocType } }) => {
      return clone(filterDocuments(where));
    }),
    deleteMany: vi.fn(
      async ({ where }: { where: { vendorId: string; docType?: DocType } }) => {
        const docs = vendorDocuments.get(where.vendorId) ?? [];
        const kept = docs.filter((doc) =>
          where.docType ? doc.docType !== where.docType : false,
        );
        vendorDocuments.set(where.vendorId, kept);
        return { count: docs.length - kept.length };
      },
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: { vendorId: string; docType: DocType; fileUrl: string };
      }) => {
        const doc: VendorDocumentRecord = {
          id: `doc-${vendorDocumentCounter++}`,
          vendorId: data.vendorId,
          docType: data.docType,
          fileUrl: data.fileUrl,
          uploadedAt: new Date(),
        };
        const docs = vendorDocuments.get(data.vendorId) ?? [];
        docs.push(doc);
        vendorDocuments.set(data.vendorId, docs);
        return clone(doc);
      },
    ),
  },
  $transaction: vi.fn(
    async (
      callback: (tx: {
        vendorDocument: typeof mockPrisma.vendorDocument;
      }) => Promise<unknown>,
    ) => callback({ vendorDocument: mockPrisma.vendorDocument }),
  ),
};

vi.mock("../lib/prisma.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("../services/vendor-documents.js", () => ({
  uploadVendorDocumentBuffer: vi.fn(
    async ({ vendorId, docType }: { vendorId: string; docType: DocType }) => ({
      fileUrl: `https://files.example/${vendorId}/${docType.toLowerCase()}.pdf`,
    }),
  ),
  deleteVendorDocumentIfManaged: vi.fn(async () => {}),
  withVendorDocumentForClient: vi.fn(async (document: unknown) => document),
  withVendorDocumentsForClient: vi.fn(async (vendor: unknown) => vendor),
}));

vi.mock("../services/vendor-status-notifications.js", () => ({
  notifyVendorStatusChanged: vi.fn(async () => {}),
}));

vi.mock("../routes/farmer.js", async () => {
  const express = await import("express");
  return { default: express.Router() };
});

vi.mock("../routes/vendor.js", async () => {
  const express = await import("express");
  return { default: express.Router() };
});

vi.mock("../services/farmer-avatar.js", () => ({
  withFarmerAvatarForClient: vi.fn(async (farmer: unknown) => farmer),
}));

vi.mock("../services/push-notifications.js", () => ({
  normalizeNotificationPreferences: vi.fn((value: unknown) => value ?? {}),
  registerFarmerDeviceToken: vi.fn(),
  unregisterFarmerDeviceToken: vi.fn(),
}));

vi.mock("../services/fast2sms.js", () => ({
  sendFarmerOtpSms: vi.fn(),
}));

vi.mock("../ws/voice-stream.js", () => ({
  attachVoiceStreamServer: vi.fn(),
  handleVoiceStreamUpgrade: vi.fn(() => false),
}));

vi.mock("../services/cluster.js", () => ({
  sweepStaleClusters: vi.fn(async () => {}),
}));

async function loadApp() {
  process.env.JWT_SECRET = "12345678901234567890123456789012";
  process.env.CORS_ALLOWED_ORIGINS = "https://vendor.agrisetu.test";
  vi.resetModules();
  const { createApp } = await import("../index.js");
  return createApp();
}

async function loadJwt() {
  process.env.JWT_SECRET = "12345678901234567890123456789012";
  vi.resetModules();
  return import("../lib/jwt.js");
}

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("vendor onboarding and admin flow", () => {
  test("keeps vendors unverified through registration and moves them to pending review on submit", async () => {
    const app = await loadApp();

    const step1 = await request(app)
      .post("/api/v1/auth/vendor/register/step1")
      .send({
        email: "fresh@example.com",
        password: "strong-password",
        businessName: "Fresh Inputs",
        contactName: "Fresh User",
        phone: "9123456789",
      });

    expect(step1.status).toBe(201);
    expect(step1.body.data.vendor.role).toBe("VENDOR");
    expect(step1.body.data.vendor.status).toBe("ONBOARDING");
    expect(step1.body.data.vendor.isVerified).toBe(false);

    const cookie = firstSetCookie(step1.headers["set-cookie"]);
    expect(cookie).toContain("agrisetu_session=");

    const step2 = await request(app)
      .post("/api/v1/auth/vendor/register/step2")
      .set("Cookie", cookie)
      .set("Origin", "https://vendor.agrisetu.test")
      .send({ gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F" });

    expect(step2.status).toBe(200);
    expect(step2.body.data.vendor.status).toBe("ONBOARDING");
    expect(step2.body.data.vendor.isVerified).toBe(false);

    await request(app)
      .post("/api/v1/auth/vendor/register/document-upload")
      .set("Cookie", cookie)
      .set("Origin", "https://vendor.agrisetu.test")
      .field("docType", "PAN")
      .attach("file", Buffer.from("pan"), "pan.pdf");

    await request(app)
      .post("/api/v1/auth/vendor/register/document-upload")
      .set("Cookie", cookie)
      .set("Origin", "https://vendor.agrisetu.test")
      .field("docType", "GST")
      .attach("file", Buffer.from("gst"), "gst.pdf");

    const step3 = await request(app)
      .post("/api/v1/auth/vendor/register/step3")
      .set("Cookie", cookie)
      .set("Origin", "https://vendor.agrisetu.test")
      .send({ documents: [] });

    expect(step3.status).toBe(201);
    expect(step3.body.data.message).toContain("registration is in progress");
    expect(joinedSetCookie(step3.headers["set-cookie"])).toContain("agrisetu_session=;");

    const createdVendor = findVendor({ email: "fresh@example.com" });
    expect(createdVendor?.status).toBe("PENDING_REVIEW");
    expect(createdVendor?.isVerified).toBe(false);
    expect(createdVendor?.submittedAt).toBeTruthy();
  });

  test("blocks pending vendors from login and allows superadmin login", async () => {
    const app = await loadApp();

    const pendingLogin = await request(app)
      .post("/api/v1/auth/vendor/login")
      .send({ email: "pending@example.com", password: "password" });

    expect(pendingLogin.status).toBe(403);
    expect(pendingLogin.body.error).toContain("registration is in progress");

    const adminLogin = await request(app)
      .post("/api/v1/auth/vendor/login")
      .send({ email: "admin@example.com", password: "password" });

    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.data.vendor.role).toBe("SUPERADMIN");
  });

  test("rejects vendor/me for suspended vendors and clears the session cookie", async () => {
    const { signToken } = await loadJwt();
    const app = await loadApp();

    const suspended = vendors.get("vendor-1");
    if (!suspended) throw new Error("Missing vendor fixture");
    suspended.status = "SUSPENDED";
    suspended.isVerified = false;
    suspended.reviewNote = "Suspended for investigation.";
    vendors.set("vendor-1", suspended);

    const response = await request(app)
      .get("/api/v1/auth/vendor/me")
      .set(
        "Cookie",
        `agrisetu_session=${encodeURIComponent(
          signToken({ id: "vendor-1", role: "vendor" }),
        )}`,
      );

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("temporarily suspended");
    expect(joinedSetCookie(response.headers["set-cookie"])).toContain(
      "agrisetu_session=;",
    );
  });

  test("lets a superadmin approve, suspend, and reactivate vendors", async () => {
    const { signToken } = await loadJwt();
    const app = await loadApp();
    const adminCookie = `agrisetu_session=${encodeURIComponent(
      signToken({ id: "admin-1", role: "superadmin" }),
    )}`;

    const approve = await request(app)
      .post("/api/v1/admin/vendors/vendor-2/approve")
      .set("Cookie", adminCookie)
      .set("Origin", "https://vendor.agrisetu.test");

    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe("ACTIVE");
    expect(approve.body.data.isVerified).toBe(true);

    const suspend = await request(app)
      .post("/api/v1/admin/vendors/vendor-2/suspend")
      .set("Cookie", adminCookie)
      .set("Origin", "https://vendor.agrisetu.test")
      .send({ reviewNote: "Suspicious fulfilment behaviour." });

    expect(suspend.status).toBe(200);
    expect(suspend.body.data.status).toBe("SUSPENDED");
    expect(suspend.body.data.reviewNote).toContain("Suspicious");

    const reactivate = await request(app)
      .post("/api/v1/admin/vendors/vendor-2/reactivate")
      .set("Cookie", adminCookie)
      .set("Origin", "https://vendor.agrisetu.test");

    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.status).toBe("ACTIVE");

    const list = await request(app)
      .get("/api/v1/admin/vendors?status=ACTIVE")
      .set("Cookie", adminCookie);

    expect(list.status).toBe(200);
    expect(list.body.data.summary.active).toBeGreaterThanOrEqual(2);
    expect(
      list.body.data.vendors.some((vendor: { id: string }) => vendor.id === "vendor-2"),
    ).toBe(true);
  });

  test("requires a review note for reject and suspend actions", async () => {
    const { signToken } = await loadJwt();
    const app = await loadApp();
    const adminCookie = `agrisetu_session=${encodeURIComponent(
      signToken({ id: "admin-1", role: "superadmin" }),
    )}`;

    const reject = await request(app)
      .post("/api/v1/admin/vendors/vendor-2/reject")
      .set("Cookie", adminCookie)
      .set("Origin", "https://vendor.agrisetu.test")
      .send({ reviewNote: "" });

    expect(reject.status).toBe(422);
  });
});
