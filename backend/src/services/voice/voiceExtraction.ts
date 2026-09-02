// Orchestrates the full Voice Extraction V2 pipeline:
//
//   transcript -> normalization -> clause segmentation
//     -> lead reference extraction (number, then name fallback)
//     -> stage/action + negation detection
//     -> position-based reference<->action association (multi-lead)
//     -> safe ExtractedCandidate[]
//
// Deliberately an orchestrator, not "a giant regex file" (the
// commissioning request's own words) — each concern lives in its own
// pure module under services/voice/. This file's only job is wiring
// them together and applying the safety rules that span modules (number
// always wins over name; never emit a candidate for a lead outside
// authorizedLeads; never guess).
//
// Pipeline progression validation (detecting an unsafe backward stage
// transition against a lead's CURRENT stage) intentionally does NOT
// happen here — this module has no Prisma access and doesn't know a
// lead's current stage. See progressionValidator.ts and
// voiceUpdate.service.ts, which calls it once real Lead data is
// available, per the commissioning request's explicit instruction to
// keep this layer pure.

import { PipelineStage } from '../../types/domain';
import { normalizeTranscript } from './transcriptNormalizer';
import {
  AuthorizedLeadForExtraction,
  LeadReference,
  findNumberReferences,
  resolveNumberReference,
  findNameReferences,
} from './leadResolver';
import { findStageMatches, StageMatch } from './stageExtractor';

export type { AuthorizedLeadForExtraction };

export type AmbiguityReason = 'NO_LEAD_MATCH' | 'MULTIPLE_LEAD_MATCH' | 'NO_STAGE_MATCH';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ExtractedCandidate {
  rawClause: string;
  spokenLeadNumber: string | null;
  matchedLeadId: string | null;
  matchedLeadName: string | null;
  candidateLeadIds: string[];
  proposedStage: PipelineStage | null;
  remarks: string;
  ambiguityReason: AmbiguityReason | null;
  confidence: Confidence;
}

