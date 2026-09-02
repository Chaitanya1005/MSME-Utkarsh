import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

// Same caveat as tests/integration/*.test.ts elsewhere in this project:
// requires a generated Prisma Client and a real, migrated Postgres test
// database (run the Phase 2 migration in addition to the Phase 1 one).

const prisma = new PrismaClient();
const app = createApp();
let fixtures: Awaited<ReturnType<typeof seedTestFixtures>>;

async function loginAs(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: TEST_PASSWORD });
  return res.body.data.token;
}

beforeAll(async () => {
  fixtures = await seedTestFixtures(prisma);
  // Give bmA101 contact info so happy-path follow-up tests can exercise
  // real dispatch, not just the failure path.
  await prisma.user.update({
    where: { id: fixtures.bmA101.id },
    data: { phoneNumber: '+911234567890', email: 'bm.a101@example-dev.cbipes.local' },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/rm/dashboard', () => {
  it('returns the RM"s own region with branch-level lead breakdown', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app).get('/api/rm/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.region.id).toBe(fixtures.regionA1.id);
    const branchIds = res.body.data.branches.map((b: { id: string }) => b.id);
    expect(branchIds).toEqual(expect.arrayContaining([fixtures.branchA101.id, fixtures.branchA102.id]));
  });

  it('is denied to a BM (role gate)', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app).get('/api/rm/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/rm/dashboard');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/rm/follow-ups', () => {
  it('creates a WhatsApp follow-up for a branch within the RM"s region', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'WHATSAPP' });

    expect(res.status).toBe(201);
    expect(res.body.data.targets).toHaveLength(1);
    expect(res.body.data.targets[0].status).toBe('PENDING');
    expect(res.body.data.targets[0].whatsAppDeepLinkUrl).toMatch(/^https:\/\/wa\.me\//);
  });

  it('creates an email follow-up and reports SENT via the dev provider stub', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'EMAIL' });

    expect(res.status).toBe(201);
    expect(res.body.data.targets[0].status).toBe('SENT');
  });

  it('reports FAILED with a clear reason when the BM has no contact info on file', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA102.id], channel: 'WHATSAPP' });

    expect(res.status).toBe(201);
    expect(res.body.data.targets[0].status).toBe('FAILED');
    expect(res.body.data.targets[0].failureReason).toMatch(/phone/i);
  });

  it('DENIED: rejects a branch outside the RM"s region even if syntactically valid', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchB101.id], channel: 'EMAIL' });

    expect(res.status).toBe(403);
  });

  it('DENIED: rejects a multi-branch request where only one branch is out of scope', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA101.id, fixtures.branchB101.id], channel: 'EMAIL' });

    expect(res.status).toBe(403);
  });

  it('is denied to a BM (role gate)', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'EMAIL' });
    expect(res.status).toBe(403);
  });

  it('rejects an empty branch list', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [], channel: 'EMAIL' });
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported channel', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'SMS' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/follow-up-access/:token — secure BM handoff', () => {
  it('exchanges a valid token for a BM session', async () => {
    const rmToken = await loginAs('rm.a1');
    const createRes = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${rmToken}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'WHATSAPP' });

    const deepLink: string = createRes.body.data.targets[0].whatsAppDeepLinkUrl;
    // The deep link contains the message (URL-encoded), which contains the
    // raw access token inside the cbipes:// URL. Extract it the same way a
    // human reading the WhatsApp message would.
    const decoded = decodeURIComponent(deepLink);
    const match = decoded.match(/cbipes:\/\/follow-up-access\/([0-9a-f]{64})/);
    expect(match).not.toBeNull();
    const rawToken = match![1];

    const accessRes = await request(app).get(`/api/follow-up-access/${rawToken}`);
    expect(accessRes.status).toBe(200);
    expect(accessRes.body.data.user.role).toBe('BM');
    expect(accessRes.body.data.user.branch.id).toBe(fixtures.branchA101.id);
    expect(accessRes.body.data.token).toEqual(expect.any(String));
  });

  it('rejects a garbage token', async () => {
    const res = await request(app).get(`/api/follow-up-access/${'0'.repeat(64)}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('never leaks a JWT or password anywhere in the follow-up creation response', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'WHATSAPP' });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // JWT-shaped substring
    expect(text).not.toMatch(TEST_PASSWORD);
  });
});


// ---------------------------------------------------------------------------
// Gate 3 — follow-up creation must actually surface on the RM dashboard.
// ---------------------------------------------------------------------------
//
// A WHATSAPP target is created PENDING with sentAt=null (the backend cannot
// send on the RM's behalf — see docs/PHASE2_SCOPE.md), and
// services/branchUpdateStatus.ts derives FOLLOW_UP_INITIATED from sentAt.
// The RM's device closing that loop via confirm-sent is therefore not
// cosmetic: without it the dashboard can never reflect a WhatsApp follow-up.
describe('POST /api/rm/follow-ups/targets/:targetId/confirm-sent', () => {
  async function createWhatsAppFollowUp(token: string) {
    const res = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'WHATSAPP' });
    expect(res.status).toBe(201);
    return res.body.data.targets[0] as { id: string; branchId: string; status: string };
  }

  it('returns a usable target id on creation (the mobile app needs it to confirm)', async () => {
    const token = await loginAs('rm.a1');
    const target = await createWhatsAppFollowUp(token);
    expect(target.id).toEqual(expect.any(String));
    expect(target.id.length).toBeGreaterThan(0);
  });

  it('marks the target SENT and the RM dashboard reflects it', async () => {
    const token = await loginAs('rm.a1');
    const target = await createWhatsAppFollowUp(token);

    const confirmRes = await request(app)
      .post(`/api/rm/follow-ups/targets/${target.id}/confirm-sent`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('SENT');

    const dashRes = await request(app).get('/api/rm/dashboard').set('Authorization', `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    const branch = dashRes.body.data.branches.find(
      (b: { id: string }) => b.id === fixtures.branchA101.id
    );
    expect(branch.latestFollowUp).not.toBeNull();
    expect(branch.latestFollowUp.channel).toBe('WHATSAPP');
    expect(branch.latestFollowUp.status).toBe('SENT');
    expect(branch.latestFollowUp.sentAt).toEqual(expect.any(String));
  });

  it('rejects a second confirmation of the same target', async () => {
    const token = await loginAs('rm.a1');
    const target = await createWhatsAppFollowUp(token);
    await request(app)
      .post(`/api/rm/follow-ups/targets/${target.id}/confirm-sent`)
      .set('Authorization', `Bearer ${token}`);
    const secondRes = await request(app)
      .post(`/api/rm/follow-ups/targets/${target.id}/confirm-sent`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondRes.status).toBe(400);
  });

  it('DENIED: another RM cannot confirm a target they did not initiate', async () => {
    const rmA1Token = await loginAs('rm.a1');
    const target = await createWhatsAppFollowUp(rmA1Token);

    const rmB1Token = await loginAs('rm.b1');
    const res = await request(app)
      .post(`/api/rm/follow-ups/targets/${target.id}/confirm-sent`)
      .set('Authorization', `Bearer ${rmB1Token}`);
    expect(res.status).toBe(404);
  });

  // Runs last: it backdates this branch's lead activity, which every
  // earlier assertion in this file would otherwise see.
  it('flips the branch to FOLLOW_UP_INITIATED once its leads are stale', async () => {
    const token = await loginAs('rm.a1');

    // The fixtures create leads "now", so the branch is RECENTLY_UPDATED
    // and the follow-up status is masked. Age the lead activity past
    // PENDING_UPDATE_WINDOW_DAYS. Raw SQL because Prisma manages
    // @updatedAt itself and will not accept an explicit value.
    await prisma.$executeRaw`UPDATE leads SET "updatedAt" = NOW() - INTERVAL '30 days' WHERE "branchId" = ${fixtures.branchA101.id}`;

    const target = await createWhatsAppFollowUp(token);
    await request(app)
      .post(`/api/rm/follow-ups/targets/${target.id}/confirm-sent`)
      .set('Authorization', `Bearer ${token}`);

    const dashRes = await request(app).get('/api/rm/dashboard').set('Authorization', `Bearer ${token}`);
    const branch = dashRes.body.data.branches.find(
      (b: { id: string }) => b.id === fixtures.branchA101.id
    );
    expect(branch.updateStatus).toBe('FOLLOW_UP_INITIATED');
  });
});
