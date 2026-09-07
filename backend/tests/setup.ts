// Load .env BEFORE reading TEST_DATABASE_URL/DATABASE_URL below — without
// this, process.env is still empty at this point (nothing else has
// loaded .env yet; src/config/env.ts only does so when it's first
// imported, which happens later, after this file already ran), so the
// fallback default below silently fires on every run. That default used
// to be the same database name as the real dev DB, which is exactly how
// a full test run (this file wipes every table before seeding fixtures —
// see seedTestFixtures) destroyed real data more than once. Never point
// the fallback at a name that could plausibly be someone's real
// database again.
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-do-not-use-in-real-envs';
process.env.JWT_EXPIRES_IN = '1h';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Refusing to guess a database to wipe. ' +
      'Set TEST_DATABASE_URL in backend/.env to a dedicated, disposable ' +
      'database (never the same one as DATABASE_URL) before running tests.'
  );
}
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is identical to DATABASE_URL. Refusing to run — ' +
      'every test run wipes every table in this database, and this would ' +
      'wipe your real/dev data.'
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;