import { NextFunction, Request, Response } from 'express';
import { AuthenticationError } from '../utils/AppError';
import { verifyAuthToken } from '../utils/jwt';

// Expects `Authorization: Bearer <token>`. On success, attaches the
// decoded user identity to req.user for downstream authorization checks
// and controllers. Never trusts any client-supplied identity that did not
// come from a verified token (spec sections 13, 27).
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new AuthenticationError('Missing session token');
  }

  // Throws AuthenticationError-compatible InvalidTokenError on failure;
  // caught by the async wrapper / centralized error handler.
  try {
    req.user = verifyAuthToken(token);
  } catch {
    throw new AuthenticationError('Invalid or expired session. Please log in again.');
  }

  next();
}
