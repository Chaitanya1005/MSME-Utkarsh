import { FollowUpChannel } from '@prisma/client';
import { findBranchById } from '../repositories/org.repository';
import {
  createFollowUp as createFollowUpRecord,
  findFollowUpTargetForInitiator,
  findFollowUpTargetByTokenHash,
  markFollowUpTargetAccessed,
  markFollowUpTargetSent,
  listFollowUpsForInitiator,
} from '../repositories/followUp.repository';
import { AuthTokenPayload } from '../types/domain';
import { canAccessBranch } from './authorization';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../utils/AppError';
import { generateAccessToken, hashAccessToken } from '../utils/secureToken';
import { buildFollowUpMessage, sanitizeCustomNote } from '../utils/messageTemplate';
import { whatsAppProvider, emailProvider } from './providers';
import { signAuthToken } from '../utils/jwt';

// Secure access links are valid for a bounded window, not forever — an
// MVP-documented assumption (spec section 15) pending a real product
// decision on how long a follow-up should stay actionable.
const ACCESS_TOKEN_TTL_HOURS = 72;

// The resulting authenticated session is deliberately shorter-lived than
// a normal login's default (see backend/.env.example JWT_EXPIRES_IN) —
// this is a follow-up-triggered access grant, not a full login.
const ACCESS_SESSION_TTL = '2h';

export interface CreateFollowUpRequest {
  branchIds: string[];
  channel: FollowUpChannel;
  customNote?: string;
}

export interface FollowUpTargetResult {
  // The FollowUpTarget row's own id. The mobile app needs it to call
  // POST /rm/follow-ups/targets/:targetId/confirm-sent once the RM's
  // device has actually opened the WhatsApp deep link — without it a
  // WHATSAPP target can never leave PENDING.
  id: string;
  branchId: string;
  branchName: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  failureReason?: string;
  // Only present for WHATSAPP targets — the mobile app opens this via
  // Linking.openURL(); the backend never opens it itself (spec section 13).
  whatsAppDeepLinkUrl?: string;
}

export interface CreateFollowUpResult {
  followUpId: string;
  channel: FollowUpChannel;
  targets: FollowUpTargetResult[];
}

// Every branch id the RM submitted must actually belong to their region —
// re-checked here even though the mobile UI would only ever show
// in-scope branches, because the mobile UI is not a security boundary
// (spec section 18: "Never trust branch IDs merely because the client
// supplied them").
async function assertBranchesInScope(user: AuthTokenPayload, branchIds: string[]) {
  if (branchIds.length === 0) {
    throw new ValidationError('At least one branch must be selected');
  }
  const uniqueIds = Array.from(new Set(branchIds));

  const branches = await Promise.all(uniqueIds.map((id) => findBranchById(id)));

  const resolved: NonNullable<Awaited<ReturnType<typeof findBranchById>>>[] = [];
  for (let i = 0; i < uniqueIds.length; i++) {
    const branch = branches[i];
    if (!branch) {
      throw new NotFoundError(`Branch ${uniqueIds[i]}`);
    }
    if (!canAccessBranch(user, branch.id, branch.regionId)) {
      throw new AuthorizationError(`You are not authorized to initiate a follow-up for branch ${uniqueIds[i]}`);
    }
    resolved.push(branch);
  }
  return resolved;
}

