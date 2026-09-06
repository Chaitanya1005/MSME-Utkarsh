import { PipelineStage, ProposalStatus, UpdateSource } from '@prisma/client';
import { prisma } from '../config/prisma';

export function findLeadById(leadId: string) {
  return prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      branch: { select: { id: true, regionId: true, name: true, region: { select: { zoneId: true } } } },
      region: { select: { zoneId: true } },
    },
  });
}

export interface CreateProposalInput {
  leadId: string;
  proposedByUserId: string;
  source: UpdateSource;
  previousStage: PipelineStage;
  proposedStage: PipelineStage;
  remarks: string | null;
  voiceSessionId?: string | null;
  transcriptExcerpt?: string | null;
}

export function createProposal(input: CreateProposalInput) {
  return prisma.leadUpdateProposal.create({ data: input });
}

export function findProposalById(proposalId: string) {
  return prisma.leadUpdateProposal.findUnique({
    where: { id: proposalId },
    include: {
      lead: {
        include: {
          branch: { select: { id: true, regionId: true, region: { select: { zoneId: true } } } },
          region: { select: { zoneId: true } },
        },
      },
    },
  });
}

export function findProposalsForLead(leadId: string) {
  return prisma.leadUpdateProposal.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
  });
}

// Pending (or otherwise filtered) proposals personally created by one
// proposer, across every lead in their scope — used by the "review
// updates" screen, which spans both manual and voice-sourced proposals
// identically (spec section 5's unified model). Self-scoped rather than
// branch-scoped so RM/ZM voice review only ever surfaces proposals they
// themselves created (self-confirm-by-authority — see
// leadUpdate.service.ts#listMyPendingProposals), and is backward
// compatible for BM: a BM can only ever create proposals for their own
// branch, so this returns the same rows `findProposalsForBranch` used to.
export function findProposalsByProposer(proposedByUserId: string, status?: ProposalStatus) {
  return prisma.leadUpdateProposal.findMany({
    where: {
      status,
      proposedByUserId,
    },
    orderBy: { createdAt: 'desc' },
    include: { lead: { select: { id: true, customerName: true, subProductName: true } } },
  });
}

// Confirms a proposal, updates the lead's stage, and records the
// immutable activity entry — all in one transaction, so a partial write
// (proposal confirmed but lead not updated, or vice versa) can never
// happen (spec section 5's persistence step).
export async function confirmProposalTransaction(proposalId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.leadUpdateProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) return null;

    const confirmedAt = new Date();

    const [updatedProposal] = await Promise.all([
      tx.leadUpdateProposal.update({
        where: { id: proposalId },
        data: { status: 'CONFIRMED', confirmedAt },
      }),
      tx.lead.update({
        where: { id: proposal.leadId },
        data: { cbiPesStage: proposal.proposedStage },
      }),
    ]);

    const activity = await tx.leadActivity.create({
      data: {
        leadId: proposal.leadId,
        previousStage: proposal.previousStage,
        newStage: proposal.proposedStage,
        remarks: proposal.remarks,
        performedByUserId: proposal.proposedByUserId,
        source: proposal.source,
        proposalId: proposal.id,
      },
    });

    return { proposal: updatedProposal, activity };
  });
}

export function rejectProposalById(proposalId: string) {
  return prisma.leadUpdateProposal.update({
    where: { id: proposalId },
    data: { status: 'REJECTED' },
  });
}

export function findActivityForLead(leadId: string) {
  return prisma.leadActivity.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
  });
}
