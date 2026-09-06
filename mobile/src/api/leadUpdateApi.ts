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
  return apiRequest<LeadUpdateProposal>(`/lead-updates/leads/${leadId}/proposals`, {
    method: 'POST',
    body: { proposedStage, remarks },
  });
}

export function fetchProposalsForLead(leadId: string): Promise<LeadUpdateProposal[]> {
  return apiRequest<LeadUpdateProposal[]>(`/lead-updates/leads/${leadId}/proposals`);
}

export function fetchLeadActivity(leadId: string): Promise<LeadActivityEntry[]> {
  // Shared endpoint (Phase 5) — authorized for both RM and BM, each
  // within their own region/branch scope. Supersedes the old
  // BM-only /bm/leads/:id/activity route, which is left in place on the
  // backend for compatibility but is no longer called from here.
  return apiRequest<LeadActivityEntry[]>(`/leads/${leadId}/activity`);
}

export function fetchMyPendingProposals(status?: ProposalStatus): Promise<LeadUpdateProposal[]> {
  return apiRequest<LeadUpdateProposal[]>('/lead-updates/proposals', { query: status ? { status } : undefined });
}

export function confirmProposal(proposalId: string): Promise<unknown> {
  return apiRequest(`/lead-updates/proposals/${proposalId}/confirm`, { method: 'POST' });
}

export function confirmProposalsBatch(proposalIds: string[]): Promise<BatchConfirmResultItem[]> {
  return apiRequest<BatchConfirmResultItem[]>('/lead-updates/proposals/confirm-batch', {
    method: 'POST',
    body: { proposalIds },
  });
}

export function rejectProposal(proposalId: string): Promise<unknown> {
  return apiRequest(`/lead-updates/proposals/${proposalId}/reject`, { method: 'POST' });
}
