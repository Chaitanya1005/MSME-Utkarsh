/// <reference types="node" />
import { apiRequest, setAuthToken, ApiError, NetworkError } from '../src/api/client';

describe('apiRequest', () => {
  afterEach(() => {
    setAuthToken(null);
    (global as any).fetch = undefined;
  });

  it('attaches the bearer token when one is set', async () => {
    setAuthToken('abc123');
    let capturedHeaders: Record<string, string> | undefined;
    (global as any).fetch = jest.fn((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: { ok: true } }),
      });
    });

    await apiRequest('/auth/me');

    expect(capturedHeaders?.Authorization).toBe('Bearer abc123');
  });

  it('omits the Authorization header when no token is set', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    (global as any).fetch = jest.fn((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });

    await apiRequest('/health');

    expect(capturedHeaders?.Authorization).toBeUndefined();
  });

  it('throws ApiError with the server error code on a failure envelope', async () => {
    (global as any).fetch = jest.fn(() =>
      Promise.resolve({
        status: 403,
        json: () =>
          Promise.resolve({
            success: false,
            error: { code: 'AUTHORIZATION_ERROR', message: 'nope' },
          }),
      })
    );

    await expect(apiRequest('/leads/x')).rejects.toMatchObject(
      new ApiError('nope', 403, 'AUTHORIZATION_ERROR')
    );
  });

  it('throws NetworkError when fetch itself rejects', async () => {
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));

    await expect(apiRequest('/leads')).rejects.toBeInstanceOf(NetworkError);
  });
});
