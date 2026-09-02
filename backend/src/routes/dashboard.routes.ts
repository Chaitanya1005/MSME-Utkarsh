import { Router } from 'express';
import { getRmDashboardHandler } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.use(authenticate);
router.get('/', requireRole('RM'), getRmDashboardHandler);

export default router;
