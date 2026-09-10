import { Router } from 'express';
import { followUpLandingHandler } from '../controllers/followUpLanding.controller';

// Deliberately public, no authenticate middleware — same trust model as
// /api/follow-up-access/:token (the JSON API this page hands off to):
// the opaque token itself is the credential, not a session.
const router = Router();

router.get('/:token', followUpLandingHandler);

export default router;
