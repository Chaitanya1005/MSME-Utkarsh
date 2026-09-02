import {
  createVoiceSession,
  findVoiceSessionById,
  findLeadsForBranch,
} from '../repositories/voiceUpdate.repository';
import { extractUpdateCandidates, ExtractedCandidate } from './voiceExtraction';
import { validateProgression } from './voice/progressionValidator';
import { createProposalFromAnySource } from './leadUpdate.service';
import { AuthTokenPayload } from '../types/domain';
import { AuthorizationError, NotFoundError, ValidationError } from '../utils/AppError';
import { PipelineStage } from '@prisma/client';
import { transcriptionProvider } from './providers';

const MAX_TRANSCRIPT_LENGTH = 2000;
const MAX_AUDIO_BASE64_LENGTH = 15_000_000; // ~11MB decoded, generous for a short voice note

// Step 0 of the voice pipeline (spec Phase 5 section 17): accepts the
// actual recorded audio, not text. This is the real backend/frontend
// audio contract the eventual transcription provider (e.g. Sarvam) will
// sit behind — see providers/transcriptionProvider.ts.
export async function transcribeAudio(user: AuthTokenPayload, audioBase64: string, mimeType: string) {
  if (user.role !== 'BM' || !user.branchId) {
    throw new AuthorizationError('Only a Branch Head can submit a voice recording');
  }
  if (!audioBase64 || audioBase64.length === 0) {
    throw new ValidationError('No audio was provided');
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    throw new ValidationError('Recording is too long');
  }
  if (!mimeType || !mimeType.startsWith('audio/')) {
    throw new ValidationError('Unsupported audio format');
  }

  const result = await transcriptionProvider.transcribe(audioBase64, mimeType);
  return result;
}

export interface VoiceExtractionResult {
  sessionId: string;
  candidates: ExtractedCandidate[];
}

// Step 1 of the voice pipeline: turn a transcript into candidates. Note
// what this does NOT do — it never writes a LeadUpdateProposal, and
// therefore never touches Lead.cbiPesStage (spec section 8: "the AI must
// not have direct database mutation authority"). Candidates are pure
// suggestions, returned to the BM for review.
export async function extractFromTranscript(
  user: AuthTokenPayload,
  transcript: string
): Promise<VoiceExtractionResult> {
  if (user.role !== 'BM' || !user.branchId) {
    throw new AuthorizationError('Only a Branch Head can submit a voice update');
  }
  const trimmed = transcript.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Transcript cannot be empty');
  }
  if (trimmed.length > MAX_TRANSCRIPT_LENGTH) {
    throw new ValidationError(`Transcript is too long (max ${MAX_TRANSCRIPT_LENGTH} characters)`);
  }

  const authorizedLeads = await findLeadsForBranch(user.branchId);
  const candidates = extractUpdateCandidates(trimmed, authorizedLeads);

  const session = await createVoiceSession({
    branchId: user.branchId,
    performedByUserId: user.userId,
    transcript: trimmed,
    status: 'EXTRACTED',
  });

  return { sessionId: session.id, candidates };
}

// --- Combined single-call pipeline (audio in, structured result out) ---
//
// Orchestrates transcribeAudio -> extractFromTranscript's underlying
// logic -> auto-creates PENDING proposals for every confidently
// resolved candidate, all in one call. This is the "audio -> transcript
// -> extraction -> lead ID + proposed stage -> BM reviews -> confirms"
// pipeline, condensed into a single request for the case where the
// mobile client wants one round trip instead of orchestrating
// transcribe/extract/create itself.
//
// IMPORTANT: this still only ever creates PENDING LeadUpdateProposal
// rows via the exact same createProposalFromAnySource function every
// other creation path uses — it does NOT write Lead.cbiPesStage
// directly. That would contradict this project's own repeatedly-stated,
// non-negotiable rule (Phase 3 section 4.4, restated in Phase 5 section
// 3): "the mobile application must never directly mutate database
// state... only CONFIRMED updates may modify the lead." A BM must still
// confirm each proposal (individually or via the existing batch-confirm
// endpoint) before it actually changes a lead's stage. The response
// below reports proposal status accordingly (PENDING_REVIEW, not
// "updated") — an intentional, documented departure from a literal
// "already updated" response shape, in favor of never claiming a
// database write happened when it didn't.
export interface VoiceLeadUpdateResultItem {
  leadNumber: string;
  leadId: string;
  previousStatus: PipelineStage;
  proposedStatus: PipelineStage;
  proposalId: string;
  // 'pending_review' for a safe forward/same-stage transition;
  // 'pending_review_backward' when the proposed stage would move the
  // lead BACKWARD from its current stage (see progressionValidator.ts).
  // Both still create only a PENDING proposal — the backward case is
  // flagged, not blocked, so the BM sees it on the existing review
  // screen and decides, rather than the extractor silently downgrading
  // a lead (a spec safety rule) OR silently discarding a genuine
  // correction.
  status: 'pending_review' | 'pending_review_backward';
}

export interface VoiceLeadUpdateUnresolvedItem {
  rawClause: string;
  reason: ExtractedCandidate['ambiguityReason'];
}

export interface VoiceLeadUpdateNotFoundItem {
  leadNumber: string;
  rawClause: string;
}

export interface VoiceLeadUpdateResult {
  success: true;
  transcript: string;
  languageCode: string | null;
  requestId: string | null;
  sessionId: string;
  updates: VoiceLeadUpdateResultItem[];
  unresolved: VoiceLeadUpdateUnresolvedItem[];
  notFound: VoiceLeadUpdateNotFoundItem[];
}

