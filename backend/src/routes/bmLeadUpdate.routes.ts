import { Router } from 'express';
import {
  createManualProposalHandler,
  listProposalsForLeadHandler,
  listMyBranchProposalsHandler,
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
router.use(requireRole('BM'));

router.get('/proposals', validate({ query: listProposalsQuerySchema }), listMyBranchProposalsHandler);
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
