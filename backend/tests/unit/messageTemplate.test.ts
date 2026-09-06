import { buildFollowUpMessage, sanitizeCustomNote, ROLE_LABELS } from '../../src/utils/messageTemplate';

describe('buildFollowUpMessage', () => {
  const baseInput = {
    orgUnitLine: 'Branch: Branch A101 (Region: Region A1)',
    senderName: 'rm.a1',
    senderRole: 'RM' as const,
    recipientName: 'bm.a101',
    recipientRole: 'BM' as const,
    accessUrl: 'cbipes://follow-up-access/abc123',
  };

  it('includes the org unit line, sender name, role label, and access URL', () => {
    const message = buildFollowUpMessage(baseInput);
    expect(message).toContain('Branch: Branch A101 (Region: Region A1)');
    expect(message).toContain('Requested by: Regional Head (rm.a1)');
    expect(message).toContain('cbipes://follow-up-access/abc123');
  });

  it('never omits the access URL even when a custom note is present', () => {
    const message = buildFollowUpMessage({ ...baseInput, customNote: 'Please prioritize the Sharma lead.' });
    expect(message).toContain('cbipes://follow-up-access/abc123');
    expect(message).toContain('Please prioritize the Sharma lead.');
  });

  it('omits the custom note section entirely when no note is given', () => {
    const message = buildFollowUpMessage(baseInput);
    expect(message).not.toContain('Note from');
  });

  it('omits the custom note section when the note is only whitespace', () => {
    const message = buildFollowUpMessage({ ...baseInput, customNote: '   ' });
    expect(message).not.toContain('Note from');
  });

  // Every sender/recipient pair actually reachable via
  // authorization.ts#canInitiateFollowUpTo (Full-Hierarchy Expansion
  // plan, Phase 3) — RM never receives a follow-up in this model, so
  // RM only ever appears as sender.
  it.each([
    ['RM', 'BM'],
    ['ZM', 'RM'],
    ['ZM', 'BM'],
    ['CO', 'ZM'],
    ['CO', 'RM'],
    ['CO', 'BM'],
  ] as const)('renders the correct role labels for %s -> %s', (senderRole, recipientRole) => {
    const message = buildFollowUpMessage({
      ...baseInput,
      senderName: 'sender.name',
      senderRole,
      recipientName: 'recipient.name',
      recipientRole,
    });
    expect(message).toContain(`Requested by: ${ROLE_LABELS[senderRole]} (sender.name)`);
    expect(message).toContain(`intended only for the ${ROLE_LABELS[recipientRole]} named above`);
  });

  it('actually interpolates senderName into the "Note from" line, not a hardcoded role', () => {
    const message = buildFollowUpMessage({
      ...baseInput,
      senderRole: 'ZM',
      customNote: 'Please expedite.',
    });
    expect(message).toContain('Note from Zonal Head: Please expedite.');
  });
});

describe('sanitizeCustomNote', () => {
  it('returns undefined for an undefined note', () => {
    expect(sanitizeCustomNote(undefined)).toBeUndefined();
  });

  it('returns undefined for a whitespace-only note', () => {
    expect(sanitizeCustomNote('   ')).toBeUndefined();
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeCustomNote('  hello  ')).toBe('hello');
  });

  it('caps the note length so it cannot bury the operational content', () => {
    const longNote = 'x'.repeat(1000);
    const sanitized = sanitizeCustomNote(longNote);
    expect(sanitized).toBeDefined();
    expect(sanitized!.length).toBeLessThanOrEqual(300);
  });
});
