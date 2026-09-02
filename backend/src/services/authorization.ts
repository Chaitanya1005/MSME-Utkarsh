import { AuthTokenPayload } from '../types/domain';

// This module is the single source of truth for "who is allowed to see
// what" (spec sections 9, 27, 28, 49). It is deliberately pure — no
// Express, no Prisma — so it can be unit tested in isolation and reused
// identically by every route/controller/service that needs a scope check.
//
// The rule, restated from the spec:
//   - An RM assigned to Region X may access Region X, every Branch under
//     Region X, and every Lead under those branches or under Region X
//     itself (region-level leads).
//   - A BM assigned to Branch Y may access Branch Y and every Lead
//     belonging to Branch Y. A BM has no region-level access.
//   - Authorization must use BOTH role AND organizational scope — never
//     `if (role === 'RM')` alone.

export function canAccessRegion(user: AuthTokenPayload, regionId: string): boolean {
  if (user.role !== 'RM') return false;
  return user.regionId === regionId;
}

// branchRegionId is the regionId that the target branch actually belongs
// to (looked up from the database by the caller) — never trust a
// caller-supplied regionId for this check.
export function canAccessBranch(
  user: AuthTokenPayload,
  branchId: string,
  branchRegionId: string
): boolean {
  if (user.role === 'BM') {
    return user.branchId === branchId;
  }
  if (user.role === 'RM') {
    return user.regionId === branchRegionId;
  }
  return false;
}

// A lead belongs to exactly one of a branch or a region (see schema). The
// caller must supply the lead's actual organizational ownership as looked
// up from the database.
export interface LeadOwnership {
  branchId: string | null;
  // regionId of the branch the lead belongs to, OR the region the lead is
  // directly assigned to when it has no branch. Always populated by the
  // repository layer so this function never has to reach into the DB.
  effectiveRegionId: string | null;
}

export function canAccessLead(user: AuthTokenPayload, lead: LeadOwnership): boolean {
  if (user.role === 'BM') {
    return lead.branchId !== null && lead.branchId === user.branchId;
  }
  if (user.role === 'RM') {
    return lead.effectiveRegionId !== null && lead.effectiveRegionId === user.regionId;
  }
  return false;
}
