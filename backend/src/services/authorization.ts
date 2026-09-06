import { AuthTokenPayload, Role } from '../types/domain';

// This module is the single source of truth for "who is allowed to see
// what" (spec sections 9, 27, 28, 49). It is deliberately pure — no
// Express, no Prisma — so it can be unit tested in isolation and reused
// identically by every route/controller/service that needs a scope check.
//
// The rule, restated from the spec and extended for the full hierarchy
// (GM -> ZM -> RM -> BM):
//   - A BM assigned to Branch Y may access Branch Y and every Lead
//     belonging to Branch Y. A BM has no region/zone-level access.
//   - An RM assigned to Region X may access Region X, every Branch under
//     Region X, and every Lead under those branches or under Region X
//     itself (region-level leads).
//   - A ZM assigned to Zone Z may access Zone Z, every Region/Branch
//     under Zone Z, and every Lead under them.
//   - CO (General Manager) always has full org-wide access.
//   - Authorization must use BOTH role AND organizational scope — never
//     `if (role === 'RM')` alone.

export function canAccessZone(user: AuthTokenPayload, zoneId: string): boolean {
  if (user.role === 'CO') return true;
  if (user.role !== 'ZM') return false;
  return user.zoneId === zoneId;
}

// regionZoneId is the zoneId that the target region actually belongs to
// (looked up from the database by the caller) — never trust a
// caller-supplied zoneId for this check.
export function canAccessRegion(
  user: AuthTokenPayload,
  regionId: string,
  regionZoneId?: string
): boolean {
  if (user.role === 'CO') return true;
  if (user.role === 'ZM') return regionZoneId !== undefined && user.zoneId === regionZoneId;
  if (user.role !== 'RM') return false;
  return user.regionId === regionId;
}

// branchRegionId is the regionId that the target branch actually belongs
// to, and branchZoneId is that region's zoneId (both looked up from the
// database by the caller) — never trust caller-supplied ids for this
// check.
export function canAccessBranch(
  user: AuthTokenPayload,
  branchId: string,
  branchRegionId: string,
  branchZoneId?: string
): boolean {
  if (user.role === 'CO') return true;
  if (user.role === 'BM') {
    return user.branchId === branchId;
  }
  if (user.role === 'RM') {
    return user.regionId === branchRegionId;
  }
  if (user.role === 'ZM') {
    return branchZoneId !== undefined && user.zoneId === branchZoneId;
  }
  return false;
}

// A lead belongs to exactly one of a branch, a region, or a zone (see
// schema). The caller must supply the lead's actual organizational
// ownership as looked up from the database.
export interface LeadOwnership {
  branchId: string | null;
  // regionId of the branch the lead belongs to, OR the region the lead is
  // directly assigned to when it has no branch. Always populated by the
  // repository layer so this function never has to reach into the DB.
  effectiveRegionId: string | null;
  // zoneId of the branch/region the lead belongs to, OR the zone the
  // lead is directly assigned to when it has neither. Always populated
  // by the repository layer alongside effectiveRegionId.
  effectiveZoneId: string | null;
}

export function canAccessLead(user: AuthTokenPayload, lead: LeadOwnership): boolean {
  if (user.role === 'CO') return true;
  if (user.role === 'BM') {
    return lead.branchId !== null && lead.branchId === user.branchId;
  }
  if (user.role === 'RM') {
    return lead.effectiveRegionId !== null && lead.effectiveRegionId === user.regionId;
  }
  if (user.role === 'ZM') {
    return lead.effectiveZoneId !== null && lead.effectiveZoneId === user.zoneId;
  }
  return false;
}

// Strict-descendant check for "can `sender` initiate a follow-up
// addressed to `recipient`": RM -> BM only within RM's own region;
// ZM -> RM or ZM -> BM within ZM's own zone; CO -> ZM/RM/BM anywhere;
// everything else (including BM, who never initiates) is false.
// recipient's org ids must be the recipient's actual assignment as
// looked up from the database — never trust caller-supplied ids.
export function canInitiateFollowUpTo(
  sender: AuthTokenPayload,
  recipient: { role: Role; branchId?: string | null; regionId?: string | null; zoneId?: string | null }
): boolean {
  if (sender.role === 'CO') {
    return recipient.role === 'ZM' || recipient.role === 'RM' || recipient.role === 'BM';
  }
  if (sender.role === 'ZM') {
    if (recipient.role === 'RM') {
      return !!recipient.regionId && recipient.zoneId === sender.zoneId;
    }
    if (recipient.role === 'BM') {
      return !!recipient.branchId && recipient.zoneId === sender.zoneId;
    }
    return false;
  }
  if (sender.role === 'RM') {
    return recipient.role === 'BM' && !!recipient.branchId && recipient.regionId === sender.regionId;
  }
  return false;
}
