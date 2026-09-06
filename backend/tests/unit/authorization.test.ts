import {
  canAccessZone,
  canAccessRegion,
  canAccessBranch,
  canAccessLead,
  canInitiateFollowUpTo,
} from '../../src/services/authorization';
import { AuthTokenPayload } from '../../src/types/domain';

// Mirrors tests/integration/fixtures.ts's org structure: Zone A contains
// Region A1/A2, Zone B contains Region B1.
const rmA1: AuthTokenPayload = { userId: 'u1', username: 'rm.a1', role: 'RM', regionId: 'region-A1' };
const rmA2: AuthTokenPayload = { userId: 'u2', username: 'rm.a2', role: 'RM', regionId: 'region-A2' };
const bmA101: AuthTokenPayload = { userId: 'u3', username: 'bm.a101', role: 'BM', branchId: 'branch-A101' };
const bmB101: AuthTokenPayload = { userId: 'u4', username: 'bm.b101', role: 'BM', branchId: 'branch-B101' };
const zmA: AuthTokenPayload = { userId: 'u5', username: 'zm.a', role: 'ZM', zoneId: 'zone-A' };
const zmB: AuthTokenPayload = { userId: 'u6', username: 'zm.b', role: 'ZM', zoneId: 'zone-B' };
const co: AuthTokenPayload = { userId: 'u7', username: 'gm', role: 'CO' };

describe('canAccessZone', () => {
  it('allows a ZM to access their own zone', () => {
    expect(canAccessZone(zmA, 'zone-A')).toBe(true);
  });

  it('denies a ZM access to a different zone', () => {
    expect(canAccessZone(zmA, 'zone-B')).toBe(false);
  });

  it('allows CO to access any zone', () => {
    expect(canAccessZone(co, 'zone-A')).toBe(true);
    expect(canAccessZone(co, 'zone-B')).toBe(true);
  });

  it('denies an RM/BM access to any zone (role-based deny)', () => {
    expect(canAccessZone(rmA1, 'zone-A')).toBe(false);
    expect(canAccessZone(bmA101, 'zone-A')).toBe(false);
  });
});

describe('canAccessRegion', () => {
  it('allows an RM to access their own region', () => {
    expect(canAccessRegion(rmA1, 'region-A1')).toBe(true);
  });

  it('denies an RM access to a different region', () => {
    expect(canAccessRegion(rmA1, 'region-A2')).toBe(false);
  });

  it('denies a BM access to any region (role-based deny)', () => {
    expect(canAccessRegion(bmA101, 'region-A1')).toBe(false);
  });

  it('allows a ZM to access any region within their zone (regionZoneId supplied)', () => {
    expect(canAccessRegion(zmA, 'region-A1', 'zone-A')).toBe(true);
    expect(canAccessRegion(zmA, 'region-A2', 'zone-A')).toBe(true);
  });

  it('denies a ZM access to a region outside their zone', () => {
    expect(canAccessRegion(zmA, 'region-B1', 'zone-B')).toBe(false);
  });

  it('denies a ZM when regionZoneId is not supplied (defensive: never assume)', () => {
    expect(canAccessRegion(zmA, 'region-A1')).toBe(false);
  });

  it('allows CO to access any region regardless of regionZoneId', () => {
    expect(canAccessRegion(co, 'region-A1')).toBe(true);
    expect(canAccessRegion(co, 'region-B1', 'zone-B')).toBe(true);
  });
});

describe('canAccessBranch', () => {
  it('allows a BM to access their own branch', () => {
    expect(canAccessBranch(bmA101, 'branch-A101', 'region-A1')).toBe(true);
  });

  it('denies a BM access to a different branch even in the same region', () => {
    expect(canAccessBranch(bmA101, 'branch-A102', 'region-A1')).toBe(false);
  });

  it('allows an RM to access any branch within their region', () => {
    expect(canAccessBranch(rmA1, 'branch-A101', 'region-A1')).toBe(true);
    expect(canAccessBranch(rmA1, 'branch-A102', 'region-A1')).toBe(true);
  });

  it('denies an RM access to a branch outside their region', () => {
    expect(canAccessBranch(rmA1, 'branch-A201', 'region-A2')).toBe(false);
  });

  it('denies access when the branchRegionId does not match, even if branch ids collide accidentally', () => {
    // Defensive: the check must use the authoritative branchRegionId
    // looked up from the DB, not anything client-supplied.
    expect(canAccessBranch(rmA2, 'branch-A101', 'region-A1')).toBe(false);
  });

  it('allows a ZM to access any branch within their zone (branchZoneId supplied)', () => {
    expect(canAccessBranch(zmA, 'branch-A101', 'region-A1', 'zone-A')).toBe(true);
  });

  it('denies a ZM access to a branch outside their zone', () => {
    expect(canAccessBranch(zmA, 'branch-B101', 'region-B1', 'zone-B')).toBe(false);
  });

  it('allows CO to access any branch', () => {
    expect(canAccessBranch(co, 'branch-A101', 'region-A1')).toBe(true);
    expect(canAccessBranch(co, 'branch-B101', 'region-B1', 'zone-B')).toBe(true);
  });
});

