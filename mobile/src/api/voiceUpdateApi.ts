import { apiRequest } from './client';
import { VoiceExtractionResult, CreateProposalsFromSessionResult, PipelineStage } from '../types/api';

// Real audio contract (Phase 5 section 17): the backend receives the
// actual recorded audio, not text. `transcribe` and `extract` are two
// separate calls (not one combined endpoint) so the extraction pipeline
// — already unit-tested against plain transcript text — never has to
// know or care whether that text came from a real recording or, in the
// future, some other transcript source.
export function transcribeAudio(audioBase64: string, mimeType: string): Promise<{ transcript: string }> {
  return apiRequest<{ transcript: string }>('/bm/voice-updates/transcribe', {
    method: 'POST',
    body: { audioBase64, mimeType },
  });
}

export function extractFromTranscript(transcript: string): Promise<VoiceExtractionResult> {
  return apiRequest<VoiceExtractionResult>('/bm/voice-updates/extract', {
    method: 'POST',
    body: { transcript },
  });
}

export interface ResolvedCandidateItem {
  leadId: string;
  proposedStage: PipelineStage;
  remarks?: string;
}

export function createProposalsFromSession(
  sessionId: string,
  items: ResolvedCandidateItem[]
): Promise<CreateProposalsFromSessionResult> {
  return apiRequest<CreateProposalsFromSessionResult>(`/bm/voice-updates/sessions/${sessionId}/proposals`, {
    method: 'POST',
    body: { items },
  });
}
