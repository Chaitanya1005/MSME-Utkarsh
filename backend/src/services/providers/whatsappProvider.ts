import { WhatsAppProvider, WhatsAppSendResult } from './types';

// MVP implementation: a wa.me deep link with the message pre-filled.
// Opening it is a CLIENT action (the RM's own phone), not something this
// backend can do on the RM's behalf — WhatsApp has no concept of a
// backend "sending as" an arbitrary user without the real WhatsApp
// Business API, which requires a verified business account, phone number
// registration, and per-message-template approval from Meta. None of
// that exists for this MVP, and this class does not pretend it does.
//
// A real WhatsAppBusinessApiProvider implementing the same
// WhatsAppProvider interface can replace this later without any change
// to followUp.service.ts or the mobile app beyond no longer needing to
// call device Linking.
export class WhatsAppDeepLinkProvider implements WhatsAppProvider {
  buildDeepLink(phoneNumber: string, message: string): WhatsAppSendResult {
    const normalizedPhone = phoneNumber.replace(/[^\d]/g, '');
    const encodedMessage = encodeURIComponent(message);
    return {
      deepLinkUrl: `https://wa.me/${normalizedPhone}?text=${encodedMessage}`,
    };
  }
}
