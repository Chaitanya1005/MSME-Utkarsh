import { Router } from 'express';
import {
  verifyWhatsAppWebhookHandler,
  receiveWhatsAppWebhookHandler,
} from '../controllers/whatsappWebhook.controller';

const router = Router();

router.get('/', verifyWhatsAppWebhookHandler);
router.post('/', receiveWhatsAppWebhookHandler);

export default router;