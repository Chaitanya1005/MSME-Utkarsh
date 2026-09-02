// Finds and resolves lead references within a transcript segment against
// the BM's own authorized lead list. Pure, deterministic — no
// Express/Prisma. This is the module the commissioning request calls
// out as the primary safety boundary: "the resolver must NEVER resolve
// a lead outside authorizedLeads," and "lead number is ALWAYS stronger
// than name" (an explicit number reference that fails to resolve must
// never silently fall back to a co-occurring name).

import { normalizeLeadIdentifier } from './spokenNumberParser';

export interface AuthorizedLeadForExtraction {
  id: string;
  customerName: string;
  sourceSrNo: string | null;
}

export type LeadRefKind = 'NUMBER' | 'NAME';

export interface LeadReference {
  kind: LeadRefKind;
  start: number;
  end: number;
  raw: string;
  spokenLeadNumber: string | null;
  matchedLeadId: string | null;
  candidateLeadIds: string[]; // populated only on NAME ambiguity
}

// Words that, when found within a couple of tokens before a bare
// number, indicate it is NOT a lead reference (spec's explicit
// false-positive examples: "loan amount is 1001", "customer number is
// 1001"). Deliberately an exclusion list rather than an inclusion list,
// because the demo transcripts routinely open a clause with a bare
// number ("1001 interested hai") with no trigger word at all — an
// inclusion-only design would miss that legitimate case.
const AMOUNT_CONTEXT_WORDS =
  /\b(amount|loan|rupees|rs\.?|₹|lakh|lakhs|crore|percent|%|rate|balance|emi|account|phone|mobile|customer\s*number)\s*(is|of|hai|he)?\s*$/i;

// No \b anchor for the same reason documented on WORD_NUMBER_TRIGGER
// below — \b does not work correctly with Devanagari script in JS regex.
const LEAD_TRIGGER = /(?:lead|लीड)/i;

const NUMBER_CANDIDATE = /\b(?:sr[\s-]?\d{2,6}|एसआर\s?\d{2,6}|एस\s?आर\s?\d{2,6}|\d{2,6})\b/gi;

// Word-number trigger phrases ("one thousand ...", "एक हजार/हज़ार ...")
// — normalizeLeadIdentifier already knows how to parse the full phrase,
// it just needs to be handed the right substring. This scan locates
// where such a phrase STARTS in the clause so a window of the following
// few tokens can be extracted and normalized.
// No \b word-boundary anchors here: JS regex \b is defined in terms of
// ASCII \w, which does not include Devanagari characters — a leading \b
// before "एक" silently fails to match (confirmed directly: /\bएक/.test
// is false against real Hindi text) because neither the preceding space
// nor "ए" itself counts as a \w character to create a boundary
// transition. Space-delimited matching below is sufficient here since
// these trigger phrases are always used as substring searches, not
// combined with other \b-anchored alternatives.
const WORD_NUMBER_TRIGGER = /(?:one\s+thousand|एक\s+(?:हजार|हज़ार))/gi;

function findWordNumberReferences(text: string): LeadReference[] {
  const refs: LeadReference[] = [];
  const re = new RegExp(WORD_NUMBER_TRIGGER.source, 'gi');
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const triggerEnd = start + m[0].length;

    // Only the next ONE OR TWO tokens after the trigger can possibly
    // form the numeric tail ("पांच", "बीस एक") — normalizeLeadIdentifier's
    // word-number parsers are only defined for 1–2 trailing tokens, so
    // grabbing more than that (e.g. the rest of the clause) would feed
    // them a tail they can't parse and silently produce no match, which
    // is exactly the bug this comment replaced.
    const afterTrigger = text.slice(triggerEnd).replace(/^\s+/, '');
    const tailTokens = afterTrigger.split(/\s+/).slice(0, 2);
    // Trim each token of any trailing punctuation/clause-boundary
    // character so a following word from elsewhere never leaks in.
    const cleanTailTokens = tailTokens.map((t) => t.split(/[.,;]/)[0]).filter(Boolean);

    for (let tailLength = cleanTailTokens.length; tailLength >= 0; tailLength -= 1) {
      const candidate = `${m[0]} ${cleanTailTokens.slice(0, tailLength).join(' ')}`.trim();
      const normalized = normalizeLeadIdentifier(candidate);
      if (normalized) {
        refs.push({
          kind: 'NUMBER',
          start,
          end: start + candidate.length,
          raw: candidate,
          spokenLeadNumber: normalized,
          matchedLeadId: null,
          candidateLeadIds: [],
        });
        break;
      }
    }
  }
  return refs;
}

function findLeadTriggerPositions(text: string): number[] {
  const positions: number[] = [];
  const re = new RegExp(LEAD_TRIGGER.source, 'gi');
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    positions.push(m.index);
  }
  return positions;
}

