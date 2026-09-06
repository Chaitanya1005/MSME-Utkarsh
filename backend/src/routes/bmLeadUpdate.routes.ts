import { Router } from 'express';
import {
  createManualProposalHandler,
  listProposalsForLeadHandler,
  listMyPendingProposalsHandler,
  confirmProposalHandler,
  confirmProposalsBatchHandler,
  rejectProposalHandler,
  getLeadActivityHandler,
} from '../controllers/leadUpdate.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import {
  createManualProposalSchema,
  leadIdParamSchemaBm,
  proposalIdParamSchema,
  confirmProposalsBatchSchema,
  listProposalsQuerySchema,
} from '../validation/schemas';

const router = Router();

router.use(authenticate);
// Generalized from BM-only to BM/RM/ZM (Full-Hierarchy Expansion plan,
// Phase 2) — fine-grained scope (own branch/region/zone) is enforced
// inside the service layer via authorization.ts, not here.
router.use(requireRole('BM', 'RM', 'ZM'));

router.get('/proposals', validate({ query: listProposalsQuerySchema }), listMyPendingProposalsHandler);
router.post(
  '/proposals/confirm-batch',
  validate({ body: confirmProposalsBatchSchema }),
  confirmProposalsBatchHandler
);
router.post(
  '/proposals/:proposalId/confirm',
  validate({ params: proposalIdParamSchema }),
  confirmProposalHandler
);
router.post('/proposals/:proposalId/reject', validate({ params: proposalIdParamSchema }), rejectProposalHandler);

router.post(
  '/leads/:leadId/proposals',
  validate({ params: leadIdParamSchemaBm, body: createManualProposalSchema }),
  createManualProposalHandler
);
router.get('/leads/:leadId/proposals', validate({ params: leadIdParamSchemaBm }), listProposalsForLeadHandler);
router.get('/leads/:leadId/activity', validate({ params: leadIdParamSchemaBm }), getLeadActivityHandler);

export default router;
