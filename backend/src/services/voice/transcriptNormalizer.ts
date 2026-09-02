// Normalizes raw transcript text before any reference/stage extraction
// runs. Pure string transformation only — no interpretation.

const DEVANAGARI_DIGITS: Record<string, string> = {
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

export function normalizeTranscript(raw: string): string {
  let text = raw;

  // Devanagari digit glyphs -> ASCII digits (occasionally present in
  // Sarvam's output alongside Latin-script content).
  text = text.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] ?? d);

  // Common transcription punctuation artifacts collapsed to plain
  // separators, preserving sentence/clause boundaries for the
  // orchestrator's segmentation step.
  text = text.replace(/[।]/g, '.'); // Devanagari danda -> period
  text = text.replace(/\s*-\s*/g, '-'); // "SR - 1001" -> "SR-1001" spacing artifact
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, ''); // zero-width characters

  // Collapse repeated whitespace, trim.
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}
