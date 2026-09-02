import { apiRequest } from './client';
import { OrgScope, PaginatedLeads, Lead, BranchDetail } from '../types/api';

export function fetchMyScope(): Promise<OrgScope> {
  return apiRequest<OrgScope>('/org/scope');
}

export function fetchBranch(branchId: string): Promise<BranchDetail> {
  return apiRequest<BranchDetail>(`/org/branches/${branchId}`);
}

export interface LeadListParams {
  page?: number;
  pageSize?: number;
  branchId?: string;
  regionId?: string;
  [key: string]: string | number | undefined;
}

export function fetchLeads(params: LeadListParams = {}): Promise<PaginatedLeads> {
  return apiRequest<PaginatedLeads>('/leads', { query: params });
}

export function fetchLead(leadId: string): Promise<Lead> {
  return apiRequest<Lead>(`/leads/${leadId}`);
}
