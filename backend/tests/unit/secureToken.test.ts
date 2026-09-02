import { generateAccessToken, hashAccessToken } from '../../src/utils/secureToken';

describe('secure access token', () => {
  it('generates a token with enough entropy to be unguessable (256 bits / 64 hex chars)', () => {
    const token = generateAccessToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different token on every call', () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(a).not.toEqual(b);
  });

  it('hashes deterministically — the same raw token always hashes the same way', () => {
    const token = generateAccessToken();
    expect(hashAccessToken(token)).toEqual(hashAccessToken(token));
  });

  it('produces different hashes for different tokens', () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(hashAccessToken(a)).not.toEqual(hashAccessToken(b));
  });

  it('never stores or returns the raw token from the hash (one-way)', () => {
    const token = generateAccessToken();
    const hash = hashAccessToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
  });
});
