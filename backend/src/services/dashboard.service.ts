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
  countLeadsByStageForRegions,
  findLeadsDirectlyInRegions,
  findLastLeadActivityForBranches,
  findLastLeadActivityForRegions,
  BranchStageCount,
  RegionStageCount,
} from '../repositories/lead.repository';
import {
  findLatestFollowUpTargetsForBranches,
  findLatestFollowUpTargetsForRecipients,
} from '../repositories/followUp.repository';
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
  // Leads assigned directly to the region rather than any one branch —
  // the RM's own leads to propose/voice-update, reachable via
  // RegionDetail (Full-Hierarchy Expansion plan).
  regionDirectLeadsCount: number;
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

// Buckets region-direct stage counts (from countLeadsByStageForRegions) by
// regionId, same shape bucketStageCountsByParentUnit produces, so the two
// can be merged with mergeStageCountMaps below.
function bucketRegionDirectCounts(regionStageCounts: RegionStageCount[]): Map<string, Record<string, number>> {
  const byRegion = new Map<string, Record<string, number>>();
  for (const row of regionStageCounts) {
    const existing = byRegion.get(row.regionId) ?? {};
    existing[row.cbiPesStage] = (existing[row.cbiPesStage] ?? 0) + row.count;
    byRegion.set(row.regionId, existing);
  }
  return byRegion;
}

// Adds b's counts into a fresh copy of a, per unit id — used to combine
// "leads under this unit's branches" with "leads assigned directly to
// this unit" into one total, without either caller needing to know the
// other's counts exist.
function mergeStageCountMaps(
  a: Map<string, Record<string, number>>,
  b: Map<string, Record<string, number>>
): Map<string, Record<string, number>> {
  const merged = new Map<string, Record<string, number>>();
  const unitIds = new Set([...a.keys(), ...b.keys()]);
  for (const unitId of unitIds) {
    const combined: Record<string, number> = { ...(a.get(unitId) ?? {}) };
    const fromB = b.get(unitId) ?? {};
    for (const stage of Object.keys(fromB)) {
      combined[stage] = (combined[stage] ?? 0) + fromB[stage];
    }
    merged.set(unitId, combined);
  }
  return merged;
}

// Re-buckets branch-level last-activity dates up one org level (same
// "branches -> regions"/"branches -> zones" pattern as
// bucketStageCountsByParentUnit), taking the max date per parent unit.
function bucketMaxDateByParentUnit(
  rows: Array<{ branchId: string; lastLeadUpdateAt: Date }>,
  branchToParentUnit: Map<string, string>
): Map<string, Date> {
  const byUnit = new Map<string, Date>();
  for (const row of rows) {
    const unitId = branchToParentUnit.get(row.branchId);
    if (!unitId) continue;
    const existing = byUnit.get(unitId);
    if (!existing || row.lastLeadUpdateAt > existing) {
      byUnit.set(unitId, row.lastLeadUpdateAt);
    }
  }
  return byUnit;
}

