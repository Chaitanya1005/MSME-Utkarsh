import { signAuthToken, verifyAuthToken, InvalidTokenError } from '../../src/utils/jwt';
import { AuthTokenPayload } from '../../src/types/domain';

describe('JWT auth token', () => {
  const rmPayload: AuthTokenPayload = { userId: 'u1', username: 'rm.a1', role: 'RM', regionId: 'region-A1' };
  const bmPayload: AuthTokenPayload = { userId: 'u2', username: 'bm.a101', role: 'BM', branchId: 'branch-A101' };

  it('round-trips an RM payload', () => {
    const token = signAuthToken(rmPayload);
    const decoded = verifyAuthToken(token);
    expect(decoded.userId).toBe(rmPayload.userId);
    expect(decoded.role).toBe('RM');
    expect(decoded.regionId).toBe('region-A1');
    expect(decoded.branchId).toBeUndefined();
  });

  it('round-trips a BM payload', () => {
    const token = signAuthToken(bmPayload);
    const decoded = verifyAuthToken(token);
    expect(decoded.role).toBe('BM');
    expect(decoded.branchId).toBe('branch-A101');
  });

  it('rejects a garbage token', () => {
    expect(() => verifyAuthToken('not-a-real-token')).toThrow(InvalidTokenError);
  });

  it('rejects a token signed with a different secret', () => {
    // Simulate a forged token by signing with jsonwebtoken directly using
    // a secret that does not match the configured JWT_SECRET.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign(rmPayload, 'wrong-secret');
    expect(() => verifyAuthToken(forged)).toThrow(InvalidTokenError);
  });

  it('rejects an expired token', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(rmPayload, process.env.JWT_SECRET as string, { expiresIn: -10 });
    expect(() => verifyAuthToken(expired)).toThrow(InvalidTokenError);
  });
});
