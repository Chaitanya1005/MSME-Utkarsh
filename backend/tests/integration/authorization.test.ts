import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

// This file is the mandatory "direct API authorization test" from spec
// section 28: it never goes through any UI, only raw HTTP requests with
// manually chosen IDs, including IDs that belong to a DIFFERENT user's
// scope, to prove the backend rejects them regardless of what the mobile
// client would or wouldn't have shown.

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

describe('RM-A1 authorization matrix', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginAs('rm.a1');
  });

  it('ALLOWED: can access their own region', async () => {
    const res = await request(app)
      .get(`/api/org/regions/${fixtures.regionA1.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('ALLOWED: can list branches under their own region (includes A101 and A102)', async () => {
    const res = await request(app)
      .get(`/api/org/regions/${fixtures.regionA1.id}/branches`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const branchIds = res.body.data.map((b: { id: string }) => b.id);
    expect(branchIds).toEqual(expect.arrayContaining([fixtures.branchA101.id, fixtures.branchA102.id]));
  });

  it('ALLOWED: can access a branch within their region', async () => {
    const res = await request(app)
      .get(`/api/org/branches/${fixtures.branchA101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('ALLOWED: can access a lead belonging to a branch in their region', async () => {
    const res = await request(app)
      .get(`/api/leads/${fixtures.leadA101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('ALLOWED: can access a region-level lead in their own region', async () => {
    const res = await request(app)
      .get(`/api/leads/${fixtures.leadRegionA1.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('DENIED: cannot access Region A2', async () => {
    const res = await request(app)
      .get(`/api/org/regions/${fixtures.regionA2.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: cannot access Region B1', async () => {
    const res = await request(app)
      .get(`/api/org/regions/${fixtures.regionB1.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: cannot access Branch A201 (different region)', async () => {
    const res = await request(app)
      .get(`/api/org/branches/${fixtures.branchA201.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: cannot access Branch B101', async () => {
    const res = await request(app)
      .get(`/api/org/branches/${fixtures.branchB101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: cannot access a lead belonging to Branch B101 by guessing/changing the lead id', async () => {
    const res = await request(app)
      .get(`/api/leads/${fixtures.leadB101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: cannot list leads by passing an out-of-scope branchId filter', async () => {
    const res = await request(app)
      .get(`/api/leads?branchId=${fixtures.branchB101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('RM-A2 authorization matrix', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginAs('rm.a2');
  });

  it('ALLOWED: can access Region A2 and Branch A201', async () => {
    const regionRes = await request(app)
      .get(`/api/org/regions/${fixtures.regionA2.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(regionRes.status).toBe(200);

    const branchRes = await request(app)
      .get(`/api/org/branches/${fixtures.branchA201.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(branchRes.status).toBe(200);
  });

  it('DENIED: cannot access Region A1, Branch A101, Branch A102, Region B1', async () => {
    const targets = [
      `/api/org/regions/${fixtures.regionA1.id}`,
      `/api/org/branches/${fixtures.branchA101.id}`,
      `/api/org/branches/${fixtures.branchA102.id}`,
      `/api/org/regions/${fixtures.regionB1.id}`,
    ];
    for (const path of targets) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });
});

describe('BM-A101 authorization matrix', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginAs('bm.a101');
  });

  it('ALLOWED: can access Branch A101 and its lead', async () => {
    const branchRes = await request(app)
      .get(`/api/org/branches/${fixtures.branchA101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(branchRes.status).toBe(200);

    const leadRes = await request(app)
      .get(`/api/leads/${fixtures.leadA101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(leadRes.status).toBe(200);
  });

  it('DENIED: cannot access Branch A102, Branch A201, Branch B101', async () => {
    const targets = [fixtures.branchA102.id, fixtures.branchA201.id, fixtures.branchB101.id];
    for (const branchId of targets) {
      const res = await request(app)
        .get(`/api/org/branches/${branchId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('DENIED: cannot access leads belonging to other branches', async () => {
    const res = await request(app)
      .get(`/api/leads/${fixtures.leadB101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: has no region-level access at all', async () => {
    const res = await request(app)
      .get(`/api/org/regions/${fixtures.regionA1.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('BM-B101 authorization matrix', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginAs('bm.b101');
  });

  it('ALLOWED: can access Branch B101 and its lead', async () => {
    const branchRes = await request(app)
      .get(`/api/org/branches/${fixtures.branchB101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(branchRes.status).toBe(200);

    const leadRes = await request(app)
      .get(`/api/leads/${fixtures.leadB101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(leadRes.status).toBe(200);
  });

  it('DENIED: cannot access Branch A101, A102, A201', async () => {
    const targets = [fixtures.branchA101.id, fixtures.branchA102.id, fixtures.branchA201.id];
    for (const branchId of targets) {
      const res = await request(app)
        .get(`/api/org/branches/${branchId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });
});

describe('Cross-cutting: nonexistent and malformed IDs', () => {
  it('returns 404 (not 500) for a syntactically valid but nonexistent lead id, once authenticated', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .get('/api/leads/does-not-exist-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('never leaks a stack trace or SQL detail in an error response', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .get('/api/leads/does-not-exist-id')
      .set('Authorization', `Bearer ${token}`);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/at Object\.<anonymous>/); // stack trace marker
    expect(text).not.toMatch(/prisma\.lead\.findUnique/i);
  });
});