describe('canAccessLead', () => {
  it('allows a BM to access a lead owned by their branch', () => {
    expect(
      canAccessLead(bmA101, { branchId: 'branch-A101', effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })
    ).toBe(true);
  });

  it('denies a BM access to a lead owned by a different branch', () => {
    expect(
      canAccessLead(bmA101, { branchId: 'branch-A102', effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })
    ).toBe(false);
  });

  it('denies a BM access to a region-level lead (no branch)', () => {
    expect(canAccessLead(bmA101, { branchId: null, effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })).toBe(
      false
    );
  });

  it('allows an RM to access a branch-level lead within their region', () => {
    expect(
      canAccessLead(rmA1, { branchId: 'branch-A101', effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })
    ).toBe(true);
  });

  it('allows an RM to access a region-level lead within their region', () => {
    expect(canAccessLead(rmA1, { branchId: null, effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })).toBe(
      true
    );
  });

  it('denies an RM access to a lead in a different region', () => {
    expect(
      canAccessLead(rmA1, { branchId: 'branch-A201', effectiveRegionId: 'region-A2', effectiveZoneId: 'zone-A' })
    ).toBe(false);
  });

  it('denies cross-zone access between unrelated RMs/BMs (full matrix spot check, spec section 49)', () => {
    expect(
      canAccessLead(bmB101, { branchId: 'branch-A101', effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })
    ).toBe(false);
    expect(
      canAccessLead(rmA2, { branchId: 'branch-B101', effectiveRegionId: 'region-B1', effectiveZoneId: 'zone-B' })
    ).toBe(false);
  });

  it('allows a ZM to access any lead within their zone, at any org level', () => {
    expect(
      canAccessLead(zmA, { branchId: 'branch-A101', effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })
    ).toBe(true);
    expect(canAccessLead(zmA, { branchId: null, effectiveRegionId: 'region-A2', effectiveZoneId: 'zone-A' })).toBe(
      true
    );
    expect(canAccessLead(zmA, { branchId: null, effectiveRegionId: null, effectiveZoneId: 'zone-A' })).toBe(true);
  });

  it('denies a ZM access to a lead outside their zone', () => {
    expect(
      canAccessLead(zmA, { branchId: 'branch-B101', effectiveRegionId: 'region-B1', effectiveZoneId: 'zone-B' })
    ).toBe(false);
  });

  it('allows CO to access any lead regardless of org level', () => {
    expect(
      canAccessLead(co, { branchId: 'branch-A101', effectiveRegionId: 'region-A1', effectiveZoneId: 'zone-A' })
    ).toBe(true);
    expect(canAccessLead(co, { branchId: null, effectiveRegionId: null, effectiveZoneId: null })).toBe(true);
  });
});

describe('canInitiateFollowUpTo', () => {
  it('allows an RM to initiate a follow-up to a BM in their own region', () => {
    expect(
      canInitiateFollowUpTo(rmA1, { role: 'BM', branchId: 'branch-A101', regionId: 'region-A1', zoneId: 'zone-A' })
    ).toBe(true);
  });

  it('denies an RM initiating to a BM outside their region', () => {
    expect(
      canInitiateFollowUpTo(rmA1, { role: 'BM', branchId: 'branch-A201', regionId: 'region-A2', zoneId: 'zone-A' })
    ).toBe(false);
  });

  it('denies an RM initiating to another RM (RM has no downward RM target)', () => {
    expect(canInitiateFollowUpTo(rmA1, { role: 'RM', regionId: 'region-A2', zoneId: 'zone-A' })).toBe(false);
  });

  it('allows a ZM to initiate a follow-up to an RM in their own zone', () => {
    expect(canInitiateFollowUpTo(zmA, { role: 'RM', regionId: 'region-A1', zoneId: 'zone-A' })).toBe(true);
  });

  it('allows a ZM to initiate a follow-up to a BM in their own zone (skip-level)', () => {
    expect(
      canInitiateFollowUpTo(zmA, { role: 'BM', branchId: 'branch-A101', regionId: 'region-A1', zoneId: 'zone-A' })
    ).toBe(true);
  });

  it('denies a ZM initiating to an RM/BM outside their zone', () => {
    expect(canInitiateFollowUpTo(zmA, { role: 'RM', regionId: 'region-B1', zoneId: 'zone-B' })).toBe(false);
    expect(
      canInitiateFollowUpTo(zmA, { role: 'BM', branchId: 'branch-B101', regionId: 'region-B1', zoneId: 'zone-B' })
    ).toBe(false);
  });

  it('allows a different ZM to initiate within their own (different) zone', () => {
    expect(canInitiateFollowUpTo(zmB, { role: 'RM', regionId: 'region-B1', zoneId: 'zone-B' })).toBe(true);
  });

  it('allows CO to initiate a follow-up to a ZM, RM, or BM anywhere', () => {
    expect(canInitiateFollowUpTo(co, { role: 'ZM', zoneId: 'zone-A' })).toBe(true);
    expect(canInitiateFollowUpTo(co, { role: 'RM', regionId: 'region-B1', zoneId: 'zone-B' })).toBe(true);
    expect(
      canInitiateFollowUpTo(co, { role: 'BM', branchId: 'branch-A101', regionId: 'region-A1', zoneId: 'zone-A' })
    ).toBe(true);
  });

  it('denies a BM initiating any follow-up (BM never initiates)', () => {
    expect(canInitiateFollowUpTo(bmA101, { role: 'BM', branchId: 'branch-A102' })).toBe(false);
  });

  it('denies when the recipient is missing the org id the sender/recipient-role pair requires', () => {
    // An RM claiming a BM target with no branchId at all is malformed —
    // never trust a recipient shape that doesn't actually resolve.
    expect(canInitiateFollowUpTo(rmA1, { role: 'BM', regionId: 'region-A1', zoneId: 'zone-A' })).toBe(false);
  });
});
