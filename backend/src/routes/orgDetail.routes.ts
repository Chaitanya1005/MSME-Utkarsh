import { Router } from 'express';
import { getRegionDetailHandler, getZoneDetailHandler, getMyLeadsHandler } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
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
// RM's/ZM's own leads (assigned directly to their region, or to any
// region in their zone) — backs the "My Leads" mobile screen, the
// RM/ZM equivalent of BMLeadListScreen with a Voice/Manual Update entry
// point (Full-Hierarchy Expansion plan).
router.get('/my-leads', requireRole('RM', 'ZM'), getMyLeadsHandler);

export default router;
