import { PipelineStage, ProposalStatus } from '@prisma/client';
import {
  findLeadById,
  createProposal,
  findProposalById,
  findProposalsForLead,
  findProposalsForBranch,
  confirmProposalTransaction,
  rejectProposalById,
  findActivityForLead,
} from '../repositories/leadUpdate.repository';
import { AuthTokenPayload } from '../types/domain';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../utils/AppError';
import { canAccessLead } from './authorization';

const VALID_STAGES: PipelineStage[] = ['INTERESTED', 'CONTACTED', 'APPLICATION', 'APPROVAL', 'CONVERSION'];

// The one and only place authorization is checked before touching a
// lead's proposals — a BM may only ever act on leads belonging to their
// own branch (spec section 17). Deliberately NOT reusing canAccessLead's
// RM branch-level logic here: RMs have no Phase 3 write access at all,
// so this is a stricter, BM-specific check rather than a generalization
// of the read-side authorization function.
async function assertBmOwnsLead(user: AuthTokenPayload, leadId: string) {
  if (user.role !== 'BM' || !user.branchId) {
    throw new AuthorizationError('Only a Branch Head may act on lead updates');
  }
  const lead = await findLeadById(leadId);
  if (!lead) throw new NotFoundError('Lead');
  if (lead.branchId !== user.branchId) {
    throw new AuthorizationError('You are not authorized to update this lead');
  }
  return lead;
}

// Read-only viewing (spec Phase 5 section 5: RM must be able to inspect
// a lead the same way a BM can, without gaining BM-only write actions).
// Reuses the exact same canAccessLead scope check the Phase 1 lead
// endpoints use — an RM may view any lead in their region, a BM only
// leads in their own branch — rather than introducing a second
// authorization framework.
async function assertCanViewLead(user: AuthTokenPayload, leadId: string) {
  const lead = await findLeadById(leadId);
  if (!lead) throw new NotFoundError('Lead');

  const effectiveRegionId = lead.regionId ?? lead.branch?.regionId ?? null;
  const allowed = canAccessLead(user, { branchId: lead.branchId, effectiveRegionId });
  if (!allowed) {
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
  const lead = await assertBmOwnsLead(user, input.leadId);

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
// each candidate the BM accepts — this is the "same creation path"
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
  const lead = await assertBmOwnsLead(user, input.leadId);

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
  await assertBmOwnsLead(user, leadId);
  return findProposalsForLead(leadId);
}

export async function listPendingProposalsForMyBranch(user: AuthTokenPayload, status?: ProposalStatus) {
  if (user.role !== 'BM' || !user.branchId) {
    throw new AuthorizationError('Only a Branch Head has a proposal review queue');
  }
  return findProposalsForBranch(user.branchId, status);
}

async function assertBmOwnsProposal(user: AuthTokenPayload, proposalId: string) {
  const proposal = await findProposalById(proposalId);
  if (!proposal) throw new NotFoundError('Proposal');
  if (user.role !== 'BM' || proposal.lead.branchId !== user.branchId) {
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
  await assertBmOwnsProposal(user, proposalId);
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
      await assertBmOwnsProposal(user, id);
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
  await assertBmOwnsProposal(user, proposalId);
  return rejectProposalById(proposalId);
}

export async function getLeadActivity(user: AuthTokenPayload, leadId: string) {
  await assertBmOwnsLead(user, leadId);
  return findActivityForLead(leadId);
}

// The shared, view-only counterpart used by both roles (spec Phase 5
// section 5) — RM's lead-detail screen and BM's lead-detail screen both
// call this via the same GET /api/leads/:leadId/activity route.
export async function getLeadActivityForViewer(user: AuthTokenPayload, leadId: string) {
  await assertCanViewLead(user, leadId);
  return findActivityForLead(leadId);
}
