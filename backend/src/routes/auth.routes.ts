import { Router } from 'express';
import { loginHandler, meHandler, logoutHandler } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { loginSchema } from '../validation/schemas';

const router = Router();

router.post('/login', validate({ body: loginSchema }), loginHandler);
router.get('/me', authenticate, meHandler);
router.post('/logout', authenticate, logoutHandler);

export default router;
