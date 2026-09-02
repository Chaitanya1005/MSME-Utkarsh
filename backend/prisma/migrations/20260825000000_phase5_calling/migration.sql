-- MSME Utkarsh Phase 5 — calling foundation.
--
-- Additive only: does not modify any prior migration. Hand-authored to
-- match schema.prisma for the same sandbox reason documented in every
-- prior migration file in this project — run `npx prisma migrate dev`
-- on your machine as the authoritative step.

CREATE TYPE "CallStatus" AS ENUM ('INITIATED', 'FAILED', 'COMPLETED');

CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "calledUserId" TEXT NOT NULL,
    "calledPhoneNumber" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL,
    "providerCallId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "calls_initiatedByUserId_idx" ON "calls"("initiatedByUserId");
CREATE INDEX "calls_calledUserId_idx" ON "calls"("calledUserId");
CREATE INDEX "calls_branchId_idx" ON "calls"("branchId");

ALTER TABLE "calls" ADD CONSTRAINT "calls_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calls" ADD CONSTRAINT "calls_calledUserId_fkey" FOREIGN KEY ("calledUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calls" ADD CONSTRAINT "calls_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
