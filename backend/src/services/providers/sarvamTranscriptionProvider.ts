import { SarvamAIClient } from 'sarvamai';
import { TranscriptionProvider, TranscriptionResult } from './transcriptionProvider';
import { AppError } from '../../utils/AppError';

// Real implementation of the transcription provider boundary
// (transcriptionProvider.ts). The SDK call shape here matches the
// working, manually-verified call in backend/test-sarvam-transcription.js
// — `client.speechToText.transcribe({ file: <Uploadable> })` — adapted to
// this backend's actual audio contract (base64 + MIME type in a JSON
// body, not a local file path) by passing the decoded audio as an
// in-memory Buffer with metadata rather than writing a temporary file to
// disk, which the SDK's `Uploadable.WithMetadata` shape supports
// directly (confirmed by reading node_modules/sarvamai's own type
// definitions, not assumed).
export class SarvamTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly apiKey: string) {}

  async transcribe(audioBase64: string, mimeType: string): Promise<TranscriptionResult> {
    const normalizedMimeType =
  mimeType === 'audio/m4a' ? 'audio/x-m4a' : mimeType;
    const client = new SarvamAIClient({ apiSubscriptionKey: this.apiKey });

    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(audioBase64, 'base64');
    } catch {
      throw new AppError(400, 'INVALID_AUDIO', 'The recording could not be read');
    }
    if (audioBuffer.length === 0) {
      throw new AppError(400, 'INVALID_AUDIO', 'The recording appears to be empty');
    }

    try {
      const response = await client.speechToText.transcribe({
        file: {
          data: audioBuffer,
          filename: 'recording',
          contentType: normalizedMimeType,
        },
      });

      if (!response.transcript || response.transcript.trim().length === 0) {
        throw new AppError(
          422,
          'EMPTY_TRANSCRIPT',
          'The recording could not be transcribed. Please try recording again.'
        );
      }

      return {
        transcript: response.transcript,
        languageCode: response.language_code ?? null,
        requestId: response.request_id ?? null,
        languageProbability: response.language_probability ?? null,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Never leak Sarvam's raw error/response shape (which could
      // include request internals) to the client — same principle as
      // the centralized error handler's treatment of any other
      // third-party failure.
      // eslint-disable-next-line no-console
      console.error('[SarvamTranscriptionProvider] transcription request failed:', err instanceof Error ? err.message : err);
      throw new AppError(
        502,
        'TRANSCRIPTION_PROVIDER_ERROR',
        'Speech-to-text is temporarily unavailable. Please try again.'
      );
    }
  }
}
