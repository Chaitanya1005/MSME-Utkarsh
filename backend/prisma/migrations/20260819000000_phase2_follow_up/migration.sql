-- MSME Utkarsh Phase 2 — message-based follow-up.
--
-- Additive only: does not modify the Phase 1 migration
-- (20260816000000_init). As with that migration, this file was hand-authored
-- to match schema.prisma because this build environment cannot reach
-- binaries.prisma.sh to run `prisma migrate dev` directly — run
-- `npx prisma migrate dev` on your machine as the authoritative step;
-- Prisma should detect the schema changes and apply/register an
-- equivalent migration.

-- New BM/RM contact fields (nullable — only required, at the service
-- layer, when a follow-up on that channel is actually attempted).
ALTER TABLE "users" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "users" ADD COLUMN "email" TEXT;

-- Enums
CREATE TYPE "FollowUpChannel" AS ENUM ('WHATSAPP', 'EMAIL');
CREATE TYPE "FollowUpTargetStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'ACCESSED');

-- FollowUp (one row per RM-initiated batch action, spanning 1..N branches)
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "channel" "FollowUpChannel" NOT NULL,
    "messageBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "follow_ups_initiatedByUserId_idx" ON "follow_ups"("initiatedByUserId");

-- FollowUpTarget (one row per branch within a FollowUp)
CREATE TABLE "follow_up_targets" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "FollowUpTargetStatus" NOT NULL DEFAULT 'PENDING',
    "accessTokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "follow_up_targets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "follow_up_targets_accessTokenHash_key" ON "follow_up_targets"("accessTokenHash");
CREATE INDEX "follow_up_targets_followUpId_idx" ON "follow_up_targets"("followUpId");
CREATE INDEX "follow_up_targets_branchId_idx" ON "follow_up_targets"("branchId");

-- Foreign keys
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "follow_up_targets" ADD CONSTRAINT "follow_up_targets_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "follow_ups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_up_targets" ADD CONSTRAINT "follow_up_targets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
