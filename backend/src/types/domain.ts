// Mirrors the Prisma `Role` enum (prisma/schema.prisma) as a plain string
// union. Kept independent of the generated Prisma types so that pure
// business logic (e.g. src/services/authorization.ts) and its unit tests
// do not require a generated Prisma Client to type-check and run — only
// code that actually talks to the database needs `@prisma/client`.
export type Role = 'RM' | 'BM' | 'CO' | 'ZM';

// Same rationale, mirroring the Prisma `PipelineStage` enum — used by
// src/services/voiceExtraction.ts so its unit tests don't require a
// generated Prisma Client either.
export type PipelineStage = 'INTERESTED' | 'CONTACTED' | 'APPLICATION' | 'APPROVAL' | 'CONVERSION';

// The subset of a User's identity that goes into the JWT payload and is
// used throughout request handling. Kept intentionally small — never put
// sensitive data (password hash) in a token payload.
export interface AuthTokenPayload {
  userId: string;
  username: string;
  role: Role;
  // Present only for RM tokens.
  regionId?: string;
  // Present only for BM tokens.
  branchId?: string;
}

// Attached to Express's Request object by the authenticate middleware.
export interface AuthenticatedUser extends AuthTokenPayload {}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
