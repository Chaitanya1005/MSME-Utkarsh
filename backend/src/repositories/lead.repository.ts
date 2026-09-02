import { Prisma, PipelineStage } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface LeadScopeFilter {
  // A lead is in-scope if its branchId is in branchIds OR its regionId is
  // in regionIds. The service layer computes these from the caller's
  // authorized organizational scope — this repository never decides
  // authorization itself, it only applies a pre-computed scope.
  branchIds: string[];
  regionIds: string[];
}

export interface LeadListFilters {
  branchId?: string;
  regionId?: string;
  cbiPesStage?: PipelineStage;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

function buildWhere(scope: LeadScopeFilter, filters: LeadListFilters): Prisma.LeadWhereInput {
  const scopeClauses: Prisma.LeadWhereInput[] = [];

  if (scope.branchIds.length > 0) {
    scopeClauses.push({
      branchId: { in: scope.branchIds },
    });
  }

  if (scope.regionIds.length > 0) {
    scopeClauses.push({
      regionId: { in: scope.regionIds },
    });
  }

  const scopeClause: Prisma.LeadWhereInput = {
    OR: scopeClauses,
  };

  const filterClauses: Prisma.LeadWhereInput[] = [];
  if (filters.branchId) filterClauses.push({ branchId: filters.branchId });
  if (filters.regionId) filterClauses.push({ regionId: filters.regionId });
  if (filters.cbiPesStage) filterClauses.push({ cbiPesStage: filters.cbiPesStage });

  return filterClauses.length > 0 ? { AND: [scopeClause, ...filterClauses] } : scopeClause;
}

export async function findLeadsInScope(
  scope: LeadScopeFilter,
  filters: LeadListFilters,
  pagination: Pagination
) {
  // No authorized scope at all -> no query should ever be attempted with
  // an unbounded WHERE (which would return everything). Callers must
  // guarantee scope.branchIds/regionIds are non-empty before calling this
  // for a BM/RM; this is a defensive backstop.
  if (scope.branchIds.length === 0 && scope.regionIds.length === 0) {
    return { items: [], total: 0 };
  }

  const where = buildWhere(scope, filters);

  const [items, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items, total };
}

// Returns the effective region id for a lead the exact same way
// findLeadWithEffectiveRegion does for a single lead, so the
// authorization layer never has to special-case "listing" vs "getting".
export async function findLeadWithEffectiveRegion(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { branch: { select: { regionId: true } } },
  });
  if (!lead) return null;

  const effectiveRegionId = lead.regionId ?? lead.branch?.regionId ?? null;
  return { lead, effectiveRegionId };
}

// --- Phase 2 additions: dashboard aggregation queries -----------------
//
// These exist specifically to support the RM dashboard (spec sections
// 6–8) and are read-only, authorization-agnostic aggregations — the
// service layer is responsible for only ever calling these with a
// pre-authorized set of branch/region ids, exactly like the rest of this
// repository.

export interface BranchStageCount {
  branchId: string;
  cbiPesStage: PipelineStage;
  count: number;
}

export async function countLeadsByStageForBranches(branchIds: string[]): Promise<BranchStageCount[]> {
  if (branchIds.length === 0) return [];
  const rows = await prisma.lead.groupBy({
    by: ['branchId', 'cbiPesStage'],
    where: { branchId: { in: branchIds } },
    _count: { _all: true },
  });
  return rows
    .filter((r): r is typeof r & { branchId: string } => r.branchId !== null)
    .map((r) => ({ branchId: r.branchId, cbiPesStage: r.cbiPesStage, count: r._count._all }));
}

export interface BranchLastLeadActivity {
  branchId: string;
  lastLeadUpdateAt: Date;
}

export async function findLastLeadActivityForBranches(
  branchIds: string[]
): Promise<BranchLastLeadActivity[]> {
  if (branchIds.length === 0) return [];
  const rows = await prisma.lead.groupBy({
    by: ['branchId'],
    where: { branchId: { in: branchIds } },
    _max: { updatedAt: true },
  });
  return rows
    .filter((r): r is typeof r & { branchId: string; _max: { updatedAt: Date } } => r.branchId !== null && r._max.updatedAt !== null)
    .map((r) => ({ branchId: r.branchId, lastLeadUpdateAt: r._max.updatedAt }));
}

export async function countLeadsForRegion(regionId: string, branchIds: string[]): Promise<number> {
  return prisma.lead.count({
    where: {
      OR: [{ regionId }, { branchId: { in: branchIds } }],
    },
  });
}
