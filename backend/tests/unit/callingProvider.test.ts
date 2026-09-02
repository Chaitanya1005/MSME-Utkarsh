import { DevMockCallingProvider } from '../../src/services/providers/callingProvider';

describe('DevMockCallingProvider', () => {
  const provider = new DevMockCallingProvider();

  it('accepts a valid phone number and returns a providerCallId', async () => {
    const result = await provider.placeCall('+911234500101');
    expect(result.accepted).toBe(true);
    expect(result.providerCallId).toEqual(expect.any(String));
    expect(result.providerCallId).toMatch(/^dev-mock-/);
  });

  it('rejects an empty phone number rather than pretending to place a call', async () => {
    const result = await provider.placeCall('');
    expect(result.accepted).toBe(false);
    expect(result.failureReason).toBeTruthy();
  });

  it('never claims a call is COMPLETED — only that the provider boundary accepted it', async () => {
    const result = await provider.placeCall('+911234500101');
    expect(result).not.toHaveProperty('completed');
    expect(result).not.toHaveProperty('status', 'COMPLETED');
  });
});
