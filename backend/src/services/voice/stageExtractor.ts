// Detects a pipeline-stage action phrase in a piece of text, with
// explicit negation handling (spec's "safety-critical" requirement).
// Pure, deterministic — no Express/Prisma.

import { PipelineStage } from '../../types/domain';
import { isNegatedNear } from './negationDetector';

export interface StageMatch {
  // Character offset range within the text this match was found in —
  // used by the orchestrator (voiceExtraction.ts) to associate this
  // action with the nearest preceding lead reference(s).
  start: number;
  end: number;
  // The FINAL stage after negation is applied — e.g. a negated
  // "documents received" phrase resolves to LEAD_CONFIRMED (the
  // pre-documents stage), not DOCUMENTS_RECEIVED. Callers never need to
  // separately apply negation.
  stage: PipelineStage;
  wasNegated: boolean;
  matchedText: string;
}

// A generous window (characters) searched around a stage-phrase match
// for a negation marker — see negationDetector.ts for the exact rule.
//
// Ordered from LAST stage to FIRST stage of the 7-stage pipeline
// (DISBURSED down to LEAD_CONFIRMED) — matching order matters for
// overlapping phrases (e.g. a bare fallback word for an earlier stage
// that happens to appear as a substring of a later stage's more
// specific phrase, such as "approve" inside "RAC se approve"): when two
// matches share the same start offset, the entry listed first here is
// tried first, and the orchestrator (voiceExtraction.ts) resolves the
// overlap in the more-advanced stage's favor because that match's wider
// span "consumes" the window the shorter, earlier-stage match would
// otherwise have claimed. Keep new entries in this same descending
// order.
const STAGE_PHRASES: Array<{ stage: PipelineStage; patterns: RegExp[] }> = [
  {
    stage: 'DISBURSED',
    patterns: [
      /convert(ed)?\b/i,
      /loan\s*closed/i,
      /disburs\w*/i,
      /paisa\s*(mil|de)\s*(gaya|gayi|diya)\w*/i,
      /amount\s*credit(ed)?/i,
      /कन्वर्ट/i,
      /डिस्बर्स\w*/i,
      /डिस्बर्समेंट/i,
      /पैसा\s*(मिल|दे)\s*(गया|गई|दिया)\w*/i,
      /राशि\s*जमा\s*(हो\s*गई|कर\s*दी)\w*/i,
    ],
  },
  {
    stage: 'APPROVED',
    // This is the FINAL, post-RAC approval — deliberately NOT a bare
    // "approve"/"अप्रूव" word (that generic phrasing now belongs to
    // SANCTIONED, the earlier branch-level sanction). A safety-critical
    // distinction: unqualified "approved" language from a BM
    // overwhelmingly means the branch sanctioned the loan, not that RAC
    // gave final sign-off — so this stage only matches when the phrase
    // explicitly references RAC or a "final" qualifier.
    patterns: [
      /rac\s*(se|ne|se\s*bhi)?\s*(approv\w*|clear\w*)/i,
      /final(ly)?\s*approv\w*/i,
      /head\s*office\s*approv\w*/i,
      /आरएसी\s*से\s*(अप्रूव|क्लियर)\w*/i,
      /फाइनल\s*अप्रूव\w*/i,
    ],
  },
  {
    stage: 'TO_RAC',
    patterns: [
      /\bto\s*rac\b/i,
      /rac\s*ko\s*bhej\w*/i,
      /rac\s*(mein|main)\s*bhej\w*/i,
      /file\s*rac\s*(ko\s*)?bhej\w*/i,
      /regional\s*approv\w*\s*committee/i,
      /आरएसी\s*को\s*भेज\w*/i,
      /आरएसी\s*(मे|में)\s*भेज\w*/i,
      // Bare "RAC" as a broader fallback affirmative match, same
      // rationale as the historical bare "application" fallback below —
      // it exists so a negated statement like "RAC abhi nahi bheja"
      // still produces a match for isNegatedNear to inspect, even
      // though the specific "RAC ko bhej" phrase above won't match text
      // with a negation word inserted between "RAC" and "bhej".
      /\brac\b/i,
    ],
  },
  {
    stage: 'SANCTIONED',
    // Unchanged from this stage's previous incarnation (the old
    // APPROVAL stage) — "sanctioned"/"approved" without any RAC or
    // "final" qualifier is still the most common, most generic way a BM
    // describes a branch-level loan sanction.
    patterns: [
      /approv\w*/i,
      /sanction\w*/i,
      /अप्रूव/i,
      /स्वीकृत/i,
    ],
  },
  {
    stage: 'BRANCH_PROCESSING',
    // Unchanged in substance from the old APPLICATION stage — an
    // application under process at the branch — plus a little explicit
    // "branch is processing it" phrasing.
    patterns: [
      /application\s*(bhej|submit|sent)\w*/i,
      /applied/i,
      /branch\s*(mein\s*)?process\w*/i,
      /processing\s*(at|in)\s*branch/i,
      /आवेदन\s*भेज/i,
      /एप्लीकेशन\s*भेज/i,
      /शाखा\s*में\s*प्रक्रिया/i,
      // Bare "application" as a broader fallback affirmative match —
      // negation (e.g. "application pending", "application bhejna
      // baaki hai") is handled entirely by negationDetector.ts, not by
      // narrowing this pattern; see docs/VOICE_EXTRACTION_V2.md for why
      // "application pending" is treated as a negated/not-yet-applied
      // statement under this version's explicitly-requested negation
      // vocabulary (which includes the bare word "pending").
      /\bapplication\b/i,
    ],
  },
  {
    stage: 'DOCUMENTS_RECEIVED',
    // Deliberately NOT "contact(ed)/call(ed)" wording any more — that
    // first-contact meaning now lives entirely on LEAD_CONFIRMED. This
    // stage is specifically about the customer's documents having
    // actually been received/submitted.
    patterns: [
      /document\w*\s*(receiv\w*|submit\w*|collect\w*)/i,
      /docs?\s*(receiv\w*|submit\w*|mil\w*)/i,
      /kagaz\w*\s*(mil\w*|jama\w*|de\s*diy\w*)/i,
      /दस्तावेज़?\s*(मिल|प्राप्त)\w*/i,
      /कागज़ात\s*(मिल|जमा)\w*/i,
    ],
  },
  {
    stage: 'LEAD_CONFIRMED',
    // Merges the old INTERESTED stage with the old CONTACTED stage's
    // "first contact made" meaning — in the new 7-stage pipeline both
    // collapse into this single earliest stage (customer's interest and
    // initial contact are confirmed, before any documents are involved).
    patterns: [
      /interest(ed)?\b/i,
      /interest\s*dikhaya/i,
      /contact(ed)?\b/i,
      /call(ed)?\b/i,
      /\bspoke\b/i,
      /lead\s*confirm\w*/i,
      /baat\s*ho\s*ga(y?[ei])/i,
      /इंटरेस्टेड/i,
      /रुचि/i,
      /बात\s*हो\s*गई/i,
      /संपर्क\s*किया/i,
      /लीड\s*कन्फर्म\w*/i,
    ],
  },
];

