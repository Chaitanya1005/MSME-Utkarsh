import {
  findBranchesByRegion,
  findRegionById,
  findZoneById,
  findAllZones,
  findRegionsByZone,
  findBranchesByZone,
} from '../repositories/org.repository';
import {
  countLeadsByStageForBranches,
  findLastLeadActivityForBranches,
  BranchStageCount,
} from '../repositories/lead.repository';
import { findLatestFollowUpTargetsForBranches } from '../repositories/followUp.repository';
import { AuthTokenPayload } from '../types/domain';
import { AuthorizationError, NotFoundError } from '../utils/AppError';
import { deriveBranchUpdateStatus, BranchUpdateStatus } from './branchUpdateStatus';
import { canAccessRegion, canAccessZone } from './authorization';

export interface DashboardBranch {
  id: string;
  name: string;
  bm: { id: string; name: string } | null;
  totalLeads: number;
  leadsByStage: Record<string, number>;
  lastLeadUpdateAt: string | null;
  latestFollowUp: { channel: string; sentAt: string | null; status: string } | null;
  updateStatus: BranchUpdateStatus;
}

export interface RmDashboard {
  region: { id: string; name: string };
  branches: DashboardBranch[];
  summary: {
    totalBranches: number;
    branchesRequiringUpdate: number;
    branchesWithFollowUpInFlight: number;
    totalLeads: number;
  };
}

const ALL_STAGES = [
  'LEAD_CONFIRMED',
  'DOCUMENTS_RECEIVED',
  'BRANCH_PROCESSING',
  'SANCTIONED',
  'TO_RAC',
  'APPROVED',
  'DISBURSED',
] as const;

function fillAllStages(partial: Record<string, number>): {
  leadsByStage: Record<string, number>;
  totalLeads: number;
} {
  const leadsByStage: Record<string, number> = {};
  let totalLeads = 0;
  for (const stage of ALL_STAGES) {
    const count = partial[stage] ?? 0;
    leadsByStage[stage] = count;
    totalLeads += count;
  }
  return { leadsByStage, totalLeads };
}

// Re-buckets branch-level stage counts (from countLeadsByStageForBranches)
// up one org level, using a branchId -> parent-unit-id map the caller
// supplies. Reused identically for "branches -> regions" (ZM dashboard,
// region detail) and "branches -> zones" (GM dashboard, zone detail) —
// no new aggregation primitive needed, per the Full-Hierarchy Expansion
// plan (countLeadsByStageForBranches is reused as-is with wider id sets).
function bucketStageCountsByParentUnit(
  stageCounts: BranchStageCount[],
  branchToParentUnit: Map<string, string>
): Map<string, Record<string, number>> {
  const byUnit = new Map<string, Record<string, number>>();
  for (const row of stageCounts) {
    const unitId = branchToParentUnit.get(row.branchId);
    if (!unitId) continue;
    const existing = byUnit.get(unitId) ?? {};
    existing[row.cbiPesStage] = (existing[row.cbiPesStage] ?? 0) + row.count;
    byUnit.set(unitId, existing);
  }
  return byUnit;
}

