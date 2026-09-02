import { NextFunction, Request, Response } from 'express';
import { AuthenticationError, AuthorizationError } from '../utils/AppError';
import { Role } from '../types/domain';

// Must run AFTER `authenticate`. This is a coarse role gate only — it
// does not replace the fine-grained organizational scope checks in
// services/authorization.ts (e.g. "is this branch actually in this RM's
// region"), which still apply on top of this for every Phase 2 endpoint
// that touches a specific branch/lead.
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthenticationError();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AuthorizationError(`This action requires one of the following roles: ${allowedRoles.join(', ')}`);
    }
    next();
  };
}
