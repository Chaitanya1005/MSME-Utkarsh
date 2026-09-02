import { PipelineStage, ProposalStatus, UpdateSource } from '@prisma/client';
import { prisma } from '../config/prisma';

export function findLeadById(leadId: string) {
  return prisma.lead.findUnique({
    where: { id: leadId },
    include: { branch: { select: { id: true, regionId: true, name: true } } },
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
    include: { lead: { include: { branch: true } } },
  });
}

export function findProposalsForLead(leadId: string) {
  return prisma.leadUpdateProposal.findMany({
    where: { leadId },
    orderBy: { createdAt: 'desc' },
  });
}

// Pending (or otherwise filtered) proposals across every lead in a branch —
// used by the BM's "review updates" screen, which spans both manual and
// voice-sourced proposals identically (spec section 5's unified model).
export function findProposalsForBranch(branchId: string, status?: ProposalStatus) {
  return prisma.leadUpdateProposal.findMany({
    where: {
      status,
      lead: { branchId },
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
