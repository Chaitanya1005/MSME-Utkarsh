import { FollowUpChannel, Role } from '@prisma/client';
import { findUsersByIds } from '../repositories/user.repository';
import {
  createFollowUp as createFollowUpRecord,
  findFollowUpTargetForInitiator,
  findFollowUpTargetByTokenHash,
  markFollowUpTargetAccessed,
  markFollowUpTargetSent,
  listFollowUpsForInitiator,
} from '../repositories/followUp.repository';
import {
  findBranchesByRegion,
  findRegionsByZone,
  findBranchesByZone,
  findAllZones,
  findAllRegions,
  findAllBranches,
} from '../repositories/org.repository';
import { AuthTokenPayload } from '../types/domain';
import { canInitiateFollowUpTo } from './authorization';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../utils/AppError';
import { generateAccessToken, hashAccessToken } from '../utils/secureToken';
import { buildFollowUpMessage, sanitizeCustomNote, ROLE_LABELS } from '../utils/messageTemplate';
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

const SENDER_ROLES: Role[] = ['RM', 'ZM', 'CO'];

export interface CreateFollowUpRequest {
  // The mobile client always resolves "which regions/branches/zones did
  // I select" down to specific recipient user ids before calling this —
  // each org unit maps 1:1 to exactly one user via a unique FK, so this
  // is a client-side lookup, not a new backend capability.
  recipientUserIds: string[];
  channel: FollowUpChannel;
  customNote?: string;
}

export interface FollowUpTargetResult {
  // The FollowUpTarget row's own id. The mobile app needs it to call
  // POST /follow-ups/targets/:targetId/confirm-sent once the sender's
  // device has actually opened the WhatsApp deep link — without it a
  // WHATSAPP target can never leave PENDING.
  id: string;
  recipientUserId: string;
  recipientLabel: string;
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

type ResolvedUser = Awaited<ReturnType<typeof findUsersByIds>>[number];

interface ResolvedRecipient {
  user: ResolvedUser;
  recipientLabel: string;
  // Legacy/branch-shortcut — populated only when the recipient is a BM.
  branchId: string | null;
}

function effectiveOrgIds(user: ResolvedUser): { regionId: string | null; zoneId: string | null } {
  const regionId = user.regionId ?? user.branch?.regionId ?? null;
  const zoneId = user.zoneId ?? user.region?.zoneId ?? user.branch?.region.zoneId ?? null;
  return { regionId, zoneId };
}

// Structurally minimal on purpose — accepts both findUsersByIds' fuller
// nested include (branch.region.zone) and findFollowUpTargetByTokenHash's
// shallower one (bare branch), since only these top-level names are read.
function labelFor(user: {
  name: string;
  branch: { name: string } | null;
  region: { name: string } | null;
  zone: { name: string } | null;
}): string {
  if (user.branch) return `Branch ${user.branch.name}`;
  if (user.region) return `Region ${user.region.name}`;
  if (user.zone) return `Zone ${user.zone.name}`;
  return user.name;
}

function orgUnitLineFor(user: ResolvedUser): string {
  if (user.branch) return `Branch: ${user.branch.name} (Region: ${user.branch.region.name})`;
  if (user.region) return `Region: ${user.region.name} (Zone: ${user.region.zone.name})`;
  if (user.zone) return `Zone: ${user.zone.name}`;
  return user.name;
}

// Every recipient the sender submitted must actually be someone the
// sender is authorized to initiate a follow-up to (a strict descendant
// in the org hierarchy) — re-checked here even though the mobile UI
// would only ever show in-scope recipients, because the mobile UI is not
// a security boundary (spec section 18: "Never trust ids merely because
// the client supplied them").
async function assertRecipientsInScope(
  sender: AuthTokenPayload,
  recipientUserIds: string[]
): Promise<ResolvedRecipient[]> {
  if (recipientUserIds.length === 0) {
    throw new ValidationError('At least one recipient must be selected');
  }
  const uniqueIds = Array.from(new Set(recipientUserIds));
  const users = await findUsersByIds(uniqueIds);
  const byId = new Map(users.map((u) => [u.id, u]));

  const resolved: ResolvedRecipient[] = [];
  for (const id of uniqueIds) {
    const user = byId.get(id);
    if (!user) {
      throw new NotFoundError(`Recipient ${id}`);
    }
    const { regionId, zoneId } = effectiveOrgIds(user);
    const allowed = canInitiateFollowUpTo(sender, {
      role: user.role,
      branchId: user.branchId,
      regionId,
      zoneId,
    });
    if (!allowed) {
      throw new AuthorizationError(`You are not authorized to initiate a follow-up to ${user.name}`);
    }
    resolved.push({
      user,
      recipientLabel: labelFor(user),
      branchId: user.role === 'BM' ? user.branchId : null,
    });
  }
  return resolved;
}

export async function createFollowUp(
  user: AuthTokenPayload,
  request: CreateFollowUpRequest
): Promise<CreateFollowUpResult> {
  if (!SENDER_ROLES.includes(user.role as Role)) {
    throw new AuthorizationError('Only Regional/Zonal Heads or the General Manager may initiate a follow-up');
  }
  if (request.channel !== 'WHATSAPP' && request.channel !== 'EMAIL') {
    throw new ValidationError('Unsupported communication channel');
  }

  const recipients = await assertRecipientsInScope(user, request.recipientUserIds);
  const customNote = sanitizeCustomNote(request.customNote);

  // Each target gets its own token/message/expiry — sharing a single
  // token across recipients would let one recipient's link double as
  // access to another recipient's follow-up.
  const perTarget: Array<{
    recipient: ResolvedRecipient;
    accessTokenHash: string;
    tokenExpiresAt: Date;
    message: string;
  }> = [];

  for (const recipient of recipients) {
    const rawToken = generateAccessToken();
    const accessTokenHash = hashAccessToken(rawToken);
    const tokenExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_HOURS * 60 * 60 * 1000);
    // The mobile/web landing route that exchanges this opaque token for a
    // real session — see followUpAccess.controller.ts. The RAW token
    // travels only inside this one-time-composed message, never as a JWT
    // and never logged.
    const accessUrl = `cbipes://follow-up-access/${rawToken}`;

    const message = buildFollowUpMessage({
      orgUnitLine: orgUnitLineFor(recipient.user),
      senderName: user.username,
      senderRole: user.role as Role,
      recipientName: recipient.user.name,
      recipientRole: recipient.user.role,
      accessUrl,
      customNote,
    });

    perTarget.push({ recipient, accessTokenHash, tokenExpiresAt, message });
  }

