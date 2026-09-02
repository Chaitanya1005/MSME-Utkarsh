import { Request, Response } from 'express';

export function verifyWhatsAppWebhookHandler(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('WEBHOOK DEBUG');
  console.log('mode:', mode);
  console.log('token received:', token);
  console.log(
    'token configured:',
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  );
  console.log('challenge:', challenge);

  if (
    mode === 'subscribe' &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
    typeof challenge === 'string'
  ) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
}

export function receiveWhatsAppWebhookHandler(req: Request, res: Response): void {
  // Acknowledge immediately so Meta does not repeatedly retry the webhook.
  res.sendStatus(200);

  // Development-only inspection.
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('WhatsApp webhook received:', JSON.stringify(req.body));
  }
}