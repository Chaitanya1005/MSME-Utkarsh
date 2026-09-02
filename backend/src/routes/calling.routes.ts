import { Router } from 'express';
import {
  initiateCallHandler,
  listMyInitiatedCallsHandler,
  listMyReceivedCallsHandler,
} from '../controllers/calling.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { branchIdParamSchema } from '../validation/schemas';

const rmRouter = Router();
rmRouter.use(authenticate);
rmRouter.use(requireRole('RM'));
rmRouter.post('/branches/:branchId/call', validate({ params: branchIdParamSchema }), initiateCallHandler);
rmRouter.get('/calls', listMyInitiatedCallsHandler);

const bmRouter = Router();
bmRouter.use(authenticate);
bmRouter.use(requireRole('BM'));
bmRouter.get('/calls', listMyReceivedCallsHandler);

export { rmRouter as rmCallingRoutes, bmRouter as bmCallingRoutes };
