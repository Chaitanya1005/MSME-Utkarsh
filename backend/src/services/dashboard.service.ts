import { findBranchesByRegion, findRegionById } from '../repositories/org.repository';
import {
  countLeadsByStageForBranches,
  findLastLeadActivityForBranches,
} from '../repositories/lead.repository';
import { findLatestFollowUpTargetsForBranches } from '../repositories/followUp.repository';
import { AuthTokenPayload } from '../types/domain';
import { AuthorizationError, NotFoundError } from '../utils/AppError';
import { deriveBranchUpdateStatus, BranchUpdateStatus } from './branchUpdateStatus';

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

const ALL_STAGES = ['INTERESTED', 'CONTACTED', 'APPLICATION', 'APPROVAL', 'CONVERSION'] as const;

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
  // createdAt from the repository).
  const latestFollowUpByBranch = new Map<string, (typeof latestFollowUpTargets)[number]>();
  for (const target of latestFollowUpTargets) {
    if (!latestFollowUpByBranch.has(target.branchId)) {
      latestFollowUpByBranch.set(target.branchId, target);
    }
  }

  const now = new Date();

  const dashboardBranches: DashboardBranch[] = branches.map((branch) => {
    const stageMap = stageCountsByBranch.get(branch.id) ?? {};
    const leadsByStage: Record<string, number> = {};
    let totalLeads = 0;
    for (const stage of ALL_STAGES) {
      const count = stageMap[stage] ?? 0;
      leadsByStage[stage] = count;
      totalLeads += count;
    }

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
