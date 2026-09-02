import { prisma } from '../config/prisma';

export function findRegionById(regionId: string) {
  return prisma.region.findUnique({
    where: { id: regionId },
    include: { zone: true, rm: { select: { id: true, name: true, username: true } } },
  });
}

export function findBranchesByRegion(regionId: string) {
  return prisma.branch.findMany({
    where: { regionId },
    include: { bm: {
  select: {
    id: true,
    name: true,
    username: true,
    phoneNumber: true,
    email: true,
  },
}, },
    orderBy: { name: 'asc' },
  });
}

export function findBranchById(branchId: string) {
  return prisma.branch.findUnique({
    where: { id: branchId },
    include: {
      region: true,
      bm: {
  select: {
    id: true,
    name: true,
    username: true,
    phoneNumber: true,
    email: true,
  },
},
    },
  });
}
