import { PrismaClient } from '@prisma/client';
import { isProduction } from './env';

// Standard singleton pattern to avoid exhausting Postgres connections
// with hot-reload in dev (ts-node-dev) and in Jest's module registry.
declare global {
  // eslint-disable-next-line no-var
  var __cbiPesPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__cbiPesPrisma ??
  new PrismaClient({
    log: isProduction ? ['error', 'warn'] : ['warn', 'error'],
  });

if (!isProduction) {
  global.__cbiPesPrisma = prisma;
}
