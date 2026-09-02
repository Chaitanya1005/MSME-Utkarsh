import { findRegionById, findBranchesByRegion, findBranchById } from '../repositories/org.repository';
import { AuthTokenPayload } from '../types/domain';
import { canAccessBranch, canAccessRegion } from './authorization';
import { AuthorizationError, NotFoundError } from '../utils/AppError';

// Returns the caller's own authorized organizational scope: for an RM,
// their region plus every branch in it; for a BM, their branch. This is
// the endpoint the mobile app's post-login "foundation screen" uses
// (spec section 37) — it never needs the client to already know its own
// scope.
export async function getMyScope(user: AuthTokenPayload) {
  if (user.role === 'RM') {
    if (!user.regionId) {
      throw new NotFoundError('Region assignment');
    }
    const region = await findRegionById(user.regionId);
    if (!region) throw new NotFoundError('Region');
    const branches = await findBranchesByRegion(user.regionId);
    return {
      role: 'RM' as const,
      region: { id: region.id, name: region.name, zone: region.zone.name },
      branches: branches.map((b) => ({ id: b.id, name: b.name, bm: b.bm })),
    };
  }

  if (user.role === 'BM') {
    if (!user.branchId) {
      throw new NotFoundError('Branch assignment');
    }
    const branch = await findBranchById(user.branchId);
    if (!branch) throw new NotFoundError('Branch');
    return {
      role: 'BM' as const,
      branch: {
        id: branch.id,
        name: branch.name,
        region: { id: branch.region.id, name: branch.region.name },
      },
    };
  }

  throw new AuthorizationError('This role has no Phase 1 organizational scope');
}

export async function getRegion(user: AuthTokenPayload, regionId: string) {
  if (!canAccessRegion(user, regionId)) {
    throw new AuthorizationError('You are not authorized to access this region');
  }
  const region = await findRegionById(regionId);
  if (!region) throw new NotFoundError('Region');
  return region;
}

export async function getBranchesForRegion(user: AuthTokenPayload, regionId: string) {
  if (!canAccessRegion(user, regionId)) {
    throw new AuthorizationError('You are not authorized to access this region');
  }
  return findBranchesByRegion(regionId);
}

export async function getBranch(user: AuthTokenPayload, branchId: string) {
  const branch = await findBranchById(branchId);
  if (!branch) throw new NotFoundError('Branch');

  if (!canAccessBranch(user, branchId, branch.regionId)) {
    throw new AuthorizationError('You are not authorized to access this branch');
  }
  return branch;
}
