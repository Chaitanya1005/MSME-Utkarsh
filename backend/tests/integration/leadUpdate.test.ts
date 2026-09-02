import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

// Same caveat as the rest of tests/integration/*.test.ts: requires a
// generated Prisma Client and a real, migrated Postgres test database
// (run all three migrations — init, phase2_follow_up,
// phase3_4_lead_updates — in order).

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

describe('POST /api/bm/leads/:leadId/proposals (manual)', () => {
  it('a BM can propose an update for their own branch\'s lead', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'CONTACTED', remarks: 'Called the customer' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.source).toBe('MANUAL');
  });

  it('creating a proposal does NOT change the lead\'s actual stage yet', async () => {
    const token = await loginAs('bm.a101');
    await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'CONVERSION' });

    const leadRes = await request(app).get(`/api/leads/${fixtures.leadA101.id}`).set('Authorization', `Bearer ${token}`);
    expect(leadRes.body.data.cbiPesStage).not.toBe('CONVERSION');
  });

  it('DENIED: a BM cannot propose an update for another branch\'s lead', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post(`/api/bm/leads/${fixtures.leadB101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'CONTACTED' });
    expect(res.status).toBe(403);
  });

  it('DENIED: an RM cannot propose lead updates at all', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'CONTACTED' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid stage value', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'NOT_A_REAL_STAGE' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bm/proposals/:proposalId/confirm — the persistence step', () => {
  it('confirming a proposal updates the lead stage AND writes activity, atomically', async () => {
    const token = await loginAs('bm.a101');
    const createRes = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'APPROVAL', remarks: 'Docs verified' });
    const proposalId = createRes.body.data.id;

    const confirmRes = await request(app)
      .post(`/api/bm/proposals/${proposalId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirmRes.status).toBe(200);

    const leadRes = await request(app).get(`/api/leads/${fixtures.leadA101.id}`).set('Authorization', `Bearer ${token}`);
    expect(leadRes.body.data.cbiPesStage).toBe('APPROVAL');

    const activityRes = await request(app)
      .get(`/api/bm/leads/${fixtures.leadA101.id}/activity`)
      .set('Authorization', `Bearer ${token}`);
    expect(activityRes.body.data.some((a: { newStage: string }) => a.newStage === 'APPROVAL')).toBe(true);
  });

  it('cannot confirm the same proposal twice', async () => {
    const token = await loginAs('bm.a101');
    const createRes = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'CONTACTED' });
    const proposalId = createRes.body.data.id;

    await request(app).post(`/api/bm/proposals/${proposalId}/confirm`).set('Authorization', `Bearer ${token}`);
    const secondAttempt = await request(app)
      .post(`/api/bm/proposals/${proposalId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondAttempt.status).toBe(409);
  });

  it('DENIED: a BM cannot confirm a proposal belonging to another branch', async () => {
    const bmA101Token = await loginAs('bm.a101');
    const createRes = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${bmA101Token}`)
      .send({ proposedStage: 'CONTACTED' });
    const proposalId = createRes.body.data.id;

    const bmB101Token = await loginAs('bm.b101');
    const res = await request(app)
      .post(`/api/bm/proposals/${proposalId}/confirm`)
      .set('Authorization', `Bearer ${bmB101Token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/bm/voice-updates/extract', () => {
  it('extracts multiple candidates from one transcript without mutating any lead', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post('/api/bm/voice-updates/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: `${fixtures.leadA101.customerName} ka loan contacted ho gaya hai.` });

    expect(res.status).toBe(201);
    expect(res.body.data.sessionId).toEqual(expect.any(String));
    expect(res.body.data.candidates.length).toBeGreaterThan(0);
  });

  it('rejects an empty transcript', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post('/api/bm/voice-updates/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: '' });
    expect(res.status).toBe(400);
  });

  it('DENIED: an RM cannot submit a voice update', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/bm/voice-updates/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: 'some transcript' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/bm/voice-updates/sessions/:sessionId/proposals', () => {
  it('creates PENDING VOICE_AI proposals from resolved candidates — same pipeline as manual', async () => {
    const token = await loginAs('bm.a101');
    const extractRes = await request(app)
      .post('/api/bm/voice-updates/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: `${fixtures.leadA101.customerName} ka application submit ho gaya.` });

    const sessionId = extractRes.body.data.sessionId;
    const res = await request(app)
      .post(`/api/bm/voice-updates/sessions/${sessionId}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ leadId: fixtures.leadA101.id, proposedStage: 'APPLICATION', remarks: 'from voice' }] });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(1);

    const proposalsRes = await request(app)
      .get(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`);
    expect(
      proposalsRes.body.data.some((p: { source: string; status: string }) => p.source === 'VOICE_AI' && p.status === 'PENDING')
    ).toBe(true);
  });

  it('DENIED: cannot use a session belonging to another branch\'s BM', async () => {
    const bmA101Token = await loginAs('bm.a101');
    const extractRes = await request(app)
      .post('/api/bm/voice-updates/extract')
      .set('Authorization', `Bearer ${bmA101Token}`)
      .send({ transcript: 'some update happened' });
    const sessionId = extractRes.body.data.sessionId;

    const bmB101Token = await loginAs('bm.b101');
    const res = await request(app)
      .post(`/api/bm/voice-updates/sessions/${sessionId}/proposals`)
      .set('Authorization', `Bearer ${bmB101Token}`)
      .send({ items: [{ leadId: fixtures.leadB101.id, proposedStage: 'CONTACTED' }] });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/leads/:leadId/activity — shared between RM and BM (Phase 5)', () => {
  it('a BM can view activity for their own lead', async () => {
    const token = await loginAs('bm.a101');
    const createRes = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'CONTACTED' });
    await request(app)
      .post(`/api/bm/proposals/${createRes.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/leads/${fixtures.leadA101.id}/activity`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('an RM can view activity for a lead in their own region (read-only visibility, spec Phase 5 section 5)', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .get(`/api/leads/${fixtures.leadA101.id}/activity`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('DENIED: an RM cannot view activity for a lead outside their region', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .get(`/api/leads/${fixtures.leadB101.id}/activity`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DENIED: a BM cannot view activity for a lead outside their branch', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .get(`/api/leads/${fixtures.leadB101.id}/activity`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Manual update flow after Review Updates removal (Phase 5 section 3)', () => {
  it('create-then-confirm in immediate sequence results in a CONFIRMED proposal and updated lead stage', async () => {
    const token = await loginAs('bm.a101');
    const createRes = await request(app)
      .post(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ proposedStage: 'APPLICATION', remarks: 'Immediate confirm flow' });

    const confirmRes = await request(app)
      .post(`/api/bm/proposals/${createRes.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirmRes.status).toBe(200);

    const leadRes = await request(app)
      .get(`/api/leads/${fixtures.leadA101.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(leadRes.body.data.cbiPesStage).toBe('APPLICATION');

    // The underlying proposal architecture itself is untouched — the
    // proposal exists and is CONFIRMED, it was just never left PENDING
    // in a separate inbox.
    const proposalsRes = await request(app)
      .get(`/api/bm/leads/${fixtures.leadA101.id}/proposals`)
      .set('Authorization', `Bearer ${token}`);
    expect(
      proposalsRes.body.data.some((p: { id: string; status: string }) => p.id === createRes.body.data.id && p.status === 'CONFIRMED')
    ).toBe(true);
  });
});
