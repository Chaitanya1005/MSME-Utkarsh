// Provider boundary for speech-to-text (Phase 4/5). Mirrors the
// WhatsApp/Email/Calling provider pattern elsewhere in this directory:
// an interface, a concrete implementation, one wiring point
// (providers/index.ts).
//
// HONEST STATE (see docs/VOICE_LEAD_UPDATE.md): a real provider — Sarvam
// — is now wired in (sarvamTranscriptionProvider.ts), selected
// automatically when SARVAM_API_KEY is set (see providers/index.ts).
// UnconfiguredTranscriptionProvider remains the fallback for any
// environment where that key is absent, and still fails with a normal,
// generic service-unavailable error — the same shape any other provider
// outage would produce — rather than a developer-facing disclaimer
// embedded in the response.
import { AppError } from '../../utils/AppError';

export interface TranscriptionResult {
  transcript: string;
  // Present when the provider reports them (Sarvam does); null for the
  // unconfigured fallback. Not required by callers — see
  // voiceUpdate.service.ts, which treats them as optional metadata.
  languageCode?: string | null;
  requestId?: string | null;
  languageProbability?: number | null;
}

export interface TranscriptionProvider {
  // Takes the raw audio the BM recorded (base64-encoded) plus its MIME
  // type, e.g. 'audio/m4a' — not a local file URI, since the backend has
  // no access to the mobile device's filesystem. A real provider (e.g.
  // Sarvam) would forward this payload to its speech-to-text API.
  transcribe(audioBase64: string, mimeType: string): Promise<TranscriptionResult>;
}

export class UnconfiguredTranscriptionProvider implements TranscriptionProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async transcribe(_audioBase64: string, _mimeType: string): Promise<TranscriptionResult> {
    throw new AppError(
      503,
      'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED',
      'Speech-to-text is not available right now. Please try again later.'
    );
  }
}
