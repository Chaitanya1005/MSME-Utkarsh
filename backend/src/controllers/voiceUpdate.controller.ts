import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as voiceUpdateService from '../services/voiceUpdate.service';
import { AuthenticationError } from '../utils/AppError';
import { PipelineStage } from '@prisma/client';

export const extractHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { transcript } = req.body as { transcript: string };
  const result = await voiceUpdateService.extractFromTranscript(req.user, transcript);
  sendSuccess(res, result, 201);
});

export const transcribeAudioHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { audioBase64, mimeType } = req.body as { audioBase64: string; mimeType: string };
  const result = await voiceUpdateService.transcribeAudio(req.user, audioBase64, mimeType);
  sendSuccess(res, result);
});

export const createProposalsFromSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { sessionId } = req.params;
  const { items } = req.body as {
    items: Array<{ leadId: string; proposedStage: PipelineStage; remarks?: string }>;
  };
  const result = await voiceUpdateService.createProposalsFromSession(req.user, sessionId, items);
  sendSuccess(res, result, 201);
});

// The combined single-call pipeline — audio in, structured
// transcript+updates/unresolved/notFound result out. See
// voiceUpdate.service.ts#processVoiceLeadUpdate for why this still only
// creates PENDING proposals rather than "updating the database" in the
// literal sense a first read of the response might suggest.
export const processVoiceLeadUpdateHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const { audioBase64, mimeType } = req.body as { audioBase64: string; mimeType: string };
  const result = await voiceUpdateService.processVoiceLeadUpdate(req.user, audioBase64, mimeType);
  sendSuccess(res, result, 201);
});
