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
  // "contacted" phrase resolves to INTERESTED (the pre-contact stage),
  // not CONTACTED. Callers never need to separately apply negation.
  stage: PipelineStage;
  wasNegated: boolean;
  matchedText: string;
}

// A generous window (characters) searched around a stage-phrase match
// for a negation marker — see negationDetector.ts for the exact rule.
const STAGE_PHRASES: Array<{ stage: PipelineStage; patterns: RegExp[] }> = [
  {
    stage: 'CONVERSION',
    patterns: [
      /convert(ed)?\b/i,
      /loan\s*closed/i,
      /disburs\w*/i,
      /कन्वर्ट/i,
      /डिस्बर्स/i,
      /डिस्बर्समेंट/i,
    ],
  },
  {
    stage: 'APPROVAL',
    patterns: [
      /approv\w*/i,
      /sanction\w*/i,
      /अप्रूव/i,
      /स्वीकृत/i,
    ],
  },
  {
    stage: 'APPLICATION',
    patterns: [
      /application\s*(bhej|submit|sent)\w*/i,
      /applied/i,
      /आवेदन\s*भेज/i,
      /एप्लीकेशन\s*भेज/i,
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
    stage: 'CONTACTED',
    patterns: [
      /contact(ed)?\b/i,
      /call(ed)?\b/i,
      /\bspoke\b/i,
      /baat\s*ho\s*ga(y?[ei])/i,
      /बात\s*हो\s*गई/i,
      /संपर्क\s*किया/i,
    ],
  },
  {
    stage: 'INTERESTED',
    patterns: [
      /interest(ed)?\b/i,
      /interest\s*dikhaya/i,
      /इंटरेस्टेड/i,
      /रुचि/i,
    ],
  },
];

// The stage a negated phrase for THIS stage's action actually resolves
// to — i.e. "the action for stage X has NOT happened" means the lead is
// still at the stage before X (spec's explicit negation examples).
// INTERESTED has no "before" stage — a negated "interested" statement
// carries no safe positive information and is intentionally excluded
// from STAGE_PHRASES' negation handling (there is nothing before it to
// fall back to).
const STAGE_BEFORE: Partial<Record<PipelineStage, PipelineStage>> = {
  CONTACTED: 'INTERESTED',
  APPLICATION: 'CONTACTED',
  APPROVAL: 'APPLICATION',
  CONVERSION: 'APPROVAL',
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
            // A negated INTERESTED statement has no safe fallback stage
            // to report — skip rather than emit a misleading match.
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
