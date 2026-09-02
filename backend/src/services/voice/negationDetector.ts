// Detects negation/pending markers near a matched stage phrase. Kept as
// its own module (rather than inlined in stageExtractor.ts) because this
// is the single most safety-critical piece of Voice Extraction V2 — spec:
// "generic positive keywords must never override a negation/pending
// phrase" — and having it independently unit-testable makes that
// guarantee verifiable in isolation from everything else.

// No \b anchors around the Devanagari alternatives — JS regex \b is
// defined against ASCII \w and does not create a boundary transition
// around Devanagari characters, so a \b-wrapped Devanagari pattern
// silently never matches (confirmed directly against real Hindi text:
// /\bनहीं\b/.test(...) is false). The ASCII alternatives keep their \b
// anchors since those work correctly for Latin script.
export const NEGATION_MARKERS =
  /\b(nahi|nahin|not|baaki|pending)\b|नहीं|बाकी|\babhi[^.]*karna\s*hai\b|अभी[^.]*करना\s*है/i;

// A "but/however" conjunction is treated as a hard boundary for
// FORWARD negation search only: a negation marker appearing after such
// a conjunction almost always modifies a *different* clause than the
// action just stated before it (spec's own example: "contact kiya
// lekin unka reply aana baaki hai" — the contact action IS complete;
// "baaki" describes the still-pending reply, not the contact). Without
// this boundary, a naive proximity window would incorrectly negate the
// completed action. Backward search (a negation marker stated BEFORE
// the action, e.g. "abhi contact karna baaki hai") is not clipped —
// there is no equivalent "but" pattern to worry about there.
const CLAUSE_BREAK = /\b(lekin|but|however|parantu)\b|परन्तु|लेकिन|किन्तु/i;

// A generous window (characters) searched around a stage-phrase match —
// wide enough to catch "abhi contact karna baaki hai" (the negation
// marker "baaki" sits after "karna", several characters past "contact")
// without reaching so far that it picks up a negation belonging to an
// unrelated, earlier statement in a long transcript.
export const NEGATION_WINDOW_CHARS = 40;

export function isNegatedNear(text: string, matchStart: number, matchEnd: number): boolean {
  const backStart = Math.max(0, matchStart - NEGATION_WINDOW_CHARS);
  const backText = text.slice(backStart, matchStart);
  const matchedText = text.slice(matchStart, matchEnd);

  const forwardEnd = Math.min(text.length, matchEnd + NEGATION_WINDOW_CHARS);
  const forwardRaw = text.slice(matchEnd, forwardEnd);
  const breakMatch = forwardRaw.match(CLAUSE_BREAK);
  const forwardWindow = breakMatch && breakMatch.index !== undefined ? forwardRaw.slice(0, breakMatch.index) : forwardRaw;

  // Reconstructed as ONE contiguous string (not two independent checks)
  // because some negation markers — "abhi ... karna hai" — legitimately
  // span text on both sides of the matched action itself ("abhi
  // CONTACT karna hai"); splitting the check would miss that the marker
  // wraps around the match.
  const combined = backText + matchedText + forwardWindow;
  return NEGATION_MARKERS.test(combined);
}
