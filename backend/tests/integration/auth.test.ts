import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

// These integration tests require a real, migrated Postgres test database
// reachable at process.env.DATABASE_URL (see tests/setup.ts and the
// backend README's "Running tests" section) and a generated Prisma
// Client (`npx prisma generate`). They could not be executed inside the
// sandboxed environment this project was authored in — see the
// completion report / README "Known limitations" section for details.

const prisma = new PrismaClient();
const app = createApp();

beforeAll(async () => {
  await seedTestFixtures(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('logs in with valid RM credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rm.a1', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.role).toBe('RM');
    expect(res.body.data.user.regionId).toEqual(expect.any(String));
  });

  it('logs in with valid BM credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bm.a101', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('BM');
    expect(res.body.data.user.branchId).toEqual(expect.any(String));
  });

  it('rejects an unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a wrong password without revealing whether the user exists', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rm.a1', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects missing credentials with a validation error', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'rm.a1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never returns the password hash in any response', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rm.a1', password: TEST_PASSWORD });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });
});

describe('GET /api/auth/me', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('rejects a malformed/garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage.token.value');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bm.a101', password: TEST_PASSWORD });
    const token = loginRes.body.data.token;

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.username).toBe('bm.a101');
    expect(meRes.body.data.role).toBe('BM');
    expect(meRes.body.data.branch).toBeTruthy();
  });
});

describe('POST /api/auth/logout', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('succeeds for an authenticated user', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rm.a1', password: TEST_PASSWORD });
    const token = loginRes.body.data.token;

    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.loggedOut).toBe(true);
  });
});
