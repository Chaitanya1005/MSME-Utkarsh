import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as leadUpdateService from '../services/leadUpdate.service';
import { AuthenticationError } from '../utils/AppError';
import { PipelineStage, ProposalStatus } from '@prisma/client';

export const createManualProposalHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { leadId } = req.params;
  const body = req.body as { proposedStage: PipelineStage; remarks?: string };
  const proposal = await leadUpdateService.createManualProposal(req.user, { leadId, ...body });
  sendSuccess(res, proposal, 201);
});

export const listProposalsForLeadHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { leadId } = req.params;
  const proposals = await leadUpdateService.listProposalsForLead(req.user, leadId);
  sendSuccess(res, proposals);
});

export const listMyBranchProposalsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const status = req.query.status as ProposalStatus | undefined;
  const proposals = await leadUpdateService.listPendingProposalsForMyBranch(req.user, status);
  sendSuccess(res, proposals);
});

export const confirmProposalHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { proposalId } = req.params;
  const result = await leadUpdateService.confirmProposal(req.user, proposalId);
  sendSuccess(res, result);
});

export const confirmProposalsBatchHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { proposalIds } = req.body as { proposalIds: string[] };
  const results = await leadUpdateService.confirmProposalsBatch(req.user, proposalIds);
  sendSuccess(res, results);
});

export const rejectProposalHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { proposalId } = req.params;
  const proposal = await leadUpdateService.rejectProposal(req.user, proposalId);
  sendSuccess(res, proposal);
});

export const getLeadActivityHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { leadId } = req.params;
  const activity = await leadUpdateService.getLeadActivity(req.user, leadId);
  sendSuccess(res, activity);
});
