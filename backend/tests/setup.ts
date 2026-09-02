process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-do-not-use-in-real-envs';
process.env.JWT_EXPIRES_IN = '1h';
// Integration-test database. NEVER hardcode a real credential here — this
// file is committed to the repository, and the password that used to live
// on this line was published with it. Point the tests at a disposable test
// database by setting TEST_DATABASE_URL (preferred, so it can differ from
// your dev DATABASE_URL) or DATABASE_URL in your shell or backend/.env.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres@localhost:5432/cbipes_phase1_test?schema=public';