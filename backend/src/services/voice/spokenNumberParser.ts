// Turns a spoken/transcribed lead-number reference into its canonical
// numeric string form (e.g. "1001"). Pure, deterministic, no I/O.
//
// SCOPE (documented, not silently assumed): the request that commissioned
// this module explicitly says to "prioritize reliability for [the
// development lead-number] range rather than implementing an
// unnecessarily huge natural-language number parser." The supported
// word-number range is 0–1099, which covers every seeded lead number
// (1001–1057) with headroom. Values outside that range fall back to
// digit-sequence parsing only (still correct for digits actually spoken
// as digits, e.g. "1234"), not word-form parsing — see
// docs/VOICE_EXTRACTION_V2.md for the exact boundary.

const HINDI_DIGIT_WORDS: Record<string, string> = {
  शून्य: '0',
  जीरो: '0',
  ज़ीरो: '0',
  एक: '1',
  वन: '1', // Devanagari transliteration of the English word "one" — common in code-mixed digit-by-digit STT output
  दो: '2',
  तीन: '3',
  चार: '4',
  पांच: '5',
  पाँच: '5',
  छह: '6',
  छः: '6',
  सात: '7',
  आठ: '8',
  नौ: '9',
};

const ENGLISH_DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  won: '1', // common STT mishearing of "one"
};

// 0–19
const ENGLISH_ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const ENGLISH_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

// Hindi 0–99, built by combination rules would be large and error-prone
// for an underspecified NLP task; this project's seed data only needs
// 0–99 for the "one thousand X" tail (1000–1099), so the direct lookup
// below is deliberately hand-enumerated rather than algorithmically
// derived, to avoid producing wrong Hindi forms for numbers that don't
// actually follow a simple compositional pattern (Hindi tens are
// famously irregular — "इक्कीस" for 21 is not "बीस एक").
const HINDI_TENS_LOOKUP: Record<string, number> = {
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  पन्द्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  इक्कीस: 21,
  बाईस: 22,
  तेईस: 23,
  चौबीस: 24,
  पच्चीस: 25,
  छब्बीस: 26,
  सत्ताईस: 27,
  अट्ठाईस: 28,
  उनतीस: 29,
  तीस: 30,
  इकतीस: 31,
  बत्तीस: 32,
  पैंतीस: 35,
  चालीस: 40,
  पैंतालीस: 45,
  पचास: 50,
  साठ: 60,
  सत्तर: 70,
  अस्सी: 80,
  नब्बे: 90,
};

function normalizeDevanagariDigits(text: string): string {
  // Devanagari digit glyphs (०-९) occasionally appear in STT output.
  const map: Record<string, string> = {
    '०': '0',
    '१': '1',
    '२': '2',
    '३': '3',
    '४': '4',
    '५': '5',
    '६': '6',
    '७': '7',
    '८': '8',
    '९': '9',
  };
  return text.replace(/[०-९]/g, (d) => map[d] ?? d);
}

// Parses a Hindi phrase for "one thousand <tail>" forms — the only
// Hindi word-number shape this project's lead-number range needs.
// Handles both "एक हजार" and the "ज़"-spelling variant "एक हज़ार",
// with an optional tail parsed via HINDI_TENS_LOOKUP or two consecutive
// single Hindi digit words (e.g. "एक हज़ार शून्य एक" = 1001).
function parseHindiThousandPhrase(tokens: string[]): string | null {
  const oneThousandIdx = tokens.findIndex(
    (t, i) => (t === 'एक' && (tokens[i + 1] === 'हजार' || tokens[i + 1] === 'हज़ार'))
  );
  if (oneThousandIdx === -1) return null;

  const tail = tokens.slice(oneThousandIdx + 2);
  if (tail.length === 0) return '1000';

  // "एक हज़ार पांच" -> 1005
  if (tail.length === 1 && HINDI_DIGIT_WORDS[tail[0]] !== undefined) {
    return String(1000 + Number(HINDI_DIGIT_WORDS[tail[0]]));
  }
  if (tail.length === 1 && HINDI_TENS_LOOKUP[tail[0]] !== undefined) {
    return String(1000 + HINDI_TENS_LOOKUP[tail[0]]);
  }
  // "एक हज़ार शून्य एक" -> 1001 (digit-by-digit tail, exactly two digits)
  if (tail.length === 2 && HINDI_DIGIT_WORDS[tail[0]] !== undefined && HINDI_DIGIT_WORDS[tail[1]] !== undefined) {
    const tens = Number(HINDI_DIGIT_WORDS[tail[0]]);
    const ones = Number(HINDI_DIGIT_WORDS[tail[1]]);
    return String(1000 + tens * 10 + ones);
  }
  return null;
}

