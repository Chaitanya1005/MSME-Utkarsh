import { prisma } from '../config/prisma';

export function findUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
    include: { region: true, branch: true },
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { region: true, branch: true },
  });
}
