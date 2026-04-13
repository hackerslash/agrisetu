CREATE TYPE "VendorRole" AS ENUM ('VENDOR', 'SUPERADMIN');
CREATE TYPE "VendorStatus" AS ENUM ('ONBOARDING', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED');

ALTER TABLE "Vendor"
ADD COLUMN "role" "VendorRole" NOT NULL DEFAULT 'VENDOR',
ADD COLUMN "status" "VendorStatus" NOT NULL DEFAULT 'ONBOARDING',
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewNote" TEXT;

UPDATE "Vendor"
SET
  "role" = 'VENDOR',
  "status" = CASE
    WHEN "isVerified" = true THEN 'ACTIVE'::"VendorStatus"
    ELSE 'ONBOARDING'::"VendorStatus"
  END,
  "submittedAt" = CASE
    WHEN "isVerified" = true THEN COALESCE("updatedAt", "createdAt")
    ELSE NULL
  END;

CREATE INDEX "Vendor_role_idx" ON "Vendor"("role");
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");
