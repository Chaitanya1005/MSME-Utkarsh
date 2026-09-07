import { FollowUpChannel, FollowUpTargetStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateFollowUpTargetInput {
  // Populated only when the recipient happens to be a BM (legacy/
  // branch-shortcut, for backward compatibility with any code still
  // reading it directly) — null for region/zone-level recipients.
  branchId: string | null;
  recipientUserId: string;
  recipientRole: Role;
  recipientLabel: string;
  accessTokenHash: string;
  tokenExpiresAt: Date;
  status: FollowUpTargetStatus;
  sentAt: Date | null;
  failureReason: string | null;
}

export interface CreateFollowUpInput {
  initiatedByUserId: string;
  channel: FollowUpChannel;
  messageBody: string;
  targets: CreateFollowUpTargetInput[];
}

// Creates the FollowUp and all of its FollowUpTargets atomically — a
// multi-recipient follow-up must not end up half-persisted (spec section
// 19).
export function createFollowUp(input: CreateFollowUpInput) {
  return prisma.followUp.create({
    data: {
      initiatedByUserId: input.initiatedByUserId,
      channel: input.channel,
      messageBody: input.messageBody,
      targets: {
        create: input.targets.map((t) => ({
          branchId: t.branchId,
          recipientUserId: t.recipientUserId,
          recipientRole: t.recipientRole,
          recipientLabel: t.recipientLabel,
          accessTokenHash: t.accessTokenHash,
          tokenExpiresAt: t.tokenExpiresAt,
          status: t.status,
          sentAt: t.sentAt,
          failureReason: t.failureReason,
        })),
      },
    },
    include: { targets: true },
  });
}

export function findFollowUpTargetByTokenHash(accessTokenHash: string) {
  return prisma.followUpTarget.findUnique({
    where: { accessTokenHash },
    include: {
      recipient: {
        include: {
          branch: true,
          region: { include: { zone: true } },
          zone: true,
        },
      },
      followUp: true,
    },
  });
}

export function markFollowUpTargetAccessed(targetId: string) {
  return prisma.followUpTarget.update({
    where: { id: targetId },
    data: { status: 'ACCESSED', accessedAt: new Date() },
  });
}

export function markFollowUpTargetSent(targetId: string) {
  return prisma.followUpTarget.update({
    where: { id: targetId },
    data: { status: 'SENT', sentAt: new Date() },
  });
}

// Confirms a specific target belongs to a follow-up initiated by the
// given user before allowing a client-confirmed "mark as sent" (WhatsApp
// flow) — prevents one sender confirming/mutating another sender's
// follow-up.
export function findFollowUpTargetForInitiator(targetId: string, initiatedByUserId: string) {
  return prisma.followUpTarget.findFirst({
    where: { id: targetId, followUp: { initiatedByUserId } },
    include: { followUp: true },
  });
}

// Recent follow-up targets per branch, used by the RM dashboard to derive
// "follow-up initiated" status without a separate round trip per branch.
// Only ever matches branch-level (BM-recipient) targets, since the WHERE
// clause is itself branch-id-scoped.
export function findLatestFollowUpTargetsForBranches(branchIds: string[]) {
  if (branchIds.length === 0) return Promise.resolve([]);
  return prisma.followUpTarget.findMany({
    where: { branchId: { in: branchIds } },
    orderBy: { createdAt: 'desc' },
    include: { followUp: { select: { channel: true, createdAt: true } } },
  });
}

// Recent follow-up targets per recipient user, used by the ZM/GM
// dashboards to derive "follow-up initiated" status for a region/zone
// the same way findLatestFollowUpTargetsForBranches does for a BM's
// branch — a region's recipient is its RM, a zone's is its ZM (Full-
// Hierarchy Expansion plan).
export function findLatestFollowUpTargetsForRecipients(recipientUserIds: string[]) {
  if (recipientUserIds.length === 0) return Promise.resolve([]);
  return prisma.followUpTarget.findMany({
    where: { recipientUserId: { in: recipientUserIds } },
    orderBy: { createdAt: 'desc' },
    include: { followUp: { select: { channel: true, createdAt: true } } },
  });
}

export function listFollowUpsForInitiator(initiatedByUserId: string, take = 20) {
  return prisma.followUp.findMany({
    where: { initiatedByUserId },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      targets: true,
    },
  });
}

export type { Prisma };
