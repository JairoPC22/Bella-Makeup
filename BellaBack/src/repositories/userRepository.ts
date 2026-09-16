import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findUserByUsernameOrEmail(identifier: string) {
  return prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
    include: { role: true },
  });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, include: { role: true, userBranches: { include: { branch: true } } } });
}

export function touchLastLogin(id: string) {
  return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
}

export function createUser(data: Prisma.UserUncheckedCreateInput) {
  return prisma.user.create({ data, include: { role: true } });
}

export function updateUser(id: string, data: Prisma.UserUncheckedUpdateInput) {
  return prisma.user.update({ where: { id }, data, include: { role: true } });
}

export function listUsers() {
  return prisma.user.findMany({ include: { role: true, userBranches: { include: { branch: true } } }, orderBy: { createdAt: "desc" } });
}
