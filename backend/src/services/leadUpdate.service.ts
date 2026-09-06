import { PipelineStage, ProposalStatus } from '@prisma/client';
import {
  findLeadById,
  createProposal,
  findProposalById,
  findProposalsForLead,
  findProposalsByProposer,
  confirmProposalTransaction,
  rejectProposalById,
  findActivityForLead,
} from '../repositories/leadUpdate.repository';
import { AuthTokenPayload } from '../types/domain';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../utils/AppError';
import { canAccessLead, LeadOwnership } from './authorization';

const VALID_STAGES: PipelineStage[] = [
  'LEAD_CONFIRMED',
  'DOCUMENTS_RECEIVED',
  'BRANCH_PROCESSING',
  'SANCTIONED',
  'TO_RAC',
  'APPROVED',
  'DISBURSED',
];

function ownershipOf(lead: {
  branchId: string | null;
  regionId: string | null;
  branch: { regionId: string; region: { zoneId: string } } | null;
  region: { zoneId: string } | null;
}): LeadOwnership {
  return {
    branchId: lead.branchId,
    effectiveRegionId: lead.regionId ?? lead.branch?.regionId ?? null,
    effectiveZoneId: lead.region?.zoneId ?? lead.branch?.region.zoneId ?? null,
  };
}

// The one and only place authorization is checked before touching a
// lead's proposals — generalized from a BM-only check to a direct reuse
// of the read-side canAccessLead scope check (BM: own branch; RM: own
// region; ZM: own zone; the exact generalization the original comment
// here explicitly said not to do, because RM/ZM had no write access at
// all — now they do, so the reuse is correct). GM never proposes updates
// (canAccessLead's CO branch grants read access org-wide, but GM has no
// route wired to this function at all — see routes).
export async function assertCanProposeOnLead(user: AuthTokenPayload, leadId: string) {
  const lead = await findLeadById(leadId);
  if (!lead) throw new NotFoundError('Lead');
  if (!canAccessLead(user, ownershipOf(lead))) {
    throw new AuthorizationError('You are not authorized to update this lead');
  }
  return lead;
}

// Read-only viewing (spec Phase 5 section 5: RM must be able to inspect
// a lead the same way a BM can, without gaining BM-only write actions).
// Reuses the exact same canAccessLead scope check the Phase 1 lead
// endpoints use — rather than introducing a second authorization
// framework.
async function assertCanViewLead(user: AuthTokenPayload, leadId: string) {
  const lead = await findLeadById(leadId);
  if (!lead) throw new NotFoundError('Lead');
  if (!canAccessLead(user, ownershipOf(lead))) {
    throw new AuthorizationError('You are not authorized to view this lead');
  }
  return lead;
}

export interface CreateManualProposalInput {
  leadId: string;
  proposedStage: PipelineStage;
  remarks?: string;
}

export async function createManualProposal(user: AuthTokenPayload, input: CreateManualProposalInput) {
  if (!VALID_STAGES.includes(input.proposedStage)) {
    throw new ValidationError('Invalid pipeline stage');
  }
  const lead = await assertCanProposeOnLead(user, input.leadId);

  return createProposal({
    leadId: lead.id,
    proposedByUserId: user.userId,
    source: 'MANUAL',
    previousStage: lead.cbiPesStage,
    proposedStage: input.proposedStage,
    remarks: input.remarks?.trim() || null,
  });
}

// Reused verbatim by the voice pipeline (voiceUpdate.service.ts) for
// each candidate the proposer accepts — this is the "same creation path"
// spec section 5 requires; the only difference is source/voiceSessionId.
export interface CreateProposalFromAnySourceInput {
  leadId: string;
  proposedStage: PipelineStage;
  remarks?: string;
  source: 'MANUAL' | 'VOICE_AI';
  voiceSessionId?: string;
  transcriptExcerpt?: string;
}

export async function createProposalFromAnySource(
  user: AuthTokenPayload,
  input: CreateProposalFromAnySourceInput
) {
  if (!VALID_STAGES.includes(input.proposedStage)) {
    throw new ValidationError('Invalid pipeline stage');
  }
  const lead = await assertCanProposeOnLead(user, input.leadId);

  return createProposal({
    leadId: lead.id,
    proposedByUserId: user.userId,
    source: input.source,
    previousStage: lead.cbiPesStage,
    proposedStage: input.proposedStage,
    remarks: input.remarks?.trim() || null,
    voiceSessionId: input.voiceSessionId ?? null,
    transcriptExcerpt: input.transcriptExcerpt ?? null,
  });
}