export async function getRmDashboard(user: AuthTokenPayload): Promise<RmDashboard> {
  if (user.role !== 'RM') {
    throw new AuthorizationError('Only Regional heads have a Phase 2 dashboard');
  }
  if (!user.regionId) {
    throw new NotFoundError('Region assignment');
  }

  const region = await findRegionById(user.regionId);
  if (!region) throw new NotFoundError('Region');

  const branches = await findBranchesByRegion(user.regionId);
  const branchIds = branches.map((b) => b.id);

  const [stageCounts, lastActivity, latestFollowUpTargets] = await Promise.all([
    countLeadsByStageForBranches(branchIds),
    findLastLeadActivityForBranches(branchIds),
    findLatestFollowUpTargetsForBranches(branchIds),
  ]);

  const stageCountsByBranch = new Map<string, Record<string, number>>();
  for (const row of stageCounts) {
    const existing = stageCountsByBranch.get(row.branchId) ?? {};
    existing[row.cbiPesStage] = row.count;
    stageCountsByBranch.set(row.branchId, existing);
  }

  const lastActivityByBranch = new Map(lastActivity.map((r) => [r.branchId, r.lastLeadUpdateAt]));

  // Latest follow-up target per branch (rows already ordered desc by
  // createdAt from the repository). The repository query filters
  // `branchId IN branchIds`, so every returned row has a non-null
  // branchId even though the column itself is nullable post-Full-
  // Hierarchy-Expansion (region/zone-level targets have branchId null,
  // but those never match this branchId-scoped query).
  const latestFollowUpByBranch = new Map<string, (typeof latestFollowUpTargets)[number]>();
  for (const target of latestFollowUpTargets) {
    if (!target.branchId) continue;
    if (!latestFollowUpByBranch.has(target.branchId)) {
      latestFollowUpByBranch.set(target.branchId, target);
    }
  }

  const now = new Date();

  const dashboardBranches: DashboardBranch[] = branches.map((branch) => {
    const stageMap = stageCountsByBranch.get(branch.id) ?? {};
    const { leadsByStage, totalLeads } = fillAllStages(stageMap);

    const lastLeadUpdateAt = lastActivityByBranch.get(branch.id) ?? null;
    const latestFollowUp = latestFollowUpByBranch.get(branch.id) ?? null;

    const updateStatus = deriveBranchUpdateStatus({
      lastLeadUpdateAt,
      latestFollowUpSentAt: latestFollowUp?.sentAt ?? null,
      now,
    });

    return {
      id: branch.id,
      name: branch.name,
      bm: branch.bm ? { id: branch.bm.id, name: branch.bm.name } : null,
      totalLeads,
      leadsByStage,
      lastLeadUpdateAt: lastLeadUpdateAt ? lastLeadUpdateAt.toISOString() : null,
      latestFollowUp: latestFollowUp
        ? {
            channel: latestFollowUp.followUp.channel,
            sentAt: latestFollowUp.sentAt ? latestFollowUp.sentAt.toISOString() : null,
            status: latestFollowUp.status,
          }
        : null,
      updateStatus,
    };
  });

  return {
    region: { id: region.id, name: region.name },
    branches: dashboardBranches,
    summary: {
      totalBranches: dashboardBranches.length,
      branchesRequiringUpdate: dashboardBranches.filter((b) => b.updateStatus === 'UPDATE_REQUIRED').length,
      branchesWithFollowUpInFlight: dashboardBranches.filter((b) => b.updateStatus === 'FOLLOW_UP_INITIATED')
        .length,
      totalLeads: dashboardBranches.reduce((sum, b) => sum + b.totalLeads, 0),
    },
  };
}

// ---------------------------------------------------------------------
// Full-Hierarchy Expansion additions (Phase 3): ZM/GM dashboards and
// region/zone drill-down detail, one level up from the RM dashboard and
// BranchDetailScreen respectively. All reuse countLeadsByStageForBranches
// unchanged — no new aggregation primitive, only wider branch-id sets and
// a re-bucketing step up to region/zone granularity.
// ---------------------------------------------------------------------

export interface ZmDashboardRegion {
  id: string;
  name: string;
  branchCount: number;
  totalLeads: number;
  leadsByStage: Record<string, number>;
}

export interface ZmDashboard {
  zone: { id: string; name: string };
  regions: ZmDashboardRegion[];
  summary: { totalRegions: number; totalBranches: number; totalLeads: number };
}

