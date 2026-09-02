import { Router } from 'express';
import {
  createFollowUpHandler,
  listMyFollowUpsHandler,
  confirmWhatsAppSentHandler,
} from '../controllers/followUp.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { createFollowUpSchema, followUpTargetIdParamSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);
router.use(requireRole('RM'));

router.post('/', validate({ body: createFollowUpSchema }), createFollowUpHandler);
router.get('/', listMyFollowUpsHandler);
router.post(
  '/targets/:targetId/confirm-sent',
  validate({ params: followUpTargetIdParamSchema }),
  confirmWhatsAppSentHandler
);

export default router;
