import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

const prisma = new PrismaClient();
const app = createApp();
let fixtures: Awaited<ReturnType<typeof seedTestFixtures>>;

async function loginAs(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: TEST_PASSWORD });
  return res.body.data.token;
}

beforeAll(async () => {
  fixtures = await seedTestFixtures(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/leads', () => {
  it('an RM sees only leads within their region (branch-level + region-level)', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((l: { id: string }) => l.id);
    expect(ids).toEqual(expect.arrayContaining([fixtures.leadA101.id, fixtures.leadRegionA1.id]));
    expect(ids).not.toContain(fixtures.leadB101.id);
  });

  it('a BM sees only leads within their branch', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((l: { id: string }) => l.id);
    expect(ids).toEqual([fixtures.leadA101.id]);
  });

  it('supports pagination', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .get('/api/leads?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.pageSize).toBe(1);
  });

  it('rejects an invalid pageSize (validation, spec section 33)', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .get('/api/leads?pageSize=99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/org/scope', () => {
  it("returns an RM's own region and its branches", async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app).get('/api/org/scope').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('RM');
    expect(res.body.data.region.id).toBe(fixtures.regionA1.id);
    const branchIds = res.body.data.branches.map((b: { id: string }) => b.id);
    expect(branchIds).toEqual(
      expect.arrayContaining([fixtures.branchA101.id, fixtures.branchA102.id])
    );
  });

  it("returns a BM's own branch", async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app).get('/api/org/scope').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('BM');
    expect(res.body.data.branch.id).toBe(fixtures.branchA101.id);
  });
});
