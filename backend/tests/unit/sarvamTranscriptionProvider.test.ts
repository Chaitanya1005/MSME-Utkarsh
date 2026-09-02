// Per this project's own instruction ("do NOT make real Sarvam API
// calls inside automated unit tests... mock the Sarvam service"), the
// `sarvamai` SDK is mocked here. This tests SarvamTranscriptionProvider's
// own logic — request shape, response mapping, error handling — not
// Sarvam's actual API.

const mockTranscribe = jest.fn();

jest.mock('sarvamai', () => ({
  SarvamAIClient: jest.fn().mockImplementation(() => ({
    speechToText: { transcribe: mockTranscribe },
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SarvamTranscriptionProvider } = require('../../src/services/providers/sarvamTranscriptionProvider');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AppError } = require('../../src/utils/AppError');

describe('SarvamTranscriptionProvider', () => {
  beforeEach(() => {
    mockTranscribe.mockReset();
  });

  it('passes the decoded audio as a Buffer with filename/contentType metadata', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'Lead 101 approved', language_code: 'hi-IN', request_id: 'req1' });
    const provider = new SarvamTranscriptionProvider('fake-key');

    const base64 = Buffer.from('fake audio bytes').toString('base64');
    await provider.transcribe(base64, 'audio/m4a');

    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    const callArg = mockTranscribe.mock.calls[0][0];
    expect(Buffer.isBuffer(callArg.file.data)).toBe(true);
    expect(callArg.file.data.toString()).toBe('fake audio bytes');
    expect(callArg.file.contentType).toBe('audio/m4a');
  });

  it('maps a successful response to transcript/languageCode/requestId', async () => {
    mockTranscribe.mockResolvedValue({
      transcript: 'Lead 101 sanctioning par hai',
      language_code: 'hi-IN',
      request_id: 'req-abc',
      language_probability: 0.98,
    });
    const provider = new SarvamTranscriptionProvider('fake-key');

    const result = await provider.transcribe(Buffer.from('audio').toString('base64'), 'audio/m4a');

    expect(result.transcript).toBe('Lead 101 sanctioning par hai');
    expect(result.languageCode).toBe('hi-IN');
    expect(result.requestId).toBe('req-abc');
    expect(result.languageProbability).toBe(0.98);
  });

  it('rejects an empty decoded audio buffer without calling Sarvam', async () => {
    const provider = new SarvamTranscriptionProvider('fake-key');
    await expect(provider.transcribe('', 'audio/m4a')).rejects.toThrow(AppError);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('raises a clear error when Sarvam returns an empty transcript', async () => {
    mockTranscribe.mockResolvedValue({ transcript: '' });
    const provider = new SarvamTranscriptionProvider('fake-key');

    await expect(provider.transcribe(Buffer.from('audio').toString('base64'), 'audio/m4a')).rejects.toMatchObject({
      code: 'EMPTY_TRANSCRIPT',
    });
  });

  it('never leaks the raw Sarvam error to the caller', async () => {
    mockTranscribe.mockRejectedValue(new Error('some internal Sarvam stack trace with request details'));
    const provider = new SarvamTranscriptionProvider('fake-key');

    let caught: unknown;
    try {
      await provider.transcribe(Buffer.from('audio').toString('base64'), 'audio/m4a');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as InstanceType<typeof AppError>).message).not.toContain('stack trace');
    expect((caught as InstanceType<typeof AppError>).code).toBe('TRANSCRIPTION_PROVIDER_ERROR');
  });

  it('never logs the API key on a provider failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockTranscribe.mockRejectedValue(new Error('boom'));
    const provider = new SarvamTranscriptionProvider('super-secret-key-value');

    await expect(provider.transcribe(Buffer.from('audio').toString('base64'), 'audio/m4a')).rejects.toBeInstanceOf(
      AppError
    );

    const loggedText = consoleSpy.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(loggedText).not.toContain('super-secret-key-value');
    consoleSpy.mockRestore();
  });
});