export async function createFollowUp(
  user: AuthTokenPayload,
  request: CreateFollowUpRequest
): Promise<CreateFollowUpResult> {
  if (user.role !== 'RM') {
    throw new AuthorizationError('Only Regional Heads may initiate a follow-up');
  }
  if (request.channel !== 'WHATSAPP' && request.channel !== 'EMAIL') {
    throw new ValidationError('Unsupported communication channel');
  }

  const branches = await assertBranchesInScope(user, request.branchIds);
  const customNote = sanitizeCustomNote(request.customNote);

  // Each target gets its own token/message/expiry — sharing a single
  // token across branches would let one BM's link double as access to
  // another branch's follow-up.
  const perTarget: Array<{
    branch: (typeof branches)[number];
    rawToken: string;
    accessTokenHash: string;
    tokenExpiresAt: Date;
    message: string;
  }> = [];

  for (const branch of branches) {
    const rawToken = generateAccessToken();
    const accessTokenHash = hashAccessToken(rawToken);
    const tokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_HOURS * 60 * 60 * 1000);
    // The mobile/web landing route that exchanges this opaque token for a
    // real session — see followUpAccess.controller.ts. The RAW token
    // travels only inside this one-time-composed message, never as a JWT
    // and never logged.
    const accessUrl = `cbipes://follow-up-access/${rawToken}`;

    const message = buildFollowUpMessage({
      branchName: branch.name,
      regionName: branch.region.name,
      rmName: user.username,
      accessUrl,
      customNote,
    });

    perTarget.push({ branch, rawToken, accessTokenHash, tokenExpiresAt, message });
  }

  // WhatsApp: compose per-branch deep links now (no persistence of the
  // link itself — it's derivable, and we don't want a stale phone number
  // change to desync a stored link). Email: attempt real dispatch via the
  // provider abstraction before persisting the final status.
  const targetsForDb: Array<{
    branchId: string;
    accessTokenHash: string;
    tokenExpiresAt: Date;
    status: 'PENDING' | 'SENT' | 'FAILED';
    sentAt: Date | null;
    failureReason: string | null;
  }> = [];
  // Built without `id` because target ids only exist after the insert
  // below; they are stitched back on by branch id before returning.
  const resultTargets: Array<Omit<FollowUpTargetResult, 'id'>> = [];

  for (const t of perTarget) {
    if (request.channel === 'WHATSAPP') {
      if (!t.branch.bm?.phoneNumber) {
        targetsForDb.push({
          branchId: t.branch.id,
          accessTokenHash: t.accessTokenHash,
          tokenExpiresAt: t.tokenExpiresAt,
          status: 'FAILED',
          sentAt: null,
          failureReason: 'Branch Head has no phone number on file',
        });
        resultTargets.push({
          branchId: t.branch.id,
          branchName: t.branch.name,
          status: 'FAILED',
          failureReason: 'Branch Head has no phone number on file',
        });
        continue;
      }
      const { deepLinkUrl } = whatsAppProvider.buildDeepLink(t.branch.bm.phoneNumber, t.message);
      targetsForDb.push({
        branchId: t.branch.id,
        accessTokenHash: t.accessTokenHash,
        tokenExpiresAt: t.tokenExpiresAt,
        status: 'PENDING', // awaiting the RM's device to actually open the link
        sentAt: null,
        failureReason: null,
      });
      resultTargets.push({
        branchId: t.branch.id,
        branchName: t.branch.name,
        status: 'PENDING',
        whatsAppDeepLinkUrl: deepLinkUrl,
      });
    } else {
      if (!t.branch.bm?.email) {
        targetsForDb.push({
          branchId: t.branch.id,
          accessTokenHash: t.accessTokenHash,
          tokenExpiresAt: t.tokenExpiresAt,
          status: 'FAILED',
          sentAt: null,
          failureReason: 'Branch Head has no email address on file',
        });
        resultTargets.push({
          branchId: t.branch.id,
          branchName: t.branch.name,
          status: 'FAILED',
          failureReason: 'Branch Head has no email address on file',
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const sendResult = await emailProvider.send(
        t.branch.bm.email,
        'CBI-PES Follow-Up Request',
        t.message
      );
      const status = sendResult.delivered ? 'SENT' : 'FAILED';
      targetsForDb.push({
        branchId: t.branch.id,
        accessTokenHash: t.accessTokenHash,
        tokenExpiresAt: t.tokenExpiresAt,
        status,
        sentAt: sendResult.delivered ? new Date() : null,
        failureReason: sendResult.delivered ? null : sendResult.failureReason ?? 'Email dispatch failed',
      });
      resultTargets.push({
        branchId: t.branch.id,
        branchName: t.branch.name,
        status,
        failureReason: sendResult.delivered ? undefined : sendResult.failureReason ?? 'Email dispatch failed',
      });
    }
  }

  // A single shared messageBody is stored on the FollowUp for the common
  // case (identical template across branches); per-branch text
  // differences (branch name) are reconstructable from the template plus
  // the branch record, consistent with not duplicating org data.
  const created = await createFollowUpRecord({
    initiatedByUserId: user.userId,
    channel: request.channel,
    messageBody: perTarget[0]?.message ?? '',
    targets: targetsForDb,
  });

  // Branch ids were deduplicated in assertBranchesInScope, and every
  // result target was persisted in the single create() above, so this
  // mapping is 1:1 and total.
  const targetIdByBranchId = new Map(created.targets.map((t) => [t.branchId, t.id]));

  return {
    followUpId: created.id,
    channel: request.channel,
    targets: resultTargets.map((t) => {
      const id = targetIdByBranchId.get(t.branchId);
      if (!id) {
        // Unreachable in practice; fail loudly rather than hand the
        // client a target it has no way to confirm.
        throw new AppError(500, 'INTERNAL_ERROR', 'Follow-up target was not persisted');
      }
      return { id, ...t };
    }),
  };
}

// Confirms a WhatsApp target was actually opened on the RM's device.
// Best-effort by design — see docs/PHASE2_SCOPE.md: without the real
// WhatsApp Business API there is no delivery webhook to confirm this
// automatically, and pretending otherwise would be exactly the kind of
// fake functionality the spec prohibits.
export async function confirmWhatsAppSent(user: AuthTokenPayload, targetId: string) {
  const target = await findFollowUpTargetForInitiator(targetId, user.userId);
  if (!target) {
    throw new NotFoundError('Follow-up target');
  }
  if (target.followUp.channel !== 'WHATSAPP') {
    throw new ValidationError('Only WhatsApp follow-up targets can be confirmed this way');
  }
  if (target.status !== 'PENDING') {
    throw new ValidationError(`Target is already in status ${target.status}`);
  }
  return markFollowUpTargetSent(target.id);
}

export async function listMyFollowUps(user: AuthTokenPayload) {
  if (user.role !== 'RM') {
    throw new AuthorizationError('Only Regional Heads have follow-up history');
  }
  return listFollowUpsForInitiator(user.userId);
}

export interface FollowUpAccessResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: 'BM';
    branch: { id: string; name: string };
  };
}

