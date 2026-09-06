// Centralized message-template logic (spec section 23). Kept here, not in
// any screen or controller, so there is exactly one place that knows what
// an approved MSME Utkarsh follow-up message looks like.

import { Role } from '../types/domain';

// Human-readable label for each role, used in both the "Requested by"
// line and the closing "intended only for" line — generalized from a
// hardcoded "Regional Head" so the same template serves every
// sender/recipient pair in the hierarchy (Full-Hierarchy Expansion plan,
// Phase 3).
export const ROLE_LABELS: Record<Role, string> = {
  RM: 'Regional Head',
  ZM: 'Zonal Head',
  CO: 'General Manager',
  BM: 'Branch Head',
};

export interface MessageTemplateInput {
  // Precomputed by the caller from the recipient's org assignment —
  // "Branch: X (Region Y)" / "Region: X (Zone Y)" / "Zone: X" — rather
  // than baking branch/region-specific formatting into this function.
  orgUnitLine: string;
  senderName: string;
  senderRole: Role;
  recipientName: string;
  recipientRole: Role;
  accessUrl: string;
  // Optional customization, appended as a distinct, clearly-labeled
  // section rather than allowed to overwrite the operational content
  // (spec section 23: "support customization without allowing the
  // sender to accidentally remove critical information").
  customNote?: string;
}

const STANDARD_MESSAGE_HEADER =
  'MSME Utkarsh Follow-Up Request — Central Bank of India';

export function buildFollowUpMessage(input: MessageTemplateInput): string {
  const lines: string[] = [
    STANDARD_MESSAGE_HEADER,
    '',
    input.orgUnitLine,
    `Requested by: ${ROLE_LABELS[input.senderRole]} (${input.senderName})`,
    '',
    'Please review and update your lead pipeline at your earliest convenience.',
  ];

  if (input.customNote && input.customNote.trim().length > 0) {
    lines.push('', `Note from ${ROLE_LABELS[input.senderRole]}: ${input.customNote.trim()}`);
  }

  lines.push(
    '',
    `Access your update link: ${input.accessUrl}`,
    '',
    `This link is valid for a limited time and is intended only for the ${ROLE_LABELS[input.recipientRole]} named above.`
  );

  return lines.join('\n');
}

// Enforces the "cannot accidentally remove critical information" rule:
// customization is a bounded addendum, not a replacement of the template.
// A hard length cap keeps messages readable on WhatsApp/email previews
// and prevents the addendum from burying the operational content above it.
const MAX_CUSTOM_NOTE_LENGTH = 300;

export function sanitizeCustomNote(rawNote: string | undefined): string | undefined {
  if (!rawNote) return undefined;
  const trimmed = rawNote.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, MAX_CUSTOM_NOTE_LENGTH);
}