export async function listProposalsForLead(user: AuthTokenPayload, leadId: string) {
  await assertCanProposeOnLead(user, leadId);
  return findProposalsForLead(leadId);
}

// Self-confirm-by-authority (Full-Hierarchy Expansion plan, decision 2):
// "proposals I personally created that are still pending" — not "all
// pending in my branch/region/zone". This is the mechanism that makes
// voice review self-scoped for RM/ZM, and is backward-compatible for BM
// (a BM can only ever create proposals for their own branch anyway, so
// this returns identical results to the old branch-scoped query for
// existing BM users).
export async function listMyPendingProposals(user: AuthTokenPayload, status?: ProposalStatus) {
  if (!['BM', 'RM', 'ZM'].includes(user.role)) {
    throw new AuthorizationError('This role has no proposal review queue');
  }
  return findProposalsByProposer(user.userId, status);
}

async function assertCanActOnProposal(user: AuthTokenPayload, proposalId: string) {
  const proposal = await findProposalById(proposalId);
  if (!proposal) throw new NotFoundError('Proposal');
  if (!canAccessLead(user, ownershipOf(proposal.lead))) {
    throw new AuthorizationError('You are not authorized to act on this proposal');
  }
  // Self-confirm-by-authority: a proposer confirms only their OWN
  // proposal, never one someone else (even a subordinate in scope)
  // created — e.g. an RM's voice update on a branch's lead is never
  // routed to that branch's BM for approval, and equally a BM cannot
  // confirm a proposal an RM created on a lead in the BM's own branch.
  if (proposal.proposedByUserId !== user.userId) {
    throw new AuthorizationError('You are not authorized to act on this proposal');
  }
  if (proposal.status !== 'PENDING') {
    throw new AppError(409, 'PROPOSAL_NOT_PENDING', `Proposal is already ${proposal.status.toLowerCase()}`);
  }
  return proposal;
}

// The single confirmation code path (spec section 5/29's "core
// architectural principle") — identical whether the proposal came from
// the manual flow or the voice flow, because by the time a proposal
// reaches PENDING status, its source is just a label, not a different
// code path.
export async function confirmProposal(user: AuthTokenPayload, proposalId: string) {
  await assertCanActOnProposal(user, proposalId);
  const result = await confirmProposalTransaction(proposalId);
  if (!result) throw new NotFoundError('Proposal');
  return result;
}

export async function confirmProposalsBatch(user: AuthTokenPayload, proposalIds: string[]) {
  if (proposalIds.length === 0) {
    throw new ValidationError('At least one proposal id must be provided');
  }
  const results = [];
  for (const id of proposalIds) {
    // Sequential, not Promise.all: each confirmation is its own
    // transaction and we want a clear per-item result even if one fails
    // partway through a batch (spec section 24's "partial failure"
    // handling, applied here to batch confirmation).
    // eslint-disable-next-line no-await-in-loop
    try {
      await assertCanActOnProposal(user, id);
      // eslint-disable-next-line no-await-in-loop
      const result = await confirmProposalTransaction(id);
      results.push({ proposalId: id, success: true, result });
    } catch (err) {
      results.push({
        proposalId: id,
        success: false,
        error: err instanceof AppError ? err.message : 'Could not confirm this proposal',
      });
    }
  }
  return results;
}

export async function rejectProposal(user: AuthTokenPayload, proposalId: string) {
  await assertCanActOnProposal(user, proposalId);
  return rejectProposalById(proposalId);
}

export async function getLeadActivity(user: AuthTokenPayload, leadId: string) {
  await assertCanProposeOnLead(user, leadId);
  return findActivityForLead(leadId);
}

// The shared, view-only counterpart used by every role (spec Phase 5
// section 5) — RM/ZM/CO's lead-detail screen and BM's lead-detail screen
// all call this via the same GET /api/leads/:leadId/activity route.
export async function getLeadActivityForViewer(user: AuthTokenPayload, leadId: string) {
  await assertCanViewLead(user, leadId);
  return findActivityForLead(leadId);
}
