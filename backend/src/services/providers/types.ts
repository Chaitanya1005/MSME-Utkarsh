// Provider abstraction boundary (spec sections 13, 14). Nothing outside
// this directory (services, controllers, mobile) should know or care
// whether a channel is backed by a real production integration or an
// MVP-safe development stub — they only ever talk to these interfaces.
//
// Swapping either provider for a real production integration later
// (WhatsApp Business API, a real SMTP/transactional-email provider) means
// writing one new class that implements the relevant interface and
// wiring it in providers/index.ts — no change to the RM workflow, the
// follow-up service, or the database schema.

export interface WhatsAppSendResult {
  // WhatsApp in Phase 2 is a client-side deep-link handoff (see
  // docs/PHASE2_SCOPE.md for why this is the honest MVP implementation,
  // not a fabricated WhatsApp Business API integration): the backend's
  // job is only to compose the message and produce the wa.me link; the
  // RM's own device is what actually "sends" it. `deepLinkUrl` is what
  // the mobile app opens via its native Linking API.
  deepLinkUrl: string;
}

export interface WhatsAppProvider {
  buildDeepLink(phoneNumber: string, message: string): WhatsAppSendResult;
}

export interface EmailSendResult {
  delivered: boolean;
  // Present when delivered is false — never a raw provider stack trace,
  // just enough for the RM/ops to understand what happened.
  failureReason?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<EmailSendResult>;
}
