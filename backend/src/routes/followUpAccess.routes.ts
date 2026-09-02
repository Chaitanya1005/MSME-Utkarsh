import { Router } from 'express';
import { exchangeAccessTokenHandler } from '../controllers/followUpAccess.controller';
import { validate } from '../middleware/validate';
import { followUpAccessTokenParamSchema } from '../validation/schemas';

const router = Router();

router.get('/:token', validate({ params: followUpAccessTokenParamSchema }), exchangeAccessTokenHandler);

export default router;
