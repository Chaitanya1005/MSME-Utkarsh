import { WhatsAppProvider, EmailProvider } from './types';
import { WhatsAppDeepLinkProvider } from './whatsappProvider';
import { ConsoleEmailProvider } from './emailProvider';
import { TranscriptionProvider, UnconfiguredTranscriptionProvider } from './transcriptionProvider';
import { SarvamTranscriptionProvider } from './sarvamTranscriptionProvider';
import { CallingProvider, DevMockCallingProvider } from './callingProvider';
import { env } from '../../config/env';

// The single place that decides which concrete provider implementation
// is active. To plug in a real production provider later: implement the
// interface in providers/types.ts (or providers/transcriptionProvider.ts
// for speech-to-text), then change only the instantiation below (or make
// it environment-driven, e.g. `env.emailProvider === 'ses' ?
// new SesEmailProvider() : new ConsoleEmailProvider()`). Nothing else in
// the codebase needs to change.
export const whatsAppProvider: WhatsAppProvider = new WhatsAppDeepLinkProvider();
export const emailProvider: EmailProvider = new ConsoleEmailProvider();
// Environment-driven, exactly like the pattern the comment above
// describes: SarvamTranscriptionProvider is used automatically once
// SARVAM_API_KEY is set, with no other code change required anywhere in
// the request path. Falls back to the honest "not configured" provider
// otherwise.
export const transcriptionProvider: TranscriptionProvider = env.sarvamApiKey
  ? new SarvamTranscriptionProvider(env.sarvamApiKey)
  : new UnconfiguredTranscriptionProvider();
// Swap for a real TwilioCallingProvider (or similar) once credentials
// exist — see docs/PHASE5_IMPLEMENTATION.md "Provider integration points".
export const callingProvider: CallingProvider = new DevMockCallingProvider();
