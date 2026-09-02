import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as callingService from '../services/calling.service';
import { AuthenticationError } from '../utils/AppError';

export const initiateCallHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { branchId } = req.params;
  const call = await callingService.initiateCallToBranchBm(req.user, branchId);
  sendSuccess(res, call, 201);
});

export const listMyInitiatedCallsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const calls = await callingService.listMyInitiatedCalls(req.user);
  sendSuccess(res, calls);
});

export const listMyReceivedCallsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const calls = await callingService.listMyReceivedCalls(req.user);
  sendSuccess(res, calls);
});