// Parses an English phrase for "one thousand <tail>" forms, tail being
// either a bare 0–99 word-number ("one thousand five", "one thousand
// twenty one" needs a tens+ones pair) or a two/four-digit sequence
// ("one thousand and one", "one zero zero one").
function parseEnglishThousandPhrase(tokens: string[]): string | null {
  const oneThousandIdx = tokens.findIndex((t, i) => t === 'one' && tokens[i + 1] === 'thousand');
  if (oneThousandIdx === -1) return null;

  let tail = tokens.slice(oneThousandIdx + 2);
  if (tail[0] === 'and') tail = tail.slice(1);
  if (tail.length === 0) return '1000';

  if (tail.length === 1 && ENGLISH_ONES[tail[0]] !== undefined) {
    return String(1000 + ENGLISH_ONES[tail[0]]);
  }
  if (tail.length === 1 && ENGLISH_TENS[tail[0]] !== undefined) {
    return String(1000 + ENGLISH_TENS[tail[0]]);
  }
  if (tail.length === 2 && ENGLISH_TENS[tail[0]] !== undefined && ENGLISH_ONES[tail[1]] !== undefined) {
    return String(1000 + ENGLISH_TENS[tail[0]] + ENGLISH_ONES[tail[1]]);
  }
  return null;
}

// Digit-by-digit speech: a run of individually-spoken digit words
// ("one zero zero one", "वन जीरो जीरो वन", "एक शून्य शून्य एक") that,
// concatenated, form the lead number. Requires at least 2 consecutive
// digit-words to avoid mistaking a lone "one" for a lead number.
function parseDigitByDigit(tokens: string[]): string | null {
  const digits: string[] = [];
  for (const token of tokens) {
    const d = ENGLISH_DIGIT_WORDS[token] ?? HINDI_DIGIT_WORDS[token];
    if (d === undefined) {
      if (digits.length >= 2) break;
      digits.length = 0;
      continue;
    }
    digits.push(d);
  }
  if (digits.length >= 2) {
    // Strip a single leading zero (unlikely for a real lead number but
    // keeps the numeric parse well-defined); leave real internal zeros
    // (as in "1001") untouched.
    const joined = digits.join('');
    return String(Number(joined));
  }
  return null;
}

// Recognizes an optional spoken "SR" prefix (English or Hindi
// transliteration) preceding a number — SR is never part of the stored
// canonical identifier, only a spoken convention some BMs may still use.
const SR_PREFIX_PATTERN = /\b(?:sr[\s-]?|एसआर\s?|एस\s?आर\s?)(\d{2,6})\b/i;

// The single canonical entry point (per the commissioning request's own
// naming): given a raw string already believed to reference a lead
// number (see leadResolver.ts / voiceExtraction.ts for the surrounding
// context-detection that decides WHEN to call this), returns the
// normalized numeric identifier, or null if none could be determined.
export function normalizeLeadIdentifier(value: string): string | null {
  if (!value) return null;
  let text = normalizeDevanagariDigits(value.trim().toLowerCase());
  text = text.replace(/[.,#]/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // 1. Explicit SR-prefixed digit sequence, in any of the accepted spoken forms.
  const srMatch = value.match(SR_PREFIX_PATTERN);
  if (srMatch) {
    return String(Number(srMatch[1]));
  }

  // 2. A bare digit sequence (plain "1001", "SR1001" already handled
  // above, "lead 1001" after its "lead"/"number"/"no" filler words have
  // already been stripped by the caller).
  const bareDigits = text.match(/\b(\d{2,6})\b/);
  if (bareDigits) {
    return String(Number(bareDigits[1]));
  }

  const tokens = text.split(/\s+/).filter(Boolean);

  // 3. Word-number forms — English/Hindi "one thousand X".
  const englishThousand = parseEnglishThousandPhrase(tokens);
  if (englishThousand) return englishThousand;

  const hindiThousand = parseHindiThousandPhrase(tokens);
  if (hindiThousand) return hindiThousand;

  // 4. Digit-by-digit speech.
  const digitByDigit = parseDigitByDigit(tokens);
  if (digitByDigit) return digitByDigit;

  return null;
}
