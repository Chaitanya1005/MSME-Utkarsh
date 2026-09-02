import { Router } from 'express';
import { listLeadsHandler, getLeadHandler, getLeadActivityHandler } from '../controllers/lead.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { leadIdParamSchema, listLeadsQuerySchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listLeadsQuerySchema }), listLeadsHandler);
router.get('/:leadId', validate({ params: leadIdParamSchema }), getLeadHandler);
// Shared between RM and BM (spec Phase 5 section 5) — authorization is
// the same region/branch scope every other lead endpoint here uses.
router.get('/:leadId/activity', validate({ params: leadIdParamSchema }), getLeadActivityHandler);

export default router;
