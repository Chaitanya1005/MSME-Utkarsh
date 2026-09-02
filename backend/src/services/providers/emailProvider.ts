import { EmailProvider, EmailSendResult } from './types';

// MVP implementation: logs the composed email instead of sending it,
// because no real SMTP/transactional-email provider credentials were
// supplied for this project (spec section 14 explicitly forbids
// hard-coding SMTP credentials or pretending a provider is configured).
// This is a real, working implementation of the EmailProvider interface —
// not a placeholder — it just documents honestly that "sending" in this
// environment means "logged, not delivered."
//
// A real ProductionEmailProvider (e.g. wrapping SES, SendGrid, Postmark)
// implementing the same interface can be swapped in later purely via
// configuration (see providers/index.ts) with zero change to
// followUp.service.ts.
export class ConsoleEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<EmailSendResult> {
    // eslint-disable-next-line no-console
    console.log('[ConsoleEmailProvider] DEV-ONLY: email not actually delivered.');
    // eslint-disable-next-line no-console
    console.log(`  To: ${to}`);
    // eslint-disable-next-line no-console
    console.log(`  Subject: ${subject}`);
    // eslint-disable-next-line no-console
    console.log(`  Body:\n${body}`);
    return { delivered: true };
  }
}
