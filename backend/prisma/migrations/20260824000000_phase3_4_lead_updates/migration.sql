-- MSME Utkarsh Phase 3/4 — unified manual + AI voice lead-update pipeline.
--
-- Additive only: does not modify the Phase 1 or Phase 2 migrations. As
-- with those, hand-authored to match schema.prisma because this build
-- environment cannot reach binaries.prisma.sh to run `prisma migrate dev`
-- directly — run it on your machine as the authoritative step.

CREATE TYPE "UpdateSource" AS ENUM ('MANUAL', 'VOICE_AI');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "VoiceSessionStatus" AS ENUM ('TRANSCRIBED', 'EXTRACTED', 'FAILED');

CREATE TABLE "voice_update_sessions" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "performedByUserId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "status" "VoiceSessionStatus" NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voice_update_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "voice_update_sessions_branchId_idx" ON "voice_update_sessions"("branchId");
CREATE INDEX "voice_update_sessions_performedByUserId_idx" ON "voice_update_sessions"("performedByUserId");

CREATE TABLE "lead_update_proposals" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "source" "UpdateSource" NOT NULL,
    "previousStage" "PipelineStage" NOT NULL,
    "proposedStage" "PipelineStage" NOT NULL,
    "remarks" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "voiceSessionId" TEXT,
    "transcriptExcerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    CONSTRAINT "lead_update_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lead_update_proposals_leadId_idx" ON "lead_update_proposals"("leadId");
CREATE INDEX "lead_update_proposals_proposedByUserId_idx" ON "lead_update_proposals"("proposedByUserId");
CREATE INDEX "lead_update_proposals_status_idx" ON "lead_update_proposals"("status");
CREATE INDEX "lead_update_proposals_voiceSessionId_idx" ON "lead_update_proposals"("voiceSessionId");

CREATE TABLE "lead_activity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "previousStage" "PipelineStage" NOT NULL,
    "newStage" "PipelineStage" NOT NULL,
    "remarks" TEXT,
    "performedByUserId" TEXT NOT NULL,
    "source" "UpdateSource" NOT NULL,
    "proposalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_activity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_activity_proposalId_key" ON "lead_activity"("proposalId");
CREATE INDEX "lead_activity_leadId_idx" ON "lead_activity"("leadId");

ALTER TABLE "voice_update_sessions" ADD CONSTRAINT "voice_update_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_update_sessions" ADD CONSTRAINT "voice_update_sessions_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_update_proposals" ADD CONSTRAINT "lead_update_proposals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_update_proposals" ADD CONSTRAINT "lead_update_proposals_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_update_proposals" ADD CONSTRAINT "lead_update_proposals_voiceSessionId_fkey" FOREIGN KEY ("voiceSessionId") REFERENCES "voice_update_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "lead_update_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
