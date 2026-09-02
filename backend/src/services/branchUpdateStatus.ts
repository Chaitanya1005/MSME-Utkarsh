// Pure logic for deriving a branch's Phase 2 dashboard status, kept
// separate from the aggregation queries (dashboard.service.ts) the same
// way authorization.ts is kept separate from org.service.ts — so the
// business rule itself is directly unit-testable without a database.
//
// DOCUMENTED MVP ASSUMPTION (spec section 9 explicitly calls for this to
// be flagged rather than silently invented): Phase 1 has no BM-activity
// timestamp yet (that's Phase 3's manual-update history). The only
// available signal for "has this branch been worked recently" is
// Lead.updatedAt. This heuristic will need to be revisited once Phase 3
// introduces real update events — at that point, "last update" should
// come from the update history, not from Lead.updatedAt.

export type BranchUpdateStatus = 'UPDATE_REQUIRED' | 'FOLLOW_UP_INITIATED' | 'RECENTLY_UPDATED';

// Configurable, not buried as a magic number several calls deep.
export const PENDING_UPDATE_WINDOW_DAYS = 7;

export interface BranchUpdateStatusInput {
  lastLeadUpdateAt: Date | null;
  latestFollowUpSentAt: Date | null;
  now: Date;
}

export function deriveBranchUpdateStatus(input: BranchUpdateStatusInput): BranchUpdateStatus {
  const windowMs = PENDING_UPDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentlyUpdated =
    input.lastLeadUpdateAt !== null && input.now.getTime() - input.lastLeadUpdateAt.getTime() <= windowMs;

  if (recentlyUpdated) {
    return 'RECENTLY_UPDATED';
  }

  // Not recently updated. If a follow-up was sent more recently than the
  // last lead activity (or there's no lead activity at all), the branch
  // has already been prompted and is awaiting a response — don't ask the
  // RM to follow up again on something already in flight.
  const followUpIsMoreRecentThanLastUpdate =
    input.latestFollowUpSentAt !== null &&
    (input.lastLeadUpdateAt === null || input.latestFollowUpSentAt > input.lastLeadUpdateAt);

  if (followUpIsMoreRecentThanLastUpdate) {
    return 'FOLLOW_UP_INITIATED';
  }

  return 'UPDATE_REQUIRED';
}
