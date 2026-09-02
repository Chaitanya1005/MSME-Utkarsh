import { Router } from 'express';
import {
  myScopeHandler,
  getRegionHandler,
  listBranchesForRegionHandler,
  getBranchHandler,
} from '../controllers/org.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { regionIdParamSchema, branchIdParamSchema } from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/scope', myScopeHandler);
router.get('/regions/:regionId', validate({ params: regionIdParamSchema }), getRegionHandler);
router.get(
  '/regions/:regionId/branches',
  validate({ params: regionIdParamSchema }),
  listBranchesForRegionHandler
);
router.get('/branches/:branchId', validate({ params: branchIdParamSchema }), getBranchHandler);

export default router;
