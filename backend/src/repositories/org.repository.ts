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

// --- Full-Hierarchy Expansion additions --------------------------------
//
// Generalizations of findBranchesByRegion one level up (and org-wide),
// used by ZM/GM dashboards, drill-down detail screens, and CO's org-wide
// follow-up targeting.

export function findZoneById(zoneId: string) {
  return prisma.zone.findUnique({
    where: { id: zoneId },
    include: { zm: { select: { id: true, name: true, username: true } } },
  });
}

export function findAllZones() {
  return prisma.zone.findMany({
    include: { zm: { select: { id: true, name: true, username: true } } },
    orderBy: { name: 'asc' },
  });
}

export function findAllRegions() {
  return prisma.region.findMany({
    include: { rm: { select: { id: true, name: true, username: true } } },
    orderBy: { name: 'asc' },
  });
}

export function findAllBranches() {
  return prisma.branch.findMany({
    include: {
      bm: { select: { id: true, name: true, username: true, phoneNumber: true, email: true } },
    },
    orderBy: { name: 'asc' },
  });
}

export function findRegionsByZone(zoneId: string) {
  return prisma.region.findMany({
    where: { zoneId },
    include: { rm: { select: { id: true, name: true, username: true } } },
    orderBy: { name: 'asc' },
  });
}

export function findBranchesByZone(zoneId: string) {
  return prisma.branch.findMany({
    where: { region: { zoneId } },
    include: {
      bm: { select: { id: true, name: true, username: true, phoneNumber: true, email: true } },
    },
    orderBy: { name: 'asc' },
  });
}
