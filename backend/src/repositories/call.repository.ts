import { CallStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateCallInput {
  initiatedByUserId: string;
  branchId: string;
  calledUserId: string;
  calledPhoneNumber: string;
  status: CallStatus;
  providerCallId: string | null;
  failureReason: string | null;
}

export function createCall(input: CreateCallInput) {
  return prisma.call.create({ data: input });
}

export function findCallsInitiatedByUser(userId: string, take = 20) {
  return prisma.call.findMany({
    where: { initiatedByUserId: userId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { branch: { select: { id: true, name: true } }, calledUser: { select: { id: true, name: true } } },
  });
}

export function findCallsReceivedByUser(userId: string, take = 20) {
  return prisma.call.findMany({
    where: { calledUserId: userId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { branch: { select: { id: true, name: true } }, initiatedBy: { select: { id: true, name: true } } },
  });
}
