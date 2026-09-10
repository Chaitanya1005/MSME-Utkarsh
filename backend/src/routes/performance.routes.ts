import { Router } from 'express';

import {
  getRegionalPerformanceHandler,
  getBranchPerformanceHandler,
  updateBranchPerformanceHandler,
  getPerformanceEvaluationHandler,
} from '../controllers/performance.controller';

import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get(
  '/evaluation',
  authenticate,
  getPerformanceEvaluationHandler,
);

router.get(
  '/regional',
  authenticate,
  getRegionalPerformanceHandler,
);

router.get(
  '/branches/:branchId',
  authenticate,
  getBranchPerformanceHandler,
);

router.patch(
  '/branches/:branchId',
  authenticate,
  updateBranchPerformanceHandler,
);

export default router;