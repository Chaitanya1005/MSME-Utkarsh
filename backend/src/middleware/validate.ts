import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../utils/AppError';

interface ValidationTargets {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

// Validates the incoming request against the provided zod schemas
// (spec section 33). Never relies on the mobile client to have already
// validated anything. On success, replaces req.body/params/query with the
// parsed (and therefore type-coerced/trimmed) values.
export function validate(targets: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (targets.body) {
      const result = targets.body.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError('Invalid request body', result.error.flatten());
      }
      req.body = result.data;
    }
    if (targets.params) {
      const result = targets.params.safeParse(req.params);
      if (!result.success) {
        throw new ValidationError('Invalid request parameters', result.error.flatten());
      }
      req.params = result.data as typeof req.params;
    }
    if (targets.query) {
      const result = targets.query.safeParse(req.query);
      if (!result.success) {
        throw new ValidationError('Invalid query parameters', result.error.flatten());
      }
      req.query = result.data as typeof req.query;
    }
    next();
  };
}
