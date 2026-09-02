import { canAccessRegion, canAccessBranch, canAccessLead } from '../../src/services/authorization';
import { AuthTokenPayload } from '../../src/types/domain';

const rmA1: AuthTokenPayload = { userId: 'u1', username: 'rm.a1', role: 'RM', regionId: 'region-A1' };
const rmA2: AuthTokenPayload = { userId: 'u2', username: 'rm.a2', role: 'RM', regionId: 'region-A2' };
const bmA101: AuthTokenPayload = { userId: 'u3', username: 'bm.a101', role: 'BM', branchId: 'branch-A101' };
const bmB101: AuthTokenPayload = { userId: 'u4', username: 'bm.b101', role: 'BM', branchId: 'branch-B101' };

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
});

describe('canAccessLead', () => {
  it('allows a BM to access a lead owned by their branch', () => {
    expect(canAccessLead(bmA101, { branchId: 'branch-A101', effectiveRegionId: 'region-A1' })).toBe(true);
  });

  it('denies a BM access to a lead owned by a different branch', () => {
    expect(canAccessLead(bmA101, { branchId: 'branch-A102', effectiveRegionId: 'region-A1' })).toBe(false);
  });

  it('denies a BM access to a region-level lead (no branch)', () => {
    expect(canAccessLead(bmA101, { branchId: null, effectiveRegionId: 'region-A1' })).toBe(false);
  });

  it('allows an RM to access a branch-level lead within their region', () => {
    expect(canAccessLead(rmA1, { branchId: 'branch-A101', effectiveRegionId: 'region-A1' })).toBe(true);
  });

  it('allows an RM to access a region-level lead within their region', () => {
    expect(canAccessLead(rmA1, { branchId: null, effectiveRegionId: 'region-A1' })).toBe(true);
  });

  it('denies an RM access to a lead in a different region', () => {
    expect(canAccessLead(rmA1, { branchId: 'branch-A201', effectiveRegionId: 'region-A2' })).toBe(false);
  });

  it('denies cross-zone access between unrelated RMs/BMs (full matrix spot check, spec section 49)', () => {
    expect(canAccessLead(bmB101, { branchId: 'branch-A101', effectiveRegionId: 'region-A1' })).toBe(false);
    expect(canAccessLead(rmA2, { branchId: 'branch-B101', effectiveRegionId: 'region-B1' })).toBe(false);
  });
});
