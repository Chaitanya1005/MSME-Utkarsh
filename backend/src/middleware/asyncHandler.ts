import { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Express 4 does not automatically forward rejected promises from async
// route handlers to the error-handling middleware. This wrapper ensures
// every thrown/rejected error (including AppError subclasses) reaches the
// centralized error handler instead of crashing the process or hanging
// the request.
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
