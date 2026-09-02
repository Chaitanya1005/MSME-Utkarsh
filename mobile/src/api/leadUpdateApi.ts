import { apiRequest } from './client';
import {
  LeadUpdateProposal,
  LeadActivityEntry,
  BatchConfirmResultItem,
  ProposalStatus,
  PipelineStage,
} from '../types/api';

export function createManualProposal(
  leadId: string,
  proposedStage: PipelineStage,
  remarks?: string
): Promise<LeadUpdateProposal> {
  return apiRequest<LeadUpdateProposal>(`/bm/leads/${leadId}/proposals`, {
    method: 'POST',
    body: { proposedStage, remarks },
  });
}

export function fetchProposalsForLead(leadId: string): Promise<LeadUpdateProposal[]> {
  return apiRequest<LeadUpdateProposal[]>(`/bm/leads/${leadId}/proposals`);
}

export function fetchLeadActivity(leadId: string): Promise<LeadActivityEntry[]> {
  // Shared endpoint (Phase 5) — authorized for both RM and BM, each
  // within their own region/branch scope. Supersedes the old
  // BM-only /bm/leads/:id/activity route, which is left in place on the
  // backend for compatibility but is no longer called from here.
  return apiRequest<LeadActivityEntry[]>(`/leads/${leadId}/activity`);
}

export function fetchMyBranchProposals(status?: ProposalStatus): Promise<LeadUpdateProposal[]> {
  return apiRequest<LeadUpdateProposal[]>('/bm/proposals', { query: status ? { status } : undefined });
}

export function confirmProposal(proposalId: string): Promise<unknown> {
  return apiRequest(`/bm/proposals/${proposalId}/confirm`, { method: 'POST' });
}

export function confirmProposalsBatch(proposalIds: string[]): Promise<BatchConfirmResultItem[]> {
  return apiRequest<BatchConfirmResultItem[]>('/bm/proposals/confirm-batch', {
    method: 'POST',
    body: { proposalIds },
  });
}

export function rejectProposal(proposalId: string): Promise<unknown> {
  return apiRequest(`/bm/proposals/${proposalId}/reject`, { method: 'POST' });
}