function splitIntoClauses(transcript: string): string[] {
  return transcript
    .split(/[.\n]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function buildRemarks(clause: string, ref: LeadReference, stage: StageMatch | null): string {
  let remarks = clause;
  remarks = remarks.replace(ref.raw, '').trim();
  if (stage) {
    remarks = remarks.replace(stage.matchedText, '').trim();
  }
  remarks = remarks.replace(/\s{2,}/g, ' ').replace(/^[,-]\s*/, '').trim();
  return remarks || clause;
}

function candidateFromNumberRef(
  clause: string,
  ref: LeadReference,
  stage: StageMatch | null,
  authorizedLeads: AuthorizedLeadForExtraction[]
): ExtractedCandidate {
  if (!ref.matchedLeadId) {
    // Safety rule: an explicit-but-unresolvable lead number is reported
    // as NO_LEAD_MATCH and MUST NOT fall back to any co-occurring name
    // in the same clause (spec's "Lead 9999, Anil Sharma" example).
    return {
      rawClause: clause,
      spokenLeadNumber: ref.spokenLeadNumber,
      matchedLeadId: null,
      matchedLeadName: null,
      candidateLeadIds: [],
      proposedStage: stage?.stage ?? null,
      remarks: clause,
      ambiguityReason: 'NO_LEAD_MATCH',
      confidence: 'LOW',
    };
  }

  const lead = authorizedLeads.find((l) => l.id === ref.matchedLeadId) ?? null;

  if (!stage) {
    return {
      rawClause: clause,
      spokenLeadNumber: ref.spokenLeadNumber,
      matchedLeadId: ref.matchedLeadId,
      matchedLeadName: lead?.customerName ?? null,
      candidateLeadIds: [],
      proposedStage: null,
      remarks: buildRemarks(clause, ref, null),
      ambiguityReason: 'NO_STAGE_MATCH',
      confidence: 'LOW',
    };
  }

  return {
    rawClause: clause,
    spokenLeadNumber: ref.spokenLeadNumber,
    matchedLeadId: ref.matchedLeadId,
    matchedLeadName: lead?.customerName ?? null,
    candidateLeadIds: [],
    proposedStage: stage.stage,
    remarks: buildRemarks(clause, ref, stage),
    ambiguityReason: null,
    // Explicit lead number + unambiguous stage phrase is the strongest
    // possible signal this extractor can produce.
    confidence: 'HIGH',
  };
}

function candidateFromNameRef(clause: string, ref: LeadReference, stage: StageMatch | null): ExtractedCandidate {
  if (ref.candidateLeadIds.length > 0) {
    return {
      rawClause: clause,
      spokenLeadNumber: null,
      matchedLeadId: null,
      matchedLeadName: null,
      candidateLeadIds: ref.candidateLeadIds,
      proposedStage: stage?.stage ?? null,
      remarks: clause,
      ambiguityReason: 'MULTIPLE_LEAD_MATCH',
      confidence: 'LOW',
    };
  }

  if (!ref.matchedLeadId) {
    return {
      rawClause: clause,
      spokenLeadNumber: null,
      matchedLeadId: null,
      matchedLeadName: null,
      candidateLeadIds: [],
      proposedStage: stage?.stage ?? null,
      remarks: clause,
      ambiguityReason: 'NO_LEAD_MATCH',
      confidence: 'LOW',
    };
  }

  if (!stage) {
    return {
      rawClause: clause,
      spokenLeadNumber: null,
      matchedLeadId: ref.matchedLeadId,
      matchedLeadName: ref.raw,
      candidateLeadIds: [],
      proposedStage: null,
      remarks: clause,
      ambiguityReason: 'NO_STAGE_MATCH',
      confidence: 'LOW',
    };
  }

  return {
    rawClause: clause,
    spokenLeadNumber: null,
    matchedLeadId: ref.matchedLeadId,
    matchedLeadName: ref.raw,
    candidateLeadIds: [],
    proposedStage: stage.stage,
    remarks: buildRemarks(clause, { ...ref, raw: ref.raw }, stage),
    ambiguityReason: null,
    // A resolved-by-name match is inherently less certain than an
    // explicit lead number, even when unambiguous (spec: "exact full
    // name -> MEDIUM/HIGH"; single distinctive token is weaker still —
    // handled by leadResolver.ts only ever returning a single-token
    // match when it uniquely resolves, so MEDIUM covers both cases here
    // without over-claiming HIGH confidence for something that could
    // still be a token collision this extractor didn't anticipate).
    confidence: 'MEDIUM',
  };
}

function extractFromClause(clause: string, authorizedLeads: AuthorizedLeadForExtraction[]): ExtractedCandidate[] {
  const numberRefs = findNumberReferences(clause).map((r) => resolveNumberReference(r, authorizedLeads));
  const stageMatches = findStageMatches(clause);

  // Zero or exactly one action in the whole clause: every reference in
  // the clause shares it (or, for zero actions, every reference is
  // reported as NO_STAGE_MATCH). This is also where the number-over-name
  // safety rule applies at full clause scope — "if the clause explicitly
  // contains a lead number, resolve ONLY by the normalized lead
  // identifier, do not fall back to a different name match" (spec's
  // "Lead 9999, Anil Sharma, converted" example: with only one action in
  // the clause, the number and the name are read as describing the
  // SAME single lead, not two).
  if (stageMatches.length <= 1) {
    const stage = stageMatches[0] ?? null;

    if (numberRefs.length > 0) {
      return numberRefs.map((ref) => candidateFromNumberRef(clause, ref, stage, authorizedLeads));
    }

    const nameRefs = findNameReferences(clause, authorizedLeads);
    if (nameRefs.length > 0) {
      return nameRefs.map((ref) => candidateFromNameRef(clause, ref, stage));
    }

    return [];
  }

  // Multiple distinct actions in one clause (spec: "1001 interested hai
  // aur 1002 ko contact kar liya hai aur 1003 ki application bhej di hai
  // ... Sharma ji ka approval aa gaya hai aur 1005 convert ho gaya
  // hai"). Each action gets its own independent reference-collection
  // WINDOW — the text between the end of the previous action and the
  // start of this one — so an unrelated name mention in one window is
  // never suppressed by number references that belong to a completely
  // different action elsewhere in the same long clause. The
  // number-over-name safety rule still applies, but scoped to each
  // window individually rather than the whole clause.
  const candidates: ExtractedCandidate[] = [];
  let windowStart = 0;

  for (const stage of stageMatches) {
    const windowEnd = stage.start;
    const windowNumberRefs = numberRefs.filter((r) => r.start >= windowStart && r.end <= windowEnd);

    if (windowNumberRefs.length > 0) {
      for (const ref of windowNumberRefs) {
        candidates.push(candidateFromNumberRef(clause, ref, stage, authorizedLeads));
      }
    } else {
      const windowText = clause.slice(windowStart, windowEnd);
      const windowNameRefs = findNameReferences(windowText, authorizedLeads);
      for (const ref of windowNameRefs) {
        candidates.push(candidateFromNameRef(clause, ref, stage));
      }
    }

    windowStart = stage.end;
  }

  return candidates;
}

export function extractUpdateCandidates(
  transcript: string,
  authorizedLeads: AuthorizedLeadForExtraction[]
): ExtractedCandidate[] {
  const normalized = normalizeTranscript(transcript);
  const clauses = splitIntoClauses(normalized);

  const candidates: ExtractedCandidate[] = [];
  for (const clause of clauses) {
    candidates.push(...extractFromClause(clause, authorizedLeads));
  }
  return candidates;
}
