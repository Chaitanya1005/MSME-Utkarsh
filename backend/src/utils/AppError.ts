// Base class for all expected/handled application errors. The centralized
// error middleware (src/middleware/errorHandler.ts) knows how to translate
// these into safe, consistent API responses (spec sections 32/34) without
// leaking stack traces, SQL errors, or internal details to the client.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'AUTHENTICATION_ERROR', message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Invalid username or password') {
    super(401, 'INVALID_CREDENTIALS', message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You are not authorized to access this resource') {
    super(403, 'AUTHORIZATION_ERROR', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}
