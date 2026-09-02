import { VoiceSessionStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

export function createVoiceSession(input: {
  branchId: string;
  performedByUserId: string;
  transcript: string;
  status: VoiceSessionStatus;
}) {
  return prisma.voiceUpdateSession.create({ data: input });
}

export function findVoiceSessionById(sessionId: string) {
  return prisma.voiceUpdateSession.findUnique({ where: { id: sessionId } });
}

// Leads available for extraction to match against — deliberately scoped
// to exactly the branch the session belongs to, mirroring the
// authorization scoping used everywhere else in this codebase (spec
// section 8: the AI must never reach outside the BM's authorized leads).
export function findLeadsForBranch(branchId: string) {
  return prisma.lead.findMany({
    where: { branchId },
    select: { id: true, customerName: true, cbiPesStage: true, sourceSrNo: true },
  });
}
