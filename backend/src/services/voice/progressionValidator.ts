// Pure validation of a proposed stage transition against a lead's
// current stage. Deliberately has NO Prisma dependency — the
// commissioning request is explicit: "if current stage information is
// unavailable at the pure extraction layer, keep extraction pure;
// perform progression validation in the service layer where current
// Lead data is available." This module is that separate, pure
// validation step — voiceUpdate.service.ts calls it once it has fetched
// the lead's real current stage.

import { PipelineStage } from '../../types/domain';

const STAGE_ORDER: PipelineStage[] = [
  'LEAD_CONFIRMED',
  'DOCUMENTS_RECEIVED',
  'BRANCH_PROCESSING',
  'SANCTIONED',
  'TO_RAC',
  'APPROVED',
  'DISBURSED',
];

export type ProgressionResult =
  | { safe: true }
  | { safe: false; reason: 'BACKWARD_TRANSITION'; currentStage: PipelineStage; proposedStage: PipelineStage };

// Forward and same-stage transitions are always safe. A backward
// transition (e.g. current BRANCH_PROCESSING, voice says LEAD_CONFIRMED;
// current DISBURSED, voice says DOCUMENTS_RECEIVED) is flagged for the
// existing review workflow rather than silently applied — the BM still
// sees it on the review screen, but it is never auto-created as a plain,
// unremarkable PENDING proposal.
export function validateProgression(currentStage: PipelineStage, proposedStage: PipelineStage): ProgressionResult {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const proposedIndex = STAGE_ORDER.indexOf(proposedStage);

  if (proposedIndex < currentIndex) {
    return { safe: false, reason: 'BACKWARD_TRANSITION', currentStage, proposedStage };
  }
  return { safe: true };
}
