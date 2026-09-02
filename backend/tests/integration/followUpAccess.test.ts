import request from 'supertest';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';
import { seedTestFixtures, TEST_PASSWORD } from './fixtures';

// ---------------------------------------------------------------------------
// Gate 4 — Secure BM access.
// ---------------------------------------------------------------------------
//
// Gate 3 proved a follow-up can be created and reflected back to the RM.
// This file covers the other half of Phase 2: the opaque access link that
// lets a BM who has never logged in reach their own branch context, and
// ONLY their own branch context.
//
// Scope note: "BM confirms the update" in the end-to-end sketch is Phase 3
// (manual lead updates). What Phase 2 owns — and what is asserted here —
// is that the BM's arrival is authenticated, correctly scoped, recorded as
// ACCESSED, and visible to the RM.

const prisma = new PrismaClient();
const app = createApp();
let fixtures: Awaited<ReturnType<typeof seedTestFixtures>>;

async function loginAs(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: TEST_PASSWORD });
  return res.body.data.token;
}

function decodeJwtPayload(token: string): { exp: number; iat: number; role: string; branchId?: string } {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
}

// Pulls the raw access token back out of the WhatsApp deep link exactly the
// way the BM reading the message would — the API never returns it directly.
function extractRawToken(deepLinkUrl: string): string {
  const match = decodeURIComponent(deepLinkUrl).match(/cbipes:\/\/follow-up-access\/([0-9a-f]{64})/);
  if (!match) throw new Error('No access token found in deep link');
  return match[1];
}

async function createFollowUpFor(branchIds: string[], rmToken: string) {
  const res = await request(app)
    .post('/api/rm/follow-ups')
    .set('Authorization', `Bearer ${rmToken}`)
    .send({ branchIds, channel: 'WHATSAPP' });
  expect(res.status).toBe(201);
  return res.body.data.targets as Array<{
    id: string;
    branchId: string;
    status: string;
    whatsAppDeepLinkUrl?: string;
  }>;
}

