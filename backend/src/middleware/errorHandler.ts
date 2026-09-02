import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { sendError } from '../utils/apiResponse';

// Centralized error handler (spec sections 32, 34, 50). Responsible for:
//   - Translating known AppError subclasses into consistent responses.
//   - Translating Prisma errors into safe, generic responses (never leak
//     SQL, table names, or internal details to the client).
//   - Logging enough for debugging without logging secrets/PII (section 35).
// Must be registered LAST, after all routes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      // eslint-disable-next-line no-console
      console.error(`[${req.method} ${req.originalUrl}]`, err.code, err.message);
    }
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // eslint-disable-next-line no-console
    console.error(`[${req.method} ${req.originalUrl}] Prisma error`, err.code);
    if (err.code === 'P2025') {
      sendError(res, 404, 'NOT_FOUND', 'Resource not found');
      return;
    }
    sendError(res, 500, 'DATABASE_ERROR', 'A database error occurred');
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`[${req.method} ${req.originalUrl}] Unhandled error`, err);
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, 'NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}`);
}
