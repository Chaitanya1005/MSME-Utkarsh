import { Prisma, VoiceSessionStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

// Exactly one of branchId/regionId/zoneId is set, matching the scope the
// session's performer resolved into (see
// services/voiceUpdate.service.ts#resolveVoiceScope).
export type VoiceScope = { branchId: string } | { regionId: string } | { zoneId: string };

export function createVoiceSession(input: {
  branchId?: string;
  regionId?: string;
  zoneId?: string;
  performedByUserId: string;
  transcript: string;
  status: VoiceSessionStatus;
}) {
  return prisma.voiceUpdateSession.create({ data: input });
}

export function findVoiceSessionById(sessionId: string) {
  return prisma.voiceUpdateSession.findUnique({ where: { id: sessionId } });
}

// Leads available for extraction to match against — scoped to exactly
// the branch/region/zone the session's performer is authorized for,
// mirroring the authorization scoping used everywhere else in this
// codebase (spec section 8: the AI must never reach outside the
// performer's authorized leads). Region/zone scope mirrors the dual-FK
// lead-scoping already used in lead.service.ts's computeLeadScope: a
// region includes both region-owned leads and leads owned by branches
// under that region (and similarly one level up for zone).
export function findLeadsInScope(scope: VoiceScope) {
  const where: Prisma.LeadWhereInput =
    'branchId' in scope
      ? { branchId: scope.branchId }
      : 'regionId' in scope
        ? { OR: [{ regionId: scope.regionId }, { branch: { regionId: scope.regionId } }] }
        : {
            OR: [
              { zoneId: scope.zoneId },
              { region: { zoneId: scope.zoneId } },
              { branch: { region: { zoneId: scope.zoneId } } },
            ],
          };

  return prisma.lead.findMany({
    where,
    select: { id: true, customerName: true, cbiPesStage: true, sourceSrNo: true },
  });
}
