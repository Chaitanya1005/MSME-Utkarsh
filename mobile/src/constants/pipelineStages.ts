import { PipelineStage } from '../types/api';

// Single source of truth for the 7-stage pipeline, previously duplicated
// across BranchDetailScreen, LeadDetailScreen, ProposeUpdateScreen,
// VoiceUpdateScreen, and ProposalReviewScreen (Full-Hierarchy Expansion
// plan, Phase 4 — centralized before adding RegionDetail/ZoneDetail as a
// 6th+ consumer).

export const STAGE_ORDER: PipelineStage[] = [
  'LEAD_CONFIRMED',
  'DOCUMENTS_RECEIVED',
  'BRANCH_PROCESSING',
  'SANCTIONED',
  'TO_RAC',
  'APPROVED',
  'DISBURSED',
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  LEAD_CONFIRMED: 'Lead Confirmed',
  DOCUMENTS_RECEIVED: 'Documents Received',
  BRANCH_PROCESSING: 'Branch Processing',
  SANCTIONED: 'Sanctioned',
  TO_RAC: 'To RAC',
  APPROVED: 'Approved',
  DISBURSED: 'Disbursed',
};

export interface StageMeta {
  label: string;
  // Same as `label` — kept as a separate field only so callers that used
  // to read `.short` (BranchDetailScreen) don't need a rename.
  short: string;
  color: string;
  background: string;
}

// Progressive palette: cool blue/teal for the early paperwork stages,
// warm amber/orange while the file is actively being processed, and
// green shades for the final approved/disbursed outcomes.
export const STAGE_META: Record<PipelineStage, StageMeta> = {
  LEAD_CONFIRMED: { label: 'Lead Confirmed', short: 'Lead Confirmed', color: '#0B5CAB', background: '#EAF2FB' },
  DOCUMENTS_RECEIVED: {
    label: 'Documents Received',
    short: 'Documents Received',
    color: '#0B7A96',
    background: '#E7F5F9',
  },
  BRANCH_PROCESSING: {
    label: 'Branch Processing',
    short: 'Branch Processing',
    color: '#B7791F',
    background: '#FFF6DF',
  },
  SANCTIONED: { label: 'Sanctioned', short: 'Sanctioned', color: '#C2650F', background: '#FFF0E1' },
  TO_RAC: { label: 'To RAC', short: 'To RAC', color: '#C1440E', background: '#FFEEE6' },
  APPROVED: { label: 'Approved', short: 'Approved', color: '#16845A', background: '#EAF8F1' },
  DISBURSED: { label: 'Disbursed', short: 'Disbursed', color: '#0F6B46', background: '#E3F5EC' },
};
