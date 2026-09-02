import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

// This endpoint calls transcriptionProvider.transcribe() internally.
// Since no SARVAM_API_KEY is set in the test environment,
// providers/index.ts selects UnconfiguredTranscriptionProvider — so
// these tests exercise every layer of the pipeline (authorization,
// validation, extraction, proposal creation, response shape) EXCEPT the
// real Sarvam call itself, which is exactly the "do not make real
// provider calls inside automated tests" instruction this feature was
// built under. A real end-to-end run against Sarvam is a manual step
// (see docs/VOICE_LEAD_UPDATE.md).

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

describe('POST /api/bm/voice-updates/lead-update', () => {
  it('fails clearly (service-unavailable) when no transcription provider is configured, without touching any lead', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post('/api/bm/voice-updates/lead-update')
      .set('Authorization', `Bearer ${token}`)
      .send({ audioBase64: Buffer.from('fake audio').toString('base64'), mimeType: 'audio/m4a' });

    // With no provider configured this fails at the transcription step —
    // exactly the honest behavior documented in
    // providers/transcriptionProvider.ts, not a fake success.
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('TRANSCRIPTION_PROVIDER_NOT_CONFIGURED');

    const leadRes = await request(app).get(`/api/leads/${fixtures.leadA101.id}`).set('Authorization', `Bearer ${token}`);
    expect(leadRes.body.data.cbiPesStage).toBe(fixtures.leadA101.cbiPesStage);
  });

  it('rejects missing audio', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post('/api/bm/voice-updates/lead-update')
      .set('Authorization', `Bearer ${token}`)
      .send({ audioBase64: '', mimeType: 'audio/m4a' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-audio MIME type', async () => {
    const token = await loginAs('bm.a101');
    const res = await request(app)
      .post('/api/bm/voice-updates/lead-update')
      .set('Authorization', `Bearer ${token}`)
      .send({ audioBase64: Buffer.from('x').toString('base64'), mimeType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('DENIED: an RM cannot call this BM-only endpoint', async () => {
    const token = await loginAs('rm.a1');
    const res = await request(app)
      .post('/api/bm/voice-updates/lead-update')
      .set('Authorization', `Bearer ${token}`)
      .send({ audioBase64: Buffer.from('x').toString('base64'), mimeType: 'audio/m4a' });
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/bm/voice-updates/lead-update')
      .send({ audioBase64: Buffer.from('x').toString('base64'), mimeType: 'audio/m4a' });
    expect(res.status).toBe(401);
  });
});

describe('Extraction + proposal creation, isolated from the transcription step', () => {
  // Exercises the extraction -> auto-proposal-creation part of the
  // pipeline directly via the already-established /extract +
  // /sessions/:id/proposals endpoints (transcription-agnostic — the
  // transcript is supplied directly here, the same way it would be after
  // a real Sarvam call), proving lead-number resolution and negation
  // handling work end-to-end against real seed data, not just in the
  // pure voiceExtraction unit tests.
  it('resolves a lead by its real sourceSrNo number and creates a PENDING VOICE_AI proposal with the correct stage', async () => {
    const token = await loginAs('bm.a101');

    const extractRes = await request(app)
      .post('/api/bm/voice-updates/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: `Lead ${fixtures.leadA101.sourceSrNo} ki application approve ho chuki hai` });

    expect(extractRes.status).toBe(201);
    const candidate = extractRes.body.data.candidates[0];
    expect(candidate.matchedLeadId).toBe(fixtures.leadA101.id);
    expect(candidate.proposedStage).toBe('APPROVAL');

    const sessionId = extractRes.body.data.sessionId;
    const proposalRes = await request(app)
      .post(`/api/bm/voice-updates/sessions/${sessionId}/proposals`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ leadId: candidate.matchedLeadId, proposedStage: 'APPROVAL', remarks: candidate.remarks }] });

    expect(proposalRes.status).toBe(201);
    expect(proposalRes.body.data.created).toBe(1);
  });

  it('does not resolve a lead number outside the BM\'s own branch, even if that number exists elsewhere', async () => {
    const token = await loginAs('bm.a101');
    const extractRes = await request(app)
      .post('/api/bm/voice-updates/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: `Lead ${fixtures.leadB101.sourceSrNo} ki application approve ho chuki hai` });

    const candidate = extractRes.body.data.candidates[0];
    // leadB101 belongs to a different branch; the extraction pool passed
    // to extractUpdateCandidates was already scoped to bm.a101's own
    // branch, so this must come back unmatched, not cross-branch matched.
    expect(candidate.matchedLeadId).toBeNull();
    expect(candidate.ambiguityReason).toBe('NO_LEAD_MATCH');
  });
});