// The core of the secure BM access mechanism (spec section 15). Exchanges
// a one-time opaque token (never a JWT, never logged) for a real,
// short-lived authenticated session as the branch's BM — the same
// AuthTokenPayload shape the normal username/password login produces, so
// the mobile app's existing AuthContext handles it identically.
export async function exchangeAccessToken(rawToken: string): Promise<FollowUpAccessResult> {
  if (!rawToken || rawToken.length < 32) {
    throw new AppError(400, 'INVALID_ACCESS_TOKEN', 'Malformed access token');
  }

  const accessTokenHash = hashAccessToken(rawToken);
  const target = await findFollowUpTargetByTokenHash(accessTokenHash);

  if (!target) {
    // Deliberately generic — do not reveal whether a token ever existed.
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'This access link is invalid or has expired');
  }
  if (target.tokenExpiresAt.getTime() < Date.now()) {
    throw new AppError(401, 'ACCESS_TOKEN_EXPIRED', 'This access link has expired');
  }
  if (target.status === 'FAILED') {
    throw new AppError(410, 'ACCESS_TOKEN_INVALID', 'This follow-up could not be delivered and its link is inactive');
  }
  if (!target.branch.bm) {
    throw new AppError(409, 'BRANCH_HAS_NO_BM', 'This branch currently has no assigned branch Head');
  }

  if (target.status !== 'ACCESSED') {
    await markFollowUpTargetAccessed(target.id);
  }

  // Short-lived on purpose — this is a follow-up-triggered session, not a
  // replacement for normal login. A shorter TTL than the standard
  // username/password session (see ACCESS_SESSION_TTL below) limits the
  // blast radius if a message (e.g. a forwarded WhatsApp text) leaks
  // beyond its intended recipient.
  const sessionToken = signAuthToken(
    {
      userId: target.branch.bm.id,
      username: target.branch.bm.username,
      role: 'BM',
      branchId: target.branch.id,
    },
    ACCESS_SESSION_TTL
  );

  return {
    token: sessionToken,
    user: {
      id: target.branch.bm.id,
      username: target.branch.bm.username,
      name: target.branch.bm.name,
      role: 'BM',
      branch: { id: target.branch.id, name: target.branch.name },
    },
  };
}