// Finds every plausible numeric lead reference in a text segment,
// applying the amount-context exclusion rule to bare (non-triggered,
// non-SR-prefixed) numbers.
export function findNumberReferences(text: string): LeadReference[] {
  const refs: LeadReference[] = [];
  const triggerPositions = findLeadTriggerPositions(text);

  const re = new RegExp(NUMBER_CANDIDATE.source, 'gi');
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;

    const isSrPrefixed = /^sr|^एसआर|^एस\s?आर/i.test(raw);
    const isExplicitTrigger = triggerPositions.some((tp) => tp < start && start - tp <= 20);

    if (!isSrPrefixed && !isExplicitTrigger) {
      const before = text.slice(Math.max(0, start - 30), start);
      if (AMOUNT_CONTEXT_WORDS.test(before)) {
        continue;
      }
    }

    const normalized = normalizeLeadIdentifier(raw);
    if (!normalized) continue;

    refs.push({
      kind: 'NUMBER',
      start,
      end,
      raw,
      spokenLeadNumber: normalized,
      matchedLeadId: null,
      candidateLeadIds: [],
    });
  }

  const wordRefs = findWordNumberReferences(text);
  for (const wordRef of wordRefs) {
    // Avoid a duplicate if a digit-based match already covers the same
    // span (shouldn't normally happen given the two patterns target
    // disjoint text shapes, but kept as a defensive guard).
    const overlaps = refs.some((r) => r.start < wordRef.end && wordRef.start < r.end);
    if (!overlaps) refs.push(wordRef);
  }

  refs.sort((a, b) => a.start - b.start);
  return refs;
}

export function resolveNumberReference(
  ref: LeadReference,
  authorizedLeads: AuthorizedLeadForExtraction[]
): LeadReference {
  const lead = authorizedLeads.find((l) => l.sourceSrNo === ref.spokenLeadNumber);
  return { ...ref, matchedLeadId: lead ? lead.id : null };
}

// --- Name matching -----------------------------------------------------

const HONORIFIC_TOKENS = new Set(['ji', 'जी', 'mr', 'mrs', 'ms', 'shri', 'श्री']);

function normalizeNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !HONORIFIC_TOKENS.has(t));
}

function clauseContainsNameToken(clauseTokens: Set<string>, nameToken: string): boolean {
  return clauseTokens.has(nameToken);
}

export function findNameReferences(
  text: string,
  authorizedLeads: AuthorizedLeadForExtraction[]
): LeadReference[] {
  // eslint-disable-next-line no-misleading-character-class -- intentional Devanagari Unicode range, not a combining-character literal
  const clauseTokensRaw = text.toLowerCase().match(/[a-z\u0900-\u097F]+/g) ?? [];
  const clauseTokenSet = new Set(clauseTokensRaw.filter((t) => !HONORIFIC_TOKENS.has(t)));

  if (clauseTokenSet.size === 0) return [];

  const exactFullMatches: AuthorizedLeadForExtraction[] = [];
  const singleTokenMatches: Map<string, AuthorizedLeadForExtraction[]> = new Map();

  for (const lead of authorizedLeads) {
    const nameTokens = normalizeNameTokens(lead.customerName);
    if (nameTokens.length === 0) continue;

    const allTokensPresent = nameTokens.every((t) => clauseContainsNameToken(clauseTokenSet, t));
    if (allTokensPresent && nameTokens.length >= 2) {
      exactFullMatches.push(lead);
      continue;
    }

    for (const token of nameTokens) {
      if (token.length >= 3 && clauseContainsNameToken(clauseTokenSet, token)) {
        const bucket = singleTokenMatches.get(token) ?? [];
        bucket.push(lead);
        singleTokenMatches.set(token, bucket);
      }
    }
  }

  if (exactFullMatches.length === 0 && singleTokenMatches.size === 0) {
    return [];
  }

  const uniqueFullMatches = Array.from(new Set(exactFullMatches.map((l) => l.id))).map(
    (id) => exactFullMatches.find((l) => l.id === id)!
  );

  if (uniqueFullMatches.length > 0) {
    if (uniqueFullMatches.length === 1) {
      return [
        {
          kind: 'NAME',
          start: 0,
          end: text.length,
          raw: uniqueFullMatches[0].customerName,
          spokenLeadNumber: null,
          matchedLeadId: uniqueFullMatches[0].id,
          candidateLeadIds: [],
        },
      ];
    }
    return [
      {
        kind: 'NAME',
        start: 0,
        end: text.length,
        raw: uniqueFullMatches.map((l) => l.customerName).join(' / '),
        spokenLeadNumber: null,
        matchedLeadId: null,
        candidateLeadIds: uniqueFullMatches.map((l) => l.id),
      },
    ];
  }

  const allSingleTokenLeadIds = new Set<string>();
  for (const bucket of singleTokenMatches.values()) {
    for (const lead of bucket) allSingleTokenLeadIds.add(lead.id);
  }

  if (allSingleTokenLeadIds.size === 1) {
    const id = Array.from(allSingleTokenLeadIds)[0];
    const lead = authorizedLeads.find((l) => l.id === id)!;
    return [
      {
        kind: 'NAME',
        start: 0,
        end: text.length,
        raw: lead.customerName,
        spokenLeadNumber: null,
        matchedLeadId: lead.id,
        candidateLeadIds: [],
      },
    ];
  }

  return [
    {
      kind: 'NAME',
      start: 0,
      end: text.length,
      raw: Array.from(allSingleTokenLeadIds)
        .map((id) => authorizedLeads.find((l) => l.id === id)!.customerName)
        .join(' / '),
      spokenLeadNumber: null,
      matchedLeadId: null,
      candidateLeadIds: Array.from(allSingleTokenLeadIds),
    },
  ];
}