beforeAll(async () => {
  fixtures = await seedTestFixtures(prisma);
  // Both BMs in Region A1 need contact info so multi-branch dispatch
  // succeeds for both and each gets a real, comparable token.
  await prisma.user.updateMany({
    where: { id: { in: [fixtures.bmA101.id, fixtures.bmA102.id] } },
    data: { phoneNumber: '+911234567890' },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Gate 4 — token storage and issuance', () => {
  it('persists only the SHA-256 hash, never the raw token', async () => {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    const rawToken = extractRawToken(target.whatsAppDeepLinkUrl!);

    const row = await prisma.followUpTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.accessTokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
    expect(row.accessTokenHash).not.toBe(rawToken);
    expect(JSON.stringify(row)).not.toContain(rawToken);

    // Nothing else in the row (e.g. a stashed link) leaks it either.
    const anyRowWithRaw = await prisma.followUpTarget.findFirst({
      where: { accessTokenHash: rawToken },
    });
    expect(anyRowWithRaw).toBeNull();
  });

  it('issues a DIFFERENT token per branch, each scoped to its own branch', async () => {
    const rmToken = await loginAs('rm.a1');
    const targets = await createFollowUpFor([fixtures.branchA101.id, fixtures.branchA102.id], rmToken);
    expect(targets).toHaveLength(2);

    const tokensByBranch = new Map(
      targets.map((t) => [t.branchId, extractRawToken(t.whatsAppDeepLinkUrl!)])
    );
    const [tokenA101, tokenA102] = [
      tokensByBranch.get(fixtures.branchA101.id)!,
      tokensByBranch.get(fixtures.branchA102.id)!,
    ];
    expect(tokenA101).not.toBe(tokenA102);

    // Branch A101's token must open A101 — and A102's must open A102.
    const resA101 = await request(app).get(`/api/follow-up-access/${tokenA101}`);
    expect(resA101.body.data.user.branch.id).toBe(fixtures.branchA101.id);
    expect(resA101.body.data.user.username).toBe('bm.a101');

    const resA102 = await request(app).get(`/api/follow-up-access/${tokenA102}`);
    expect(resA102.body.data.user.branch.id).toBe(fixtures.branchA102.id);
    expect(resA102.body.data.user.username).toBe('bm.a102');
  });

  it('issues a session whose lifetime is the documented 2 hours', async () => {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    const res = await request(app).get(`/api/follow-up-access/${extractRawToken(target.whatsAppDeepLinkUrl!)}`);

    const payload = decodeJwtPayload(res.body.data.token);
    expect(payload.exp - payload.iat).toBe(2 * 60 * 60);
    expect(payload.role).toBe('BM');
    expect(payload.branchId).toBe(fixtures.branchA101.id);
  });
});

describe('Gate 4 — token lifecycle', () => {
  it('marks the target ACCESSED and surfaces that to the RM dashboard', async () => {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    await request(app).get(`/api/follow-up-access/${extractRawToken(target.whatsAppDeepLinkUrl!)}`);

    const row = await prisma.followUpTarget.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.status).toBe('ACCESSED');
    expect(row.accessedAt).not.toBeNull();

    const dash = await request(app).get('/api/rm/dashboard').set('Authorization', `Bearer ${rmToken}`);
    const branch = dash.body.data.branches.find((b: { id: string }) => b.id === fixtures.branchA101.id);
    expect(branch.latestFollowUp.status).toBe('ACCESSED');
  });

  it('stays usable until expiry (documented as reusable, not single-use) without moving accessedAt', async () => {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    const rawToken = extractRawToken(target.whatsAppDeepLinkUrl!);

    const first = await request(app).get(`/api/follow-up-access/${rawToken}`);
    expect(first.status).toBe(200);
    const firstAccessedAt = (
      await prisma.followUpTarget.findUniqueOrThrow({ where: { id: target.id } })
    ).accessedAt;

    const second = await request(app).get(`/api/follow-up-access/${rawToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.user.branch.id).toBe(fixtures.branchA101.id);

    // First-access time is the audit-relevant one and must not be rewritten.
    const secondAccessedAt = (
      await prisma.followUpTarget.findUniqueOrThrow({ where: { id: target.id } })
    ).accessedAt;
    expect(secondAccessedAt).toEqual(firstAccessedAt);
  });

  it('DENIED: an expired link is refused with ACCESS_TOKEN_EXPIRED', async () => {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    const rawToken = extractRawToken(target.whatsAppDeepLinkUrl!);

    await prisma.followUpTarget.update({
      where: { id: target.id },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get(`/api/follow-up-access/${rawToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCESS_TOKEN_EXPIRED');
    expect(res.body.data).toBeUndefined();
  });

  it('DENIED: a link belonging to an undeliverable (FAILED) target is inert', async () => {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    const rawToken = extractRawToken(target.whatsAppDeepLinkUrl!);

    await prisma.followUpTarget.update({ where: { id: target.id }, data: { status: 'FAILED' } });

    const res = await request(app).get(`/api/follow-up-access/${rawToken}`);
    expect(res.status).toBe(410);
  });

  it('DENIED: a malformed (too short) token is rejected before any lookup', async () => {
    const res = await request(app).get('/api/follow-up-access/abc');
    expect([400, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('eyJ');
  });

  it('DENIED: a well-formed but unknown token is refused without revealing whether it existed', async () => {
    const res = await request(app).get(`/api/follow-up-access/${'a'.repeat(64)}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_ACCESS_TOKEN');
    // The message deliberately conflates "never existed" with "expired" so the
    // two are indistinguishable; what it must never do is name a branch or user.
    expect(res.body.error.message).not.toMatch(/branch a|bm\.|region/i);
  });

  it('refuses to open a session when the branch no longer has a BM', async () => {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    const rawToken = extractRawToken(target.whatsAppDeepLinkUrl!);

    // A BM cannot be left branch-less: the Phase 1 migration's
    // users_role_assignment_check CHECK constraint forbids a BM row with a
    // null branchId. So "the branch lost its BM" means the user row is gone.
    const bmRow = await prisma.user.findUniqueOrThrow({ where: { id: fixtures.bmA101.id } });
    await prisma.user.delete({ where: { id: fixtures.bmA101.id } });
    try {
      const res = await request(app).get(`/api/follow-up-access/${rawToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BRANCH_HAS_NO_BM');
    } finally {
      // Restore (same id): every later test in this file depends on A101
      // having a BM.
      await prisma.user.create({ data: bmRow });
    }
  });
});

describe('Gate 4 — what the resulting BM session may and may not do', () => {
  async function bmSessionForA101(): Promise<string> {
    const rmToken = await loginAs('rm.a1');
    const [target] = await createFollowUpFor([fixtures.branchA101.id], rmToken);
    const res = await request(app).get(`/api/follow-up-access/${extractRawToken(target.whatsAppDeepLinkUrl!)}`);
    return res.body.data.token;
  }

  it('reaches its own branch and its own leads', async () => {
    const bmToken = await bmSessionForA101();

    const scope = await request(app).get('/api/org/scope').set('Authorization', `Bearer ${bmToken}`);
    expect(scope.status).toBe(200);
    expect(scope.body.data.branch.id).toBe(fixtures.branchA101.id);

    const leads = await request(app).get('/api/leads').set('Authorization', `Bearer ${bmToken}`);
    expect(leads.status).toBe(200);
    const leadIds = leads.body.data.items.map((l: { id: string }) => l.id);
    expect(leadIds).toContain(fixtures.leadA101.id);
    // Region-level and other-region leads must not be visible to a BM.
    expect(leadIds).not.toContain(fixtures.leadRegionA1.id);
    expect(leadIds).not.toContain(fixtures.leadB101.id);
  });

  it('DENIED: cannot read another branch, another region, or another branch"s lead', async () => {
    const bmToken = await bmSessionForA101();

    const otherBranch = await request(app)
      .get(`/api/org/branches/${fixtures.branchA102.id}`)
      .set('Authorization', `Bearer ${bmToken}`);
    expect(otherBranch.status).toBe(403);

    const region = await request(app)
      .get(`/api/org/regions/${fixtures.regionA1.id}`)
      .set('Authorization', `Bearer ${bmToken}`);
    expect(region.status).toBe(403);

    const otherLead = await request(app)
      .get(`/api/leads/${fixtures.leadB101.id}`)
      .set('Authorization', `Bearer ${bmToken}`);
    expect(otherLead.status).toBe(403);
  });

  it('DENIED: cannot use RM-only Phase 2 endpoints', async () => {
    const bmToken = await bmSessionForA101();

    const dash = await request(app).get('/api/rm/dashboard').set('Authorization', `Bearer ${bmToken}`);
    expect(dash.status).toBe(403);

    const create = await request(app)
      .post('/api/rm/follow-ups')
      .set('Authorization', `Bearer ${bmToken}`)
      .send({ branchIds: [fixtures.branchA101.id], channel: 'EMAIL' });
    expect(create.status).toBe(403);

    const list = await request(app).get('/api/rm/follow-ups').set('Authorization', `Bearer ${bmToken}`);
    expect(list.status).toBe(403);
  });

  it('behaves identically to a password login for the same BM (no elevated grant)', async () => {
    const bmToken = await bmSessionForA101();
    const passwordToken = await loginAs('bm.a101');

    const viaLink = await request(app).get('/api/org/scope').set('Authorization', `Bearer ${bmToken}`);
    const viaPassword = await request(app).get('/api/org/scope').set('Authorization', `Bearer ${passwordToken}`);
    expect(viaLink.body.data).toEqual(viaPassword.body.data);
  });
});
