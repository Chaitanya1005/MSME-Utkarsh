import bcrypt from 'bcrypt';

// Cost factor of 12 is a reasonable balance of security vs. login latency
// for a Phase 1 internal application. Passwords are NEVER stored or logged
// in plaintext anywhere in this codebase (spec sections 12, 35, 50).
const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
