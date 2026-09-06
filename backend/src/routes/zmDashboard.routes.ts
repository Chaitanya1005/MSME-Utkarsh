import { Router } from 'express';
import { getZmDashboardHandler } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.use(authenticate);
router.get('/', requireRole('ZM'), getZmDashboardHandler);

export default router;
