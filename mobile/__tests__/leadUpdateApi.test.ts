import { setAuthToken } from '../src/api/client';
import { createManualProposal, confirmProposalsBatch, rejectProposal } from '../src/api/leadUpdateApi';
import { extractFromTranscript, createProposalsFromSession } from '../src/api/voiceUpdateApi';

describe('leadUpdateApi', () => {
  afterEach(() => {
    setAuthToken(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = undefined;
  });

  it('createManualProposal posts to /bm/leads/:id/proposals with the stage and remarks', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = init.body as string;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { id: 'p1' } }) });
    });

    await createManualProposal('lead1', 'CONTACTED', 'Called the customer');

    expect(capturedUrl).toContain('/bm/leads/lead1/proposals');
    expect(JSON.parse(capturedBody!)).toEqual({ proposedStage: 'CONTACTED', remarks: 'Called the customer' });
  });

  it('confirmProposalsBatch posts the id array to /bm/proposals/confirm-batch', async () => {
    let capturedBody: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    });

    await confirmProposalsBatch(['p1', 'p2']);
    expect(JSON.parse(capturedBody!)).toEqual({ proposalIds: ['p1', 'p2'] });
  });

  it('rejectProposal posts to /bm/proposals/:id/reject', async () => {
    let capturedUrl: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: {} }) });
    });

    await rejectProposal('p1');
    expect(capturedUrl).toContain('/bm/proposals/p1/reject');
  });
});

describe('voiceUpdateApi', () => {
  afterEach(() => {
    setAuthToken(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = undefined;
  });

  it('extractFromTranscript posts the transcript to /bm/voice-updates/extract', async () => {
    let capturedBody: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: { sessionId: 's1', candidates: [] } }),
      });
    });

    const result = await extractFromTranscript('Sharma ji ka loan contacted ho gaya');
    expect(JSON.parse(capturedBody!)).toEqual({ transcript: 'Sharma ji ka loan contacted ho gaya' });
    expect(result.sessionId).toBe('s1');
  });

  it('createProposalsFromSession posts items to /bm/voice-updates/sessions/:id/proposals', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = init.body as string;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { created: 1, failed: [] } }) });
    });

    await createProposalsFromSession('s1', [{ leadId: 'l1', proposedStage: 'CONTACTED', remarks: 'test' }]);
    expect(capturedUrl).toContain('/bm/voice-updates/sessions/s1/proposals');
    expect(JSON.parse(capturedBody!)).toEqual({
      items: [{ leadId: 'l1', proposedStage: 'CONTACTED', remarks: 'test' }],
    });
  });
});
