import { prisma } from '../config/prisma';

export function findUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
    include: { region: true, branch: true, zone: true },
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { region: true, branch: true, zone: true },
  });
}

// Batch lookup used by followUp.service.ts to resolve a set of
// candidate follow-up recipients at once, with enough of their org
// assignment (including one level up, e.g. a branch's region's zone) to
// both authorize the request and build a human-readable recipient label.
export function findUsersByIds(ids: string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return prisma.user.findMany({
    where: { id: { in: ids } },
    include: {
      branch: { include: { region: { include: { zone: true } } } },
      region: { include: { zone: true } },
      zone: true,
    },
  });
}
