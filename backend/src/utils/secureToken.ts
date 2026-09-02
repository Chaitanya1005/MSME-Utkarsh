import crypto from 'crypto';

// The secure BM access mechanism (spec section 15). This is deliberately
// NOT a JWT and NOT reused from the authentication system: a follow-up
// link is a single-purpose, short-lived invitation, not a session
// credential, and it must never appear as a bearer token an attacker
// could replay against unrelated endpoints.
//
// Only the SHA-256 hash of the raw token is ever persisted (mirrors how
// passwords are handled — see utils/password.ts). The raw token exists
// only transiently: generated here, put into the outgoing message, and
// discarded. A database compromise alone can never reconstruct a usable
// access token, the same way it can never reconstruct a password.

const TOKEN_BYTES = 32; // 256 bits of entropy — not brute-forceable

export function generateAccessToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashAccessToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
