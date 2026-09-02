import { buildFollowUpMessage, sanitizeCustomNote } from '../../src/utils/messageTemplate';

describe('buildFollowUpMessage', () => {
  const baseInput = {
    branchName: 'Branch A101',
    regionName: 'Region A1',
    rmName: 'rm.a1',
    accessUrl: 'cbipes://follow-up-access/abc123',
  };

  it('includes the branch, region, RM, and access URL', () => {
    const message = buildFollowUpMessage(baseInput);
    expect(message).toContain('Branch A101');
    expect(message).toContain('Region A1');
    expect(message).toContain('rm.a1');
    expect(message).toContain('cbipes://follow-up-access/abc123');
  });

  it('never omits the access URL even when a custom note is present', () => {
    const message = buildFollowUpMessage({ ...baseInput, customNote: 'Please prioritize the Sharma lead.' });
    expect(message).toContain('cbipes://follow-up-access/abc123');
    expect(message).toContain('Please prioritize the Sharma lead.');
  });

  it('omits the custom note section entirely when no note is given', () => {
    const message = buildFollowUpMessage(baseInput);
    expect(message).not.toContain('Note from RM:');
  });

  it('omits the custom note section when the note is only whitespace', () => {
    const message = buildFollowUpMessage({ ...baseInput, customNote: '   ' });
    expect(message).not.toContain('Note from RM:');
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
