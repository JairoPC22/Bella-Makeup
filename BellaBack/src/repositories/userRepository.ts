import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";
import { roleWithPermissionsInclude } from "../utils/roleMapper";

export function findUserByUsernameOrEmail(identifier: string) {
  return prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
    include: { role: { include: roleWithPermissionsInclude }, userBranches: { include: { branch: true } } },
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { role: { include: roleWithPermissionsInclude }, userBranches: { include: { branch: true } } },
  });
}

export function touchLastLogin(id: string) {
  return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
}

export function createUser(data: Prisma.UserUncheckedCreateInput) {
  return prisma.user.create({ data, include: { role: { include: roleWithPermissionsInclude } } });
}

export function updateUser(id: string, data: Prisma.UserUncheckedUpdateInput) {
  return prisma.user.update({ where: { id }, data, include: { role: { include: roleWithPermissionsInclude } } });
}

export function listUsers() {
  return prisma.user.findMany({
    include: { role: { include: roleWithPermissionsInclude }, userBranches: { include: { branch: true } } },
    orderBy: { createdAt: "desc" },
  });
}