  // WhatsApp: compose per-recipient deep links now (no persistence of
  // the link itself — it's derivable, and we don't want a stale phone
  // number change to desync a stored link). Email: attempt real dispatch
  // via the provider abstraction before persisting the final status.
  const targetsForDb: Array<{
    branchId: string | null;
    recipientUserId: string;
    recipientRole: Role;
    recipientLabel: string;
    accessTokenHash: string;
    tokenExpiresAt: Date;
    status: 'PENDING' | 'SENT' | 'FAILED';
    sentAt: Date | null;
    failureReason: string | null;
  }> = [];
  const resultTargets: Array<Omit<FollowUpTargetResult, 'id'>> = [];

  for (const t of perTarget) {
    const { recipient } = t;
    if (request.channel === 'WHATSAPP') {
      if (!recipient.user.phoneNumber) {
        targetsForDb.push({
          branchId: recipient.branchId,
          recipientUserId: recipient.user.id,
          recipientRole: recipient.user.role,
          recipientLabel: recipient.recipientLabel,
          accessTokenHash: t.accessTokenHash,
          tokenExpiresAt: t.tokenExpiresAt,
          status: 'FAILED',
          sentAt: null,
          failureReason: `${ROLE_LABELS[recipient.user.role]} has no phone number on file`,
        });
        resultTargets.push({
          recipientUserId: recipient.user.id,
          recipientLabel: recipient.recipientLabel,
          status: 'FAILED',
          failureReason: `${ROLE_LABELS[recipient.user.role]} has no phone number on file`,
        });
        continue;
      }
      const { deepLinkUrl } = whatsAppProvider.buildDeepLink(recipient.user.phoneNumber, t.message);
      targetsForDb.push({
        branchId: recipient.branchId,
        recipientUserId: recipient.user.id,
        recipientRole: recipient.user.role,
        recipientLabel: recipient.recipientLabel,
        accessTokenHash: t.accessTokenHash,
        tokenExpiresAt: t.tokenExpiresAt,
        status: 'PENDING', // awaiting the sender's device to actually open the link
        sentAt: null,
        failureReason: null,
      });
      resultTargets.push({
        recipientUserId: recipient.user.id,
        recipientLabel: recipient.recipientLabel,
        status: 'PENDING',
        whatsAppDeepLinkUrl: deepLinkUrl,
      });
    } else {
      if (!recipient.user.email) {
        targetsForDb.push({
          branchId: recipient.branchId,
          recipientUserId: recipient.user.id,
          recipientRole: recipient.user.role,
          recipientLabel: recipient.recipientLabel,
          accessTokenHash: t.accessTokenHash,
          tokenExpiresAt: t.tokenExpiresAt,
          status: 'FAILED',
          sentAt: null,
          failureReason: `${ROLE_LABELS[recipient.user.role]} has no email address on file`,
        });
        resultTargets.push({
          recipientUserId: recipient.user.id,
          recipientLabel: recipient.recipientLabel,
          status: 'FAILED',
          failureReason: `${ROLE_LABELS[recipient.user.role]} has no email address on file`,
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const sendResult = await emailProvider.send(
        recipient.user.email,
        'MSME Utkarsh Follow-Up Request',
        t.message
      );
      const status = sendResult.delivered ? 'SENT' : 'FAILED';
      targetsForDb.push({
        branchId: recipient.branchId,
        recipientUserId: recipient.user.id,
        recipientRole: recipient.user.role,
        recipientLabel: recipient.recipientLabel,
        accessTokenHash: t.accessTokenHash,
        tokenExpiresAt: t.tokenExpiresAt,
        status,
        sentAt: sendResult.delivered ? new Date() : null,
        failureReason: sendResult.delivered ? null : sendResult.failureReason ?? 'Email dispatch failed',
      });
      resultTargets.push({
        recipientUserId: recipient.user.id,
        recipientLabel: recipient.recipientLabel,
        status,
        failureReason: sendResult.delivered ? undefined : sendResult.failureReason ?? 'Email dispatch failed',
      });
    }
  }

  // A single shared messageBody is stored on the FollowUp for the common
  // case (identical template shape across recipients); per-recipient
  // text differences are reconstructable from the template plus the
  // recipient record, consistent with not duplicating org data.
  const created = await createFollowUpRecord({
    initiatedByUserId: user.userId,
    channel: request.channel,
    messageBody: perTarget[0]?.message ?? '',
    targets: targetsForDb,
  });

  // Recipient ids were deduplicated in assertRecipientsInScope, and every
  // result target was persisted in the single create() above, so this
  // mapping is 1:1 and total.
  const targetIdByRecipientId = new Map(created.targets.map((t) => [t.recipientUserId, t.id]));

  return {
    followUpId: created.id,
    channel: request.channel,
    targets: resultTargets.map((t) => {
      const id = t.recipientUserId ? targetIdByRecipientId.get(t.recipientUserId) : undefined;
      if (!id) {
        // Unreachable in practice; fail loudly rather than hand the
        // client a target it has no way to confirm.
        throw new AppError(500, 'INTERNAL_ERROR', 'Follow-up target was not persisted');
      }
      return { id, ...t };
    }),
  };
}

// Confirms a WhatsApp target was actually opened on the sender's device.
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

export interface FollowUpCandidate {
  // The org unit's own id (region/branch/zone) — NOT the recipient user
  // id. The mobile client shows/selects by this id, then submits
  // recipientUserId once a unit is chosen.
  id: string;
  name: string;
  // Null when the unit currently has no head assigned — the mobile
  // client should render such units as unselectable, since there is no
  // one to send a follow-up to.
  recipientUserId: string | null;
  recipientName: string | null;
}

export interface FollowUpCandidates {
  zones?: FollowUpCandidate[];
  regions?: FollowUpCandidate[];
  branches?: FollowUpCandidate[];
}

function toRegionCandidate(region: { id: string; name: string; rm: { id: string; name: string } | null }): FollowUpCandidate {
  return { id: region.id, name: region.name, recipientUserId: region.rm?.id ?? null, recipientName: region.rm?.name ?? null };
}

function toBranchCandidate(branch: { id: string; name: string; bm: { id: string; name: string } | null }): FollowUpCandidate {
  return { id: branch.id, name: branch.name, recipientUserId: branch.bm?.id ?? null, recipientName: branch.bm?.name ?? null };
}

// Powers the FollowUpScreen's role-driven level toggle (Full-Hierarchy
// Expansion plan, Phase 4): RM only ever sees branches in their own
// region (unchanged from today, just exposed via this same endpoint so
// the client has one source of truth); ZM sees regions and branches in
// their zone; CO sees zones, regions, and branches org-wide.
export async function listFollowUpCandidates(user: AuthTokenPayload): Promise<FollowUpCandidates> {
  if (user.role === 'RM') {
    if (!user.regionId) throw new NotFoundError('Region assignment');
    const branches = await findBranchesByRegion(user.regionId);
    return { branches: branches.map(toBranchCandidate) };
  }
  if (user.role === 'ZM') {
    if (!user.zoneId) throw new NotFoundError('Zone assignment');
    const [regions, branches] = await Promise.all([
      findRegionsByZone(user.zoneId),
      findBranchesByZone(user.zoneId),
    ]);
    return { regions: regions.map(toRegionCandidate), branches: branches.map(toBranchCandidate) };
  }
  if (user.role === 'CO') {
    const [zones, regions, branches] = await Promise.all([findAllZones(), findAllRegions(), findAllBranches()]);
    return {
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        recipientUserId: z.zm?.id ?? null,
        recipientName: z.zm?.name ?? null,
      })),
      regions: regions.map(toRegionCandidate),
      branches: branches.map(toBranchCandidate),
    };
  }
  throw new AuthorizationError('This role cannot initiate a follow-up');
}

