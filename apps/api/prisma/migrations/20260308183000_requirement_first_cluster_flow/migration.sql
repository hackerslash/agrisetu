-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "requirement" JSONB,
                    ADD COLUMN "requirementKey" TEXT;

-- AlterTable
ALTER TABLE "Cluster" ADD COLUMN "requirementKey" TEXT,
                      ADD COLUMN "votingRevision"  INTEGER NOT NULL DEFAULT 0,
                      ADD COLUMN "staleAt"         TIMESTAMP(3),
                      ADD COLUMN "failureReason"   TEXT;

-- AlterTable
ALTER TABLE "VendorVote" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
