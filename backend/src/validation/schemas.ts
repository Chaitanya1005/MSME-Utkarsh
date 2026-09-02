import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(200),
});

// CUID format used for all internal primary keys (see prisma schema).
const idParam = z.string().trim().min(1, 'Id is required').max(64);

export const regionIdParamSchema = z.object({
  regionId: idParam,
});

export const branchIdParamSchema = z.object({
  branchId: idParam,
});

export const leadIdParamSchema = z.object({
  leadId: idParam,
});

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: idParam.optional(),
  regionId: idParam.optional(),
  cbiPesStage: z.enum(['INTERESTED', 'CONTACTED', 'APPLICATION', 'APPROVAL', 'CONVERSION']).optional(),
});

// --- Phase 2: follow-up validation --------------------------------------

export const createFollowUpSchema = z.object({
  branchIds: z.array(idParam).min(1, 'At least one branch must be selected').max(50),
  channel: z.enum(['WHATSAPP', 'EMAIL']),
  customNote: z.string().trim().max(300).optional(),
});

export const followUpTargetIdParamSchema = z.object({
  targetId: idParam,
});

export const followUpAccessTokenParamSchema = z.object({
  token: z.string().trim().min(32).max(256),
});

// --- Phase 3/4: lead update proposals & voice extraction ----------------

const pipelineStageEnum = z.enum(['INTERESTED', 'CONTACTED', 'APPLICATION', 'APPROVAL', 'CONVERSION']);

export const createManualProposalSchema = z.object({
  proposedStage: pipelineStageEnum,
  remarks: z.string().trim().max(500).optional(),
});

export const leadIdParamSchemaBm = z.object({
  leadId: idParam,
});

export const proposalIdParamSchema = z.object({
  proposalId: idParam,
});

export const confirmProposalsBatchSchema = z.object({
  proposalIds: z.array(idParam).min(1).max(50),
});

export const listProposalsQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']).optional(),
});

export const extractTranscriptSchema = z.object({
  transcript: z.string().trim().min(1).max(2000),
});

export const transcribeAudioSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().trim().min(1).max(100),
});

export const voiceSessionIdParamSchema = z.object({
  sessionId: idParam,
});

export const createProposalsFromSessionSchema = z.object({
  items: z
    .array(
      z.object({
        leadId: idParam,
        proposedStage: pipelineStageEnum,
        remarks: z.string().trim().max(500).optional(),
      })
    )
    .min(1)
    .max(20),
});
