import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

// Same caveat as the rest of tests/integration/*.test.ts: requires a
// generated Prisma Client and a real, migrated Postgres test database
// (run all four migrations — init, phase2_follow_up,
// phase3_4_lead_updates, phase5_calling — in order).

const prisma = new PrismaClient();
const app = createApp();
let fixtures: Awaited<ReturnType<typeof seedTestFixtures>>;

async function loginAs(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: TEST_PASSWORD });
  return res.body.data.token;
}

beforeAll(async () => {
  fixtures = await seedTestFixtures(prisma);
  // Only bmA101 has a phone on file — bmA102 deliberately does not, so
  // the "BM has no phone number" failure path is exercised for real
  // rather than only asserted in prose.
  await prisma.user.update({
    where: { id: fixtures.bmA101.id },
    data: { phoneNumber: '+911234567890' },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/rm/branches/:branchId/call', () => {
  it('an RM can call the BM of a branch in their own region — number resolved server-side', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post(`/api/rm/branches/${fixtures.branchA101.id}/call`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('INITIATED');
    expect(res.body.data.calledPhoneNumber).toBe('+911234567890');
    expect(res.body.data.calledUserId).toBe(fixtures.bmA101.id);
  });

  it('never accepts a client-supplied phone number — the request body is ignored', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post(`/api/rm/branches/${fixtures.branchA101.id}/call`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phoneNumber: '+19999999999' });

    expect(res.status).toBe(201);
    expect(res.body.data.calledPhoneNumber).toBe('+911234567890');
  });

  it('fails clearly when the branch\'s BM has no phone number on file', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post(`/api/rm/branches/${fixtures.branchA102.id}/call`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BM_HAS_NO_PHONE');
  });

  it('DENIED: cannot call a BM outside the RM\'s own region', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post(`/api/rm/branches/${fixtures.branchB101.id}/call`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: a BM cannot initiate a call via the RM endpoint', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post(`/api/rm/branches/${fixtures.branchA101.id}/call`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).post(`/api/rm/branches/${fixtures.branchA101.id}/call`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/rm/calls and GET /api/bm/calls', () => {
  it('an RM sees calls they initiated', async () => {
    const token = await loginAs('rm.a1');
    await request(app).post(`/api/rm/branches/${fixtures.branchA101.id}/call`).set('Authorization', `Bearer ${token}`);

    const res = await request(app).get('/api/rm/calls').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('a BM sees calls placed to them', async () => {
    const rmToken = await loginAs('rm.a1');
    await request(app)
      .post(`/api/rm/branches/${fixtures.branchA101.id}/call`)
      .set('Authorization', `Bearer ${rmToken}`);

    const bmToken = await loginAs('bm.a101');
    const res = await request(app).get('/api/bm/calls').set('Authorization', `Bearer ${bmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((c: { initiatedBy: { id: string } }) => c.initiatedBy)).toBe(true);
  });

  it('DENIED: an RM cannot use the BM received-calls endpoint', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app).get('/api/bm/calls').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
