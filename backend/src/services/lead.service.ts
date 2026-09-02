import {
  findLeadsInScope,
  findLeadWithEffectiveRegion,
  LeadListFilters,
  Pagination,
} from '../repositories/lead.repository';
import { findBranchesByRegion } from '../repositories/org.repository';
import { AuthTokenPayload } from '../types/domain';
import { canAccessLead } from './authorization';
import { AuthorizationError, NotFoundError, ValidationError } from '../utils/AppError';
import { PaginatedResult } from '../types/domain';

// Computes the set of branchIds/regionIds this user is actually allowed
// to see leads for. This is the ONLY place lead scope is derived — every
// lead-listing code path must go through it (spec section 27/28).
async function computeLeadScope(user: AuthTokenPayload) {
  if (user.role === 'RM') {
    if (!user.regionId) throw new NotFoundError('Region assignment');
    const branches = await findBranchesByRegion(user.regionId);
    return {
      branchIds: branches.map((b) => b.id),
      regionIds: [user.regionId],
    };
  }
  if (user.role === 'BM') {
    if (!user.branchId) throw new NotFoundError('Branch assignment');
    return { branchIds: [user.branchId], regionIds: [] as string[] };
  }
  throw new AuthorizationError('This role has no Phase 1 lead access');
}

export async function listAuthorizedLeads(
  user: AuthTokenPayload,
  filters: LeadListFilters,
  pagination: Pagination
): Promise<PaginatedResult<unknown>> {
  const scope = await computeLeadScope(user);

  // If the caller passed an explicit branchId/regionId filter, it must
  // itself be within the caller's authorized scope — filters narrow
  // access, they can never widen it.
  if (filters.branchId && !scope.branchIds.includes(filters.branchId)) {
    throw new AuthorizationError('You are not authorized to filter by this branch');
  }
  if (filters.regionId && !scope.regionIds.includes(filters.regionId)) {
    throw new AuthorizationError('You are not authorized to filter by this region');
  }

  const { items, total } = await findLeadsInScope(scope, filters, pagination);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.pageSize);

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages,
  };
}

export async function getAuthorizedLead(user: AuthTokenPayload, leadId: string) {
  const result = await findLeadWithEffectiveRegion(leadId);
  if (!result) throw new NotFoundError('Lead');

  const { lead, effectiveRegionId } = result;

  const allowed = canAccessLead(user, {
    branchId: lead.branchId,
    effectiveRegionId,
  });

  if (!allowed) {
    // This is the critical "changing a URL parameter must not allow
    // unauthorized access" test from spec section 28/49 — a 404 here
    // would leak whether the lead exists at all, so this is a 403.
    throw new AuthorizationError('You are not authorized to access this lead');
  }

  return lead;
}

// Guards against unusable pagination values slipping past coercion in
// edge cases (e.g. pageSize=0 after zod default resolution quirks).
export function assertValidPagination(pagination: Pagination): void {
  if (pagination.page < 1 || pagination.pageSize < 1 || pagination.pageSize > 100) {
    throw new ValidationError('Invalid pagination parameters');
  }
}
