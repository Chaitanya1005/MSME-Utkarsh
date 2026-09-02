import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as authService from '../services/auth.service';
import { AuthenticationError } from '../utils/AppError';

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const result = await authService.login(username, password);
  sendSuccess(res, result);
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AuthenticationError();
  const user = await authService.getCurrentUser(req.user.userId);
  sendSuccess(res, user);
});

// JWTs are stateless in Phase 1 (no server-side session store / token
// blocklist yet — that would be a reasonable Phase 6 hardening item).
// Logout is therefore a client-side action: the mobile app discards the
// stored token. This endpoint exists so the client has a single,
// documented place to call and so the server can be extended later
// (e.g. token blocklisting) without an API shape change.
export const logoutHandler = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, { loggedOut: true });
});