export async function getZmDashboard(user: AuthTokenPayload): Promise<ZmDashboard> {
  if (user.role !== 'ZM') {
    throw new AuthorizationError('Only Zonal heads have this dashboard');
  }
  if (!user.zoneId) {
    throw new NotFoundError('Zone assignment');
  }

  const zone = await findZoneById(user.zoneId);
  if (!zone) throw new NotFoundError('Zone');

  const regions = await findRegionsByZone(user.zoneId);
  const branchesByRegion = await Promise.all(regions.map((r) => findBranchesByRegion(r.id)));

  const branchToRegion = new Map<string, string>();
  const allBranchIds: string[] = [];
  regions.forEach((region, i) => {
    for (const branch of branchesByRegion[i]) {
      branchToRegion.set(branch.id, region.id);
      allBranchIds.push(branch.id);
    }
  });

  const stageCounts = await countLeadsByStageForBranches(allBranchIds);
  const byRegion = bucketStageCountsByParentUnit(stageCounts, branchToRegion);

  const dashboardRegions: ZmDashboardRegion[] = regions.map((region, i) => {
    const { leadsByStage, totalLeads } = fillAllStages(byRegion.get(region.id) ?? {});
    return {
      id: region.id,
      name: region.name,
      branchCount: branchesByRegion[i].length,
      totalLeads,
      leadsByStage,
    };
  });

  return {
    zone: { id: zone.id, name: zone.name },
    regions: dashboardRegions,
    summary: {
      totalRegions: dashboardRegions.length,
      totalBranches: dashboardRegions.reduce((sum, r) => sum + r.branchCount, 0),
      totalLeads: dashboardRegions.reduce((sum, r) => sum + r.totalLeads, 0),
    },
  };
}

export interface GmDashboardZone {
  id: string;
  name: string;
  branchCount: number;
  totalLeads: number;
  leadsByStage: Record<string, number>;
}

export interface GmDashboard {
  zones: GmDashboardZone[];
  summary: { totalZones: number; totalBranches: number; totalLeads: number };
}

// GM/CO dashboard: read-only, org-wide, one level up from ZM's. CO always
// has full org-wide scope (see authorization.ts) so there is no
// zoneId/regionId assignment to validate here.
export async function getGmDashboard(user: AuthTokenPayload): Promise<GmDashboard> {
  if (user.role !== 'CO') {
    throw new AuthorizationError('Only the General Manager has this dashboard');
  }

  const zones = await findAllZones();
  const branchesByZone = await Promise.all(zones.map((z) => findBranchesByZone(z.id)));

  const branchToZone = new Map<string, string>();
  const allBranchIds: string[] = [];
  zones.forEach((zone, i) => {
    for (const branch of branchesByZone[i]) {
      branchToZone.set(branch.id, zone.id);
      allBranchIds.push(branch.id);
    }
  });

  const stageCounts = await countLeadsByStageForBranches(allBranchIds);
  const byZone = bucketStageCountsByParentUnit(stageCounts, branchToZone);

  const dashboardZones: GmDashboardZone[] = zones.map((zone, i) => {
    const { leadsByStage, totalLeads } = fillAllStages(byZone.get(zone.id) ?? {});
    return {
      id: zone.id,
      name: zone.name,
      branchCount: branchesByZone[i].length,
      totalLeads,
      leadsByStage,
    };
  });

  return {
    zones: dashboardZones,
    summary: {
      totalZones: dashboardZones.length,
      totalBranches: dashboardZones.reduce((sum, z) => sum + z.branchCount, 0),
      totalLeads: dashboardZones.reduce((sum, z) => sum + z.totalLeads, 0),
    },
  };
}

export interface RegionDetailBranch {
  id: string;
  name: string;
  bm: { id: string; name: string } | null;
  totalLeads: number;
  leadsByStage: Record<string, number>;
}

export interface RegionDetail {
  region: { id: string; name: string };
  totalLeads: number;
  leadsByStage: Record<string, number>;
  branches: RegionDetailBranch[];
}

