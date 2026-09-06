import { Router } from 'express';
import { getGmDashboardHandler } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.use(authenticate);
router.get('/', requireRole('CO'), getGmDashboardHandler);

export default router;
