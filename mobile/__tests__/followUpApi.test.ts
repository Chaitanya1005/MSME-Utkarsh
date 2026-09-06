import { setAuthToken } from '../src/api/client';
import { confirmWhatsAppSent, createFollowUp, exchangeFollowUpAccessToken } from '../src/api/followUpApi';

describe('followUpApi', () => {
  afterEach(() => {
    setAuthToken(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = undefined;
  });

  it('createFollowUp posts recipientUserIds/channel/customNote to /follow-ups', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = init.body as string;
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            success: true,
            data: { followUpId: 'f1', channel: 'EMAIL', targets: [] },
          }),
      });
    });

    await createFollowUp({ recipientUserIds: ['u1', 'u2'], channel: 'EMAIL', customNote: 'hi' });

    expect(capturedUrl).toContain('/follow-ups');
    expect(JSON.parse(capturedBody!)).toEqual({
      recipientUserIds: ['u1', 'u2'],
      channel: 'EMAIL',
      customNote: 'hi',
    });
  });

  it('exchangeFollowUpAccessToken calls the public access endpoint with the token in the path', async () => {
    let capturedUrl: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              token: 'session-jwt',
              user: {
                id: 'u1',
                username: 'bm.a101',
                name: 'Test BM',
                role: 'BM',
                branchId: 'b1',
                orgUnitLabel: 'Branch Branch A101',
              },
            },
          }),
      });
    });

    const result = await exchangeFollowUpAccessToken('abc123');

    expect(capturedUrl).toContain('/follow-up-access/abc123');
    expect(result.user.role).toBe('BM');
  });

  it('confirmWhatsAppSent posts to the target"s confirm-sent endpoint', async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn((url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init.method;
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: { id: 't1', status: 'SENT' } }),
      });
    });

    await confirmWhatsAppSent('t1');

    expect(capturedUrl).toContain('/follow-ups/targets/t1/confirm-sent');
    expect(capturedMethod).toBe('POST');
  });
});
