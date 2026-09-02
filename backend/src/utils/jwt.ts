import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthTokenPayload } from '../types/domain';

export function signAuthToken(payload: AuthTokenPayload, expiresInOverride?: string): string {
  const options: SignOptions = {
    expiresIn: (expiresInOverride ?? env.jwtExpiresIn) as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.jwtSecret, options);
}

export class InvalidTokenError extends Error {}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string') {
      throw new InvalidTokenError('Malformed token payload');
    }
    return decoded as unknown as AuthTokenPayload;
  } catch {
    throw new InvalidTokenError('Invalid or expired session token');
  }
}
