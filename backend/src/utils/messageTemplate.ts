// Centralized message-template logic (spec section 23). Kept here, not in
// any screen or controller, so there is exactly one place that knows what
// an approved MSME Utkarsh follow-up message looks like.

export interface MessageTemplateInput {
  branchName: string;
  regionName: string;
  rmName: string;
  accessUrl: string;
  // Optional RM customization, appended as a distinct, clearly-labeled
  // section rather than allowed to overwrite the operational content
  // (spec section 23: "support customization without allowing the RM to
  // accidentally remove critical information").
  customNote?: string;
}

const STANDARD_MESSAGE_HEADER =
  'MSME Utkarsh Follow-Up Request — Central Bank of India';

export function buildFollowUpMessage(input: MessageTemplateInput): string {
  const lines: string[] = [
    STANDARD_MESSAGE_HEADER,
    '',
    `Branch: ${input.branchName} (${input.regionName})`,
    `Requested by: ${input.rmName}, Regional Head`,
    '',
    'Please review and update your branch\'s lead pipeline at your earliest convenience.',
  ];

  if (input.customNote && input.customNote.trim().length > 0) {
    lines.push('', `Note from RM: ${input.customNote.trim()}`);
  }

  lines.push('', `Access your branch update link: ${input.accessUrl}`, '', 'This link is valid for a limited time and is intended only for the branch Head of the branch named above.');

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
