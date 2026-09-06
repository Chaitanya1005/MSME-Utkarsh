import { Router } from 'express';
import { getRegionDetailHandler, getZoneDetailHandler } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { regionIdParamSchema, zoneIdParamSchema } from '../validation/schemas';

// Drill-down detail for the RegionDetail/ZoneDetail mobile screens
// (Full-Hierarchy Expansion plan, Phase 3/4). Fine-grained authorization
// (an RM's own region, a ZM's own zone or any region in it, CO anything)
// is enforced inside dashboard.service.ts via canAccessRegion/
// canAccessZone — no requireRole gate here, since which roles may reach
// a given region/zone is itself scope-dependent, not role-dependent.
const router = Router();

router.use(authenticate);
router.get('/regions/:regionId/detail', validate({ params: regionIdParamSchema }), getRegionDetailHandler);
router.get('/zones/:zoneId/detail', validate({ params: zoneIdParamSchema }), getZoneDetailHandler);

export default router;
