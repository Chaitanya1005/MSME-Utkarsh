import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as followUpService from '../services/followUp.service';
import { AuthenticationError } from '../utils/AppError';
import { FollowUpChannel } from '@prisma/client';

export const createFollowUpHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const body = req.body as { branchIds: string[]; channel: FollowUpChannel; customNote?: string };
  const result = await followUpService.createFollowUp(req.user, body);
  sendSuccess(res, result, 201);
});

export const listMyFollowUpsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const followUps = await followUpService.listMyFollowUps(req.user);
  sendSuccess(res, followUps);
});

export const confirmWhatsAppSentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { targetId } = req.params;
  const target = await followUpService.confirmWhatsAppSent(req.user, targetId);
  sendSuccess(res, target);
});