// Merges two "max date per unit" maps into one, keeping whichever date
// is later per unit — used to combine "latest activity among this
// unit's branches" with "latest activity on this unit's own direct
// leads" into one true last-activity value.
function mergeMaxDateMaps(a: Map<string, Date>, b: Map<string, Date>): Map<string, Date> {
  const merged = new Map(a);
  for (const [unitId, date] of b) {
    const existing = merged.get(unitId);
    if (!existing || date > existing) {
      merged.set(unitId, date);
    }
  }
  return merged;
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

  const [stageCounts, regionDirectStageCounts, lastActivity, latestFollowUpTargets] = await Promise.all([
    countLeadsByStageForBranches(branchIds),
    countLeadsByStageForRegions([user.regionId]),
    findLastLeadActivityForBranches(branchIds),
    findLatestFollowUpTargetsForBranches(branchIds),
  ]);

  // Leads assigned directly to the RM's own region (not any branch) —
  // the RM's "own" leads, per the Full-Hierarchy Expansion plan. Not
  // attributable to any branch row below, so folded only into the
  // summary total here; the actual list is reachable via RegionDetail
  // (tapping the "YOUR REGION" hero card).
  const { totalLeads: regionDirectLeadsCount } = fillAllStages(
    bucketRegionDirectCounts(regionDirectStageCounts).get(user.regionId) ?? {}
  );

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
    regionDirectLeadsCount,
    summary: {
      totalBranches: dashboardBranches.length,
      branchesRequiringUpdate: dashboardBranches.filter((b) => b.updateStatus === 'UPDATE_REQUIRED').length,
      branchesWithFollowUpInFlight: dashboardBranches.filter((b) => b.updateStatus === 'FOLLOW_UP_INITIATED')
        .length,
      totalLeads: dashboardBranches.reduce((sum, b) => sum + b.totalLeads, 0) + regionDirectLeadsCount,
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
  rm: { id: string; name: string } | null;
  branchCount: number;
  totalLeads: number;
  leadsByStage: Record<string, number>;
  lastLeadUpdateAt: string | null;
  latestFollowUp: { channel: string; sentAt: string | null; status: string } | null;
  updateStatus: BranchUpdateStatus;
}

export interface ZmDashboard {
  zone: { id: string; name: string };
  regions: ZmDashboardRegion[];
  summary: {
    totalRegions: number;
    totalBranches: number;
    totalLeads: number;
    regionsRequiringUpdate: number;
    regionsWithFollowUpInFlight: number;
  };
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

  const regionIds = regions.map((r) => r.id);
  // A region's recipient (for "was a follow-up sent to this region") is
  // its RM — mirroring how a branch's recipient is its BM.
  const regionRmIds = regions.map((r) => r.rm?.id).filter((id): id is string => !!id);

  const [stageCounts, regionDirectStageCounts, branchLastActivity, regionLastActivity, latestFollowUpTargets] =
    await Promise.all([
      countLeadsByStageForBranches(allBranchIds),
      countLeadsByStageForRegions(regionIds),
      findLastLeadActivityForBranches(allBranchIds),
      findLastLeadActivityForRegions(regionIds),
      findLatestFollowUpTargetsForRecipients(regionRmIds),
    ]);
  const byRegion = mergeStageCountMaps(
    bucketStageCountsByParentUnit(stageCounts, branchToRegion),
    bucketRegionDirectCounts(regionDirectStageCounts)
  );
  const lastActivityByRegion = mergeMaxDateMaps(
    bucketMaxDateByParentUnit(branchLastActivity, branchToRegion),
    new Map(regionLastActivity.map((r) => [r.regionId, r.lastLeadUpdateAt]))
  );
  const latestFollowUpByRecipient = new Map<string, (typeof latestFollowUpTargets)[number]>();
  for (const target of latestFollowUpTargets) {
    if (!target.recipientUserId) continue;
    if (!latestFollowUpByRecipient.has(target.recipientUserId)) {
      latestFollowUpByRecipient.set(target.recipientUserId, target);
    }
  }

  const now = new Date();

  const dashboardRegions: ZmDashboardRegion[] = regions.map((region, i) => {
    const { leadsByStage, totalLeads } = fillAllStages(byRegion.get(region.id) ?? {});
    const lastLeadUpdateAt = lastActivityByRegion.get(region.id) ?? null;
    const latestFollowUp = region.rm ? latestFollowUpByRecipient.get(region.rm.id) ?? null : null;
    const updateStatus = deriveBranchUpdateStatus({
      lastLeadUpdateAt,
      latestFollowUpSentAt: latestFollowUp?.sentAt ?? null,
      now,
    });
    return {
      id: region.id,
      name: region.name,
      rm: region.rm ? { id: region.rm.id, name: region.rm.name } : null,
      branchCount: branchesByRegion[i].length,
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
    zone: { id: zone.id, name: zone.name },
    regions: dashboardRegions,
    summary: {
      totalRegions: dashboardRegions.length,
      totalBranches: dashboardRegions.reduce((sum, r) => sum + r.branchCount, 0),
      totalLeads: dashboardRegions.reduce((sum, r) => sum + r.totalLeads, 0),
      regionsRequiringUpdate: dashboardRegions.filter((r) => r.updateStatus === 'UPDATE_REQUIRED').length,
      regionsWithFollowUpInFlight: dashboardRegions.filter((r) => r.updateStatus === 'FOLLOW_UP_INITIATED').length,
    },
  };
}

export interface GmDashboardZone {
  id: string;
  name: string;
  zm: { id: string; name: string } | null;
  branchCount: number;
  totalLeads: number;
  leadsByStage: Record<string, number>;
  lastLeadUpdateAt: string | null;
  latestFollowUp: { channel: string; sentAt: string | null; status: string } | null;
  updateStatus: BranchUpdateStatus;
}

export interface GmDashboard {
  zones: GmDashboardZone[];
  summary: {
    totalZones: number;
    totalBranches: number;
    totalLeads: number;
    zonesRequiringUpdate: number;
    zonesWithFollowUpInFlight: number;
  };
}

// GM/CO dashboard: read-only, org-wide, one level up from ZM's. CO always
// has full org-wide scope (see authorization.ts) so there is no
// zoneId/regionId assignment to validate here.
export async function getGmDashboard(user: AuthTokenPayload): Promise<GmDashboard> {
  if (user.role !== 'CO') {
    throw new AuthorizationError('Only the General Manager has this dashboard');
  }

  const zones = await findAllZones();
  const [branchesByZone, regionsByZone] = await Promise.all([
    Promise.all(zones.map((z) => findBranchesByZone(z.id))),
    Promise.all(zones.map((z) => findRegionsByZone(z.id))),
  ]);

  const branchToZone = new Map<string, string>();
  const allBranchIds: string[] = [];
  zones.forEach((zone, i) => {
    for (const branch of branchesByZone[i]) {
      branchToZone.set(branch.id, zone.id);
      allBranchIds.push(branch.id);
    }
  });

  const regionToZone = new Map<string, string>();
  const allRegionIds: string[] = [];
  zones.forEach((zone, i) => {
    for (const region of regionsByZone[i]) {
      regionToZone.set(region.id, zone.id);
      allRegionIds.push(region.id);
    }
  });

  // A zone's recipient (for "was a follow-up sent to this zone") is its
  // ZM — mirroring how a region's recipient is its RM.
  const zoneZmIds = zones.map((z) => z.zm?.id).filter((id): id is string => !!id);

  const [stageCounts, regionDirectStageCounts, branchLastActivity, regionLastActivity, latestFollowUpTargets] =
    await Promise.all([
      countLeadsByStageForBranches(allBranchIds),
      countLeadsByStageForRegions(allRegionIds),
      findLastLeadActivityForBranches(allBranchIds),
      findLastLeadActivityForRegions(allRegionIds),
      findLatestFollowUpTargetsForRecipients(zoneZmIds),
    ]);
  // Region-direct counts/dates are keyed by regionId; re-bucket them by
  // zone via regionToZone before merging with the branch-bucketed-by-zone
  // maps.
  const regionDirectByRegion = bucketRegionDirectCounts(regionDirectStageCounts);
  const regionDirectByZone = new Map<string, Record<string, number>>();
  for (const [regionId, counts] of regionDirectByRegion) {
    const zoneId = regionToZone.get(regionId);
    if (!zoneId) continue;
    const existing = regionDirectByZone.get(zoneId) ?? {};
    for (const stage of Object.keys(counts)) {
      existing[stage] = (existing[stage] ?? 0) + counts[stage];
    }
    regionDirectByZone.set(zoneId, existing);
  }
  const byZone = mergeStageCountMaps(bucketStageCountsByParentUnit(stageCounts, branchToZone), regionDirectByZone);

  const regionLastActivityByZone = new Map<string, Date>();
  for (const row of regionLastActivity) {
    const zoneId = regionToZone.get(row.regionId);
    if (!zoneId) continue;
    const existing = regionLastActivityByZone.get(zoneId);
    if (!existing || row.lastLeadUpdateAt > existing) {
      regionLastActivityByZone.set(zoneId, row.lastLeadUpdateAt);
    }
  }
  const lastActivityByZone = mergeMaxDateMaps(
    bucketMaxDateByParentUnit(branchLastActivity, branchToZone),
    regionLastActivityByZone
  );
  const latestFollowUpByRecipient = new Map<string, (typeof latestFollowUpTargets)[number]>();
  for (const target of latestFollowUpTargets) {
    if (!target.recipientUserId) continue;
    if (!latestFollowUpByRecipient.has(target.recipientUserId)) {
      latestFollowUpByRecipient.set(target.recipientUserId, target);
    }
  }

  const now = new Date();

  const dashboardZones: GmDashboardZone[] = zones.map((zone, i) => {
    const { leadsByStage, totalLeads } = fillAllStages(byZone.get(zone.id) ?? {});
    const lastLeadUpdateAt = lastActivityByZone.get(zone.id) ?? null;
    const latestFollowUp = zone.zm ? latestFollowUpByRecipient.get(zone.zm.id) ?? null : null;
    const updateStatus = deriveBranchUpdateStatus({
      lastLeadUpdateAt,
      latestFollowUpSentAt: latestFollowUp?.sentAt ?? null,
      now,
    });
    return {
      id: zone.id,
      name: zone.name,
      zm: zone.zm ? { id: zone.zm.id, name: zone.zm.name } : null,
      branchCount: branchesByZone[i].length,
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
    zones: dashboardZones,
    summary: {
      totalZones: dashboardZones.length,
      totalBranches: dashboardZones.reduce((sum, z) => sum + z.branchCount, 0),
      totalLeads: dashboardZones.reduce((sum, z) => sum + z.totalLeads, 0),
      zonesRequiringUpdate: dashboardZones.filter((z) => z.updateStatus === 'UPDATE_REQUIRED').length,
      zonesWithFollowUpInFlight: dashboardZones.filter((z) => z.updateStatus === 'FOLLOW_UP_INITIATED').length,
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

export interface RegionDetailLead {
  id: string;
  sourceSrNo: string | null;
  customerName: string;
  cbiPesStage: string;
}

export interface RegionDetail {
  region: { id: string; name: string };
  totalLeads: number;
  leadsByStage: Record<string, number>;
  branches: RegionDetailBranch[];
  // Leads assigned directly to this region rather than any one branch —
  // reachable here so an RM/ZM/GM can actually tap into and update them
  // (Full-Hierarchy Expansion plan).
  regionLeads: RegionDetailLead[];
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
  const [stageCounts, regionDirectStageCounts, regionLeads] = await Promise.all([
    countLeadsByStageForBranches(branchIds),
    countLeadsByStageForRegions([regionId]),
    findLeadsDirectlyInRegions([regionId]),
  ]);

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
  const regionDirect = bucketRegionDirectCounts(regionDirectStageCounts).get(regionId) ?? {};
  for (const stage of ALL_STAGES) {
    combined[stage] = (combined[stage] ?? 0) + (regionDirect[stage] ?? 0);
  }
  const { leadsByStage, totalLeads } = fillAllStages(combined);

  return {
    region: { id: region.id, name: region.name },
    totalLeads,
    leadsByStage,
    branches: branchDetails,
    regionLeads: regionLeads.map((l) => ({
      id: l.id,
      sourceSrNo: l.sourceSrNo,
      customerName: l.customerName,
      cbiPesStage: l.cbiPesStage,
    })),
  };
}

export interface MyLeadsResult {
  scopeLabel: string; // e.g. "Region A1" or "Zone North" — for the screen header
  leads: RegionDetailLead[];
}

// The RM/ZM equivalent of a BM's own lead list (spec: Full-Hierarchy
// Expansion — RM and ZM need a "my leads" page just like BM's, backing a
// dedicated Voice/Manual Update entry point). An RM's own leads are those
// assigned directly to their region; a ZM's own leads are every region's
// direct leads across their whole zone (a zone can never own a lead
// directly — see the leads_org_assignment_check constraint — so this is
// the correct, complete "leads I can propose updates on that aren't
// already a specific BM's" set for a ZM).
export async function getMyLeads(user: AuthTokenPayload): Promise<MyLeadsResult> {
  if (user.role === 'RM') {
    if (!user.regionId) throw new NotFoundError('Region assignment');
    const region = await findRegionById(user.regionId);
    if (!region) throw new NotFoundError('Region');
    const leads = await findLeadsDirectlyInRegions([user.regionId]);
    return {
      scopeLabel: region.name,
      leads: leads.map((l) => ({
        id: l.id,
        sourceSrNo: l.sourceSrNo,
        customerName: l.customerName,
        cbiPesStage: l.cbiPesStage,
      })),
    };
  }

  if (user.role === 'ZM') {
    if (!user.zoneId) throw new NotFoundError('Zone assignment');
    const zone = await findZoneById(user.zoneId);
    if (!zone) throw new NotFoundError('Zone');
    const regions = await findRegionsByZone(user.zoneId);
    const leads = await findLeadsDirectlyInRegions(regions.map((r) => r.id));
    return {
      scopeLabel: zone.name,
      leads: leads.map((l) => ({
        id: l.id,
        sourceSrNo: l.sourceSrNo,
        customerName: l.customerName,
        cbiPesStage: l.cbiPesStage,
      })),
    };
  }

  throw new AuthorizationError('This role has no personal lead list');
}

export interface ZoneDetailRegion {
  id: string;
  name: string;
  branchCount: number;
  totalLeads: number;
  leadsByStage: Record<string, number>;
}

export interface ZoneDetailBranch {
  id: string;
  name: string;
  bm: { id: string; name: string } | null;
  totalLeads: number;
  leadsByStage: Record<string, number>;
  region: { id: string; name: string };
}

export interface ZoneDetail {
  zone: { id: string; name: string };
  totalLeads: number;
  leadsByStage: Record<string, number>;
  regions: ZoneDetailRegion[];
  // Leads assigned directly to any region in this zone (a zone can never
  // own a lead directly — see leads_org_assignment_check) — this is "the
  // zone's own leads" in the only sense the schema supports, same set
  // getMyLeads returns for a ZM viewing their own zone.
  zoneLeads: RegionDetailLead[];
  // Every branch across every region in the zone, flattened — backs the
  // zone-level "Branches" tab so CO/ZM can skip-level select branches
  // directly without drilling into each region first.
  zoneBranches: ZoneDetailBranch[];
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
  const regionIds = regions.map((r) => r.id);
  const branchesByRegion = await Promise.all(regions.map((r) => findBranchesByRegion(r.id)));

  const branchToRegion = new Map<string, string>();
  const allBranchIds: string[] = [];
  regions.forEach((region, i) => {
    for (const branch of branchesByRegion[i]) {
      branchToRegion.set(branch.id, region.id);
      allBranchIds.push(branch.id);
    }
  });

  const [stageCounts, regionDirectStageCounts, zoneLeads] = await Promise.all([
    countLeadsByStageForBranches(allBranchIds),
    countLeadsByStageForRegions(regionIds),
    findLeadsDirectlyInRegions(regionIds),
  ]);
  const regionDirectByRegion = bucketRegionDirectCounts(regionDirectStageCounts);
  const byRegion = mergeStageCountMaps(bucketStageCountsByParentUnit(stageCounts, branchToRegion), regionDirectByRegion);

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

  const stageCountsByBranch = new Map<string, Record<string, number>>();
  for (const row of stageCounts) {
    const existing = stageCountsByBranch.get(row.branchId) ?? {};
    existing[row.cbiPesStage] = row.count;
    stageCountsByBranch.set(row.branchId, existing);
  }
  const zoneBranches: ZoneDetailBranch[] = regions.flatMap((region, i) =>
    branchesByRegion[i].map((branch) => {
      const { leadsByStage, totalLeads } = fillAllStages(stageCountsByBranch.get(branch.id) ?? {});
      return {
        id: branch.id,
        name: branch.name,
        bm: branch.bm ? { id: branch.bm.id, name: branch.bm.name } : null,
        totalLeads,
        leadsByStage,
        region: { id: region.id, name: region.name },
      };
    })
  );

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
    zoneLeads: zoneLeads.map((l) => ({
      id: l.id,
      sourceSrNo: l.sourceSrNo,
      customerName: l.customerName,
      cbiPesStage: l.cbiPesStage,
    })),
    zoneBranches,
  };
}
