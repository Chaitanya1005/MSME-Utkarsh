export type Role = 'RM' | 'BM' | 'CO' | 'ZM';

export type PipelineStage = 'INTERESTED' | 'CONTACTED' | 'APPLICATION' | 'APPROVAL' | 'CONVERSION';

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  region: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: Role;
    regionId: string | null;
    branchId: string | null;
  };
}

export interface BranchSummary {
  id: string;
  name: string;
  bm: { id: string; name: string; username: string } | null;
}

export interface RmScope {
  role: 'RM';
  region: { id: string; name: string; zone: string };
  branches: BranchSummary[];
}

export interface BmScope {
  role: 'BM';
  branch: { id: string; name: string; region: { id: string; name: string } };
}

export type OrgScope = RmScope | BmScope;

export interface Lead {
  id: string;
  sourceSrNo: string | null;
  customerName: string;
  customerPrimaryPhone: string;
  subProductName: string;
  amount: string; // Prisma Decimal is serialized as a string over JSON.
  sourceLeadStatus: string;
  sourceCategorization: 'A' | 'B' | 'C' | 'D';
  sourceStageProgress: 'UNDER_PROCESS' | 'SANCTIONED' | 'DOC_NOT_EXECUTED' | 'PENDING_AT_RAC' | 'DISBURSED';
  tentativeSanctionDate: string | null;
  tentativeDisbursementDate: string | null;
  sourceRemarks: string | null;
  cbiPesStage: PipelineStage;
  branchId: string | null;
  regionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedLeads {
  items: Lead[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// --- Phase 2: RM dashboard & follow-up types ------------------------------

export type BranchUpdateStatus = 'UPDATE_REQUIRED' | 'FOLLOW_UP_INITIATED' | 'RECENTLY_UPDATED';

export interface DashboardBranch {
  id: string;
  name: string;
  bm: { id: string; name: string } | null;
  totalLeads: number;
  leadsByStage: Record<PipelineStage, number>;
  lastLeadUpdateAt: string | null;
  latestFollowUp: { channel: FollowUpChannel; sentAt: string | null; status: FollowUpTargetStatus } | null;
  updateStatus: BranchUpdateStatus;
}

export interface RmDashboard {
  region: { id: string; name: string };
  branches: DashboardBranch[];
  summary: {
    totalBranches: number;
    branchesRequiringUpdate: number;
    branchesWithFollowUpInFlight: number;
    totalLeads: number;
  };
}

export type FollowUpChannel = 'WHATSAPP' | 'EMAIL';
export type FollowUpTargetStatus = 'PENDING' | 'SENT' | 'FAILED' | 'ACCESSED';

export interface CreateFollowUpRequest {
  branchIds: string[];
  channel: FollowUpChannel;
  customNote?: string;
}

export interface FollowUpTargetResult {
  // FollowUpTarget row id — required to confirm a WhatsApp target as
  // sent after the device opens the deep link.
  id: string;
  branchId: string;
  branchName: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  failureReason?: string;
  whatsAppDeepLinkUrl?: string;
}

export interface CreateFollowUpResult {
  followUpId: string;
  channel: FollowUpChannel;
  targets: FollowUpTargetResult[];
}

export interface FollowUpHistoryItem {
  id: string;
  channel: FollowUpChannel;
  messageBody: string;
  createdAt: string;
  targets: Array<{
    id: string;
    status: FollowUpTargetStatus;
    sentAt: string | null;
    accessedAt: string | null;
    failureReason: string | null;
    branch: { id: string; name: string };
  }>;
}

export interface FollowUpAccessResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: 'BM';
    branch: { id: string; name: string };
  };
}

// --- Phase 3/4: unified lead-update pipeline types ------------------------

export type UpdateSource = 'MANUAL' | 'VOICE_AI';
export type ProposalStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface LeadUpdateProposal {
  id: string;
  leadId: string;
  proposedByUserId: string;
  source: UpdateSource;
  previousStage: PipelineStage;
  proposedStage: PipelineStage;
  remarks: string | null;
  status: ProposalStatus;
  voiceSessionId: string | null;
  transcriptExcerpt: string | null;
  createdAt: string;
  confirmedAt: string | null;
  lead?: { id: string; customerName: string; subProductName: string };
}

export interface LeadActivityEntry {
  id: string;
  leadId: string;
  previousStage: PipelineStage;
  newStage: PipelineStage;
  remarks: string | null;
  performedByUserId: string;
  source: UpdateSource;
  proposalId: string;
  createdAt: string;
}

export interface BatchConfirmResultItem {
  proposalId: string;
  success: boolean;
  error?: string;
}

export type AmbiguityReason = 'NO_LEAD_MATCH' | 'MULTIPLE_LEAD_MATCH' | 'NO_STAGE_MATCH';

export interface ExtractedCandidate {
  rawClause: string;
  // The lead number as spoken/heard, independent of whether it resolved
  // — surfaced even on a no-match so the BM can see exactly what number
  // the extractor heard (spec: the real database identifier, not the
  // customer name, is the primary matching mechanism).
  spokenLeadNumber: string | null;
  matchedLeadId: string | null;
  matchedLeadName: string | null;
  candidateLeadIds: string[];
  proposedStage: PipelineStage | null;
  remarks: string;
  ambiguityReason: AmbiguityReason | null;
}

export interface VoiceExtractionResult {
  sessionId: string;
  candidates: ExtractedCandidate[];
}

export interface CreateProposalsFromSessionResult {
  created: number;
  failed: Array<{ leadId: string; error: string }>;
}

// Branch detail (RM view) — composed on the mobile side from existing
// org + leads endpoints rather than a new backend endpoint (see
// docs/PHASE3_4_SCOPE.md "why no new branch-detail endpoint").
export interface BranchDetail {
  id: string;
  name: string;
  region: { id: string; name: string };
  bm: { id: string; name: string; username: string; phoneNumber: string | null; email: string | null } | null;
}

// --- Phase 5: calling ------------------------------------------------------

export type CallStatus = 'INITIATED' | 'FAILED' | 'COMPLETED';

export interface Call {
  id: string;
  initiatedByUserId: string;
  branchId: string;
  calledUserId: string;
  calledPhoneNumber: string;
  status: CallStatus;
  providerCallId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}
