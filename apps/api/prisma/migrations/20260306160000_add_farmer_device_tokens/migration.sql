-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID');

-- CreateTable
CREATE TABLE "FarmerDeviceToken" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmerDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FarmerDeviceToken_token_key" ON "FarmerDeviceToken"("token");
CREATE INDEX "FarmerDeviceToken_farmerId_platform_idx" ON "FarmerDeviceToken"("farmerId", "platform");
CREATE INDEX "FarmerDeviceToken_farmerId_lastSeenAt_idx" ON "FarmerDeviceToken"("farmerId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "FarmerDeviceToken"
ADD CONSTRAINT "FarmerDeviceToken_farmerId_fkey"
FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