export async function listMyFollowUps(user: AuthTokenPayload) {
  if (!SENDER_ROLES.includes(user.role as Role)) {
    throw new AuthorizationError('Only Regional/Zonal Heads or the General Manager have follow-up history');
  }
  return listFollowUpsForInitiator(user.userId);
}

export interface FollowUpAccessResult {
  token: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: Role;
    branchId?: string;
    regionId?: string;
    zoneId?: string;
    orgUnitLabel: string;
  };
}

// The core of the secure recipient access mechanism (spec section 15).
// Exchanges a one-time opaque token (never a JWT, never logged) for a
// real, short-lived authenticated session as whichever user the target
// was actually addressed to — the same AuthTokenPayload shape the normal
// username/password login produces, so the mobile app's existing
// AuthContext handles it identically regardless of the recipient's role.
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
  if (!target.recipient) {
    throw new AppError(409, 'RECIPIENT_NOT_FOUND', 'This follow-up has no assigned recipient');
  }

  if (target.status !== 'ACCESSED') {
    await markFollowUpTargetAccessed(target.id);
  }

  const recipient = target.recipient;

  // Short-lived on purpose — this is a follow-up-triggered session, not a
  // replacement for normal login. A shorter TTL than the standard
  // username/password session (see ACCESS_SESSION_TTL below) limits the
  // blast radius if a message (e.g. a forwarded WhatsApp text) leaks
  // beyond its intended recipient.
  const sessionToken = signAuthToken(
    {
      userId: recipient.id,
      username: recipient.username,
      role: recipient.role,
      branchId: recipient.branchId ?? undefined,
      regionId: recipient.regionId ?? undefined,
      zoneId: recipient.zoneId ?? undefined,
    },
    ACCESS_SESSION_TTL
  );

  return {
    token: sessionToken,
    user: {
      id: recipient.id,
      username: recipient.username,
      name: recipient.name,
      role: recipient.role,
      branchId: recipient.branchId ?? undefined,
      regionId: recipient.regionId ?? undefined,
      zoneId: recipient.zoneId ?? undefined,
      orgUnitLabel: target.recipientLabel ?? labelFor(recipient),
    },
  };
}
