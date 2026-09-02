// Voice Extraction V2 lives in ./voice/ as a set of focused, pure
// modules (transcriptNormalizer, spokenNumberParser, leadResolver,
// stageExtractor, negationDetector, progressionValidator, orchestrated
// by voice/voiceExtraction.ts). This file is kept as a thin re-export so
// every existing import of '../services/voiceExtraction' (or
// './voiceExtraction' from sibling files) continues to work unchanged —
// per this migration's explicit instruction not to change the existing
// API contract or call sites unless absolutely necessary.
export * from './voice/voiceExtraction';
