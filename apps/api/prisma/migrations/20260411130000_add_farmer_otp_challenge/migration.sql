-- CreateTable
CREATE TABLE "FarmerOtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerRequestId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendAvailableAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "verifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "providerAcceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmerOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FarmerOtpChallenge_phone_key" ON "FarmerOtpChallenge"("phone");

-- CreateIndex
CREATE INDEX "FarmerOtpChallenge_expiresAt_idx" ON "FarmerOtpChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "FarmerOtpChallenge_consumedAt_idx" ON "FarmerOtpChallenge"("consumedAt");
