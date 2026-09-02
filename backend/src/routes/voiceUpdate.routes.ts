import { Router } from 'express';
import {
  extractHandler,
  createProposalsFromSessionHandler,
  transcribeAudioHandler,
  processVoiceLeadUpdateHandler,
} from '../controllers/voiceUpdate.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import {
  extractTranscriptSchema,
  voiceSessionIdParamSchema,
  createProposalsFromSessionSchema,
  transcribeAudioSchema,
} from '../validation/schemas';

const router = Router();

router.use(authenticate);
router.use(requireRole('BM'));

router.post('/transcribe', validate({ body: transcribeAudioSchema }), transcribeAudioHandler);
router.post('/extract', validate({ body: extractTranscriptSchema }), extractHandler);
// The combined single-call pipeline (conceptually "POST
// /api/voice/lead-update" — mounted under this existing
// /api/bm/voice-updates namespace rather than a new top-level /api/voice
// one, to follow this project's existing routing convention of grouping
// endpoints by the authorization scope they require).
router.post('/lead-update', validate({ body: transcribeAudioSchema }), processVoiceLeadUpdateHandler);
router.post(
  '/sessions/:sessionId/proposals',
  validate({ params: voiceSessionIdParamSchema, body: createProposalsFromSessionSchema }),
  createProposalsFromSessionHandler
);

export default router;