// Reachable by an RM viewing their own region, a ZM viewing any region in
// their zone, or CO viewing anything — authorized via canAccessRegion
// exactly like every other region-scoped read.
export async function getRegionDetail(user: AuthTokenPayload, regionId: string): Promise<RegionDetail> {
  const region = await findRegionById(regionId);
  if (!region) throw new NotFoundError('Region');
  if (!canAccessRegion(user, regionId, region.zoneId)) {
    throw new AuthorizationError('You are not authorized to view this region');
  }

  const branches = await findBranchesByRegion(regionId);
  const branchIds = branches.map((b) => b.id);
  const stageCounts = await countLeadsByStageForBranches(branchIds);

  const stageCountsByBranch = new Map<string, Record<string, number>>();
  for (const row of stageCounts) {
    const existing = stageCountsByBranch.get(row.branchId) ?? {};
    existing[row.cbiPesStage] = row.count;
    stageCountsByBranch.set(row.branchId, existing);
  }

  const branchDetails: RegionDetailBranch[] = branches.map((branch) => {
    const { leadsByStage, totalLeads } = fillAllStages(stageCountsByBranch.get(branch.id) ?? {});
    return {
      id: branch.id,
      name: branch.name,
      bm: branch.bm ? { id: branch.bm.id, name: branch.bm.name } : null,
      totalLeads,
      leadsByStage,
    };
  });

  const combined: Record<string, number> = {};
  for (const b of branchDetails) {
    for (const stage of ALL_STAGES) {
      combined[stage] = (combined[stage] ?? 0) + b.leadsByStage[stage];
    }
  }
  const { leadsByStage, totalLeads } = fillAllStages(combined);

  return {
    region: { id: region.id, name: region.name },
    totalLeads,
    leadsByStage,
    branches: branchDetails,
  };
}

export interface ZoneDetailRegion {
  id: string;
  name: string;
  branchCount: number;
  totalLeads: number;
  leadsByStage: Record<string, number>;
}

export interface ZoneDetail {
  zone: { id: string; name: string };
  totalLeads: number;
  leadsByStage: Record<string, number>;
  regions: ZoneDetailRegion[];
}

// Same pattern one level up: reachable by a ZM viewing their own zone or
// CO viewing anything, authorized via canAccessZone.
export async function getZoneDetail(user: AuthTokenPayload, zoneId: string): Promise<ZoneDetail> {
  if (!canAccessZone(user, zoneId)) {
    throw new AuthorizationError('You are not authorized to view this zone');
  }
  const zone = await findZoneById(zoneId);
  if (!zone) throw new NotFoundError('Zone');

  const regions = await findRegionsByZone(zoneId);
  const branchesByRegion = await Promise.all(regions.map((r) => findBranchesByRegion(r.id)));

  const branchToRegion = new Map<string, string>();
  const allBranchIds: string[] = [];
  regions.forEach((region, i) => {
    for (const branch of branchesByRegion[i]) {
      branchToRegion.set(branch.id, region.id);
      allBranchIds.push(branch.id);
    }
  });

  const stageCounts = await countLeadsByStageForBranches(allBranchIds);
  const byRegion = bucketStageCountsByParentUnit(stageCounts, branchToRegion);

  const regionDetails: ZoneDetailRegion[] = regions.map((region, i) => {
    const { leadsByStage, totalLeads } = fillAllStages(byRegion.get(region.id) ?? {});
    return {
      id: region.id,
      name: region.name,
      branchCount: branchesByRegion[i].length,
      totalLeads,
      leadsByStage,
    };
  });

  const combined: Record<string, number> = {};
  for (const r of regionDetails) {
    for (const stage of ALL_STAGES) {
      combined[stage] = (combined[stage] ?? 0) + r.leadsByStage[stage];
    }
  }
  const { leadsByStage, totalLeads } = fillAllStages(combined);

  return {
    zone: { id: zone.id, name: zone.name },
    totalLeads,
    leadsByStage,
    regions: regionDetails,
  };
}
