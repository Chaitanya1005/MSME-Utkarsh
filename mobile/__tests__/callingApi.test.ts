import { setAuthToken } from '../src/api/client';
import { initiateCall, fetchMyInitiatedCalls, fetchMyReceivedCalls } from '../src/api/callingApi';

describe('callingApi', () => {
  afterEach(() => {
    setAuthToken(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = undefined;
  });

  it('initiateCall posts to /rm/branches/:branchId/call with no phone number in the body', async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    let capturedBody: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init.method;
      capturedBody = init.body as string;
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: { id: 'call1', status: 'INITIATED' } }),
      });
    });

    const result = await initiateCall('branch1');

    expect(capturedUrl).toContain('/rm/branches/branch1/call');
    expect(capturedMethod).toBe('POST');
    // The mobile client never sends a phone number — the backend derives
    // it from the branch/BM relationship (spec Phase 5 section 12).
    expect(capturedBody).toBeUndefined();
    expect(result.status).toBe('INITIATED');
  });

  it('fetchMyInitiatedCalls requests /rm/calls', async () => {
    let capturedUrl: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    });

    await fetchMyInitiatedCalls();
    expect(capturedUrl).toContain('/rm/calls');
  });

  it('fetchMyReceivedCalls requests /bm/calls', async () => {
    let capturedUrl: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
    });

    await fetchMyReceivedCalls();
    expect(capturedUrl).toContain('/bm/calls');
  });
});