// The stage a negated phrase for THIS stage's action actually resolves
// to — i.e. "the action for stage X has NOT happened" means the lead is
// still at the stage before X (spec's explicit negation examples),
// following the new 7-stage linear order. LEAD_CONFIRMED has no
// "before" stage — a negated "lead confirmed/interested/contacted"
// statement carries no safe positive information and is intentionally
// excluded from STAGE_PHRASES' negation handling (there is nothing
// before it to fall back to).
const STAGE_BEFORE: Partial<Record<PipelineStage, PipelineStage>> = {
  DOCUMENTS_RECEIVED: 'LEAD_CONFIRMED',
  BRANCH_PROCESSING: 'DOCUMENTS_RECEIVED',
  SANCTIONED: 'BRANCH_PROCESSING',
  TO_RAC: 'SANCTIONED',
  APPROVED: 'TO_RAC',
  DISBURSED: 'APPROVED',
};

// A generous window (characters) searched around a stage-phrase match
// for a negation marker — see negationDetector.ts for the exact rule.

export function findStageMatches(text: string): StageMatch[] {
  const matches: StageMatch[] = [];

  for (const entry of STAGE_PHRASES) {
    for (const pattern of entry.patterns) {
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let m: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((m = globalPattern.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;

        const negated = isNegatedNear(text, start, end);

        let resolvedStage = entry.stage;
        if (negated) {
          const before = STAGE_BEFORE[entry.stage];
          if (!before) {
            // A negated LEAD_CONFIRMED statement has no safe fallback
            // stage to report — skip rather than emit a misleading match.
            continue;
          }
          resolvedStage = before;
        }

        matches.push({ start, end, stage: resolvedStage, wasNegated: negated, matchedText: m[0] });

        // Prevent an infinite loop on zero-length matches (none of the
        // patterns above are zero-length, but this is a cheap safety net).
        if (globalPattern.lastIndex === m.index) globalPattern.lastIndex += 1;
      }
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}