export async function processVoiceLeadUpdate(
  user: AuthTokenPayload,
  audioBase64: string,
  mimeType: string
): Promise<VoiceLeadUpdateResult> {
  // Reuses transcribeAudio verbatim — same role/validation checks, same
  // provider boundary call — rather than duplicating any of that logic.
  const transcription = await transcribeAudio(user, audioBase64, mimeType);

  // Reuses the same extraction step extractFromTranscript uses
  // internally, inlined here only because extractFromTranscript's own
  // signature returns just {sessionId, candidates} and this function
  // needs the authorized-leads list again to resolve each candidate's
  // full lead record for the response (customer-facing detail beyond
  // what a bare candidate carries).
  const branchId = user.branchId as string; // guaranteed by transcribeAudio's own role check above
  const authorizedLeads = await findLeadsForBranch(branchId);
  const candidates = extractUpdateCandidates(transcription.transcript, authorizedLeads);

  const session = await createVoiceSession({
    branchId,
    performedByUserId: user.userId,
    transcript: transcription.transcript,
    status: 'EXTRACTED',
  });

  const updates: VoiceLeadUpdateResultItem[] = [];
  const unresolved: VoiceLeadUpdateUnresolvedItem[] = [];
  const notFound: VoiceLeadUpdateNotFoundItem[] = [];

  for (const candidate of candidates) {
    if (candidate.ambiguityReason === 'NO_LEAD_MATCH' && candidate.spokenLeadNumber) {
      notFound.push({ leadNumber: candidate.spokenLeadNumber, rawClause: candidate.rawClause });
      continue;
    }
    if (candidate.ambiguityReason !== null || !candidate.matchedLeadId || !candidate.proposedStage) {
      unresolved.push({ rawClause: candidate.rawClause, reason: candidate.ambiguityReason });
      continue;
    }

    const matchedLead = authorizedLeads.find((l) => l.id === candidate.matchedLeadId);

    try {
      // eslint-disable-next-line no-await-in-loop
      const proposal = await createProposalFromAnySource(user, {
        leadId: candidate.matchedLeadId,
        proposedStage: candidate.proposedStage,
        remarks: candidate.remarks,
        source: 'VOICE_AI',
        voiceSessionId: session.id,
        transcriptExcerpt: candidate.rawClause,
      });
      updates.push({
        leadNumber: candidate.spokenLeadNumber ?? matchedLead?.sourceSrNo ?? candidate.matchedLeadId,
        leadId: candidate.matchedLeadId,
        previousStatus: proposal.previousStage,
        proposedStatus: proposal.proposedStage,
        proposalId: proposal.id,
        // Progression validation happens HERE, in the service layer,
        // where the lead's real current stage (proposal.previousStage,
        // captured from the DB when the proposal was created) is known —
        // never in the pure extraction layer, which has no Prisma access
        // (see progressionValidator.ts's own header comment).
        status: validateProgression(proposal.previousStage, proposal.proposedStage).safe
          ? 'pending_review'
          : 'pending_review_backward',
      });
    } catch (err) {
      // A create failure here (e.g. a race where the lead's branch
      // changed) is reported as unresolved rather than silently
      // dropped — the API must never claim a clean result when a step
      // actually failed.
      unresolved.push({
        rawClause: candidate.rawClause,
        reason: null,
      });
      // eslint-disable-next-line no-console
      console.error('[processVoiceLeadUpdate] failed to create proposal for a resolved candidate:', err);
    }
  }

  return {
    success: true,
    transcript: transcription.transcript,
    languageCode: transcription.languageCode ?? null,
    requestId: transcription.requestId ?? null,
    sessionId: session.id,
    updates,
    unresolved,
    notFound,
  };
}

export interface ResolvedCandidateInput {
  leadId: string;
  proposedStage: PipelineStage;
  remarks?: string;
  transcriptExcerpt?: string;
}

export interface CreateProposalsFromSessionResult {
  created: number;
  failed: Array<{ leadId: string; error: string }>;
}

// Step 2: the BM has reviewed the candidates (resolved any ambiguity
// client-side, or accepted the extractor's own resolution) and is
// submitting the ones they actually want turned into real, PENDING
// proposals. This is the exact same createProposalFromAnySource function
// the manual flow uses — no parallel proposal-creation logic exists for
// voice (spec section 5's core invariant).
export async function createProposalsFromSession(
  user: AuthTokenPayload,
  sessionId: string,
  items: ResolvedCandidateInput[]
): Promise<CreateProposalsFromSessionResult> {
  if (user.role !== 'BM' || !user.branchId) {
    throw new AuthorizationError('Only a Branch Head can act on a voice update session');
  }
  const session = await findVoiceSessionById(sessionId);
  if (!session) throw new NotFoundError('Voice update session');
  if (session.branchId !== user.branchId) {
    throw new AuthorizationError('You are not authorized to act on this voice update session');
  }
  if (items.length === 0) {
    throw new ValidationError('At least one candidate must be submitted');
  }

  let created = 0;
  const failed: Array<{ leadId: string; error: string }> = [];

  for (const item of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await createProposalFromAnySource(user, {
        leadId: item.leadId,
        proposedStage: item.proposedStage,
        remarks: item.remarks,
        source: 'VOICE_AI',
        voiceSessionId: session.id,
        transcriptExcerpt: item.transcriptExcerpt ?? session.transcript,
      });
      created += 1;
    } catch (err) {
      failed.push({ leadId: item.leadId, error: err instanceof Error ? err.message : 'Could not create proposal' });
    }
  }

  return { created, failed };
}
