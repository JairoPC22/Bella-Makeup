import { randomUUID } from "crypto";
import { prisma } from "../config/prisma";
import * as userRepository from "../repositories/userRepository";
import { hashPassword } from "../utils/password";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

function toDTO(user: any) {
  const { passwordHash, userBranches, ...rest } = user;
  return { ...rest, branches: userBranches?.map((ub: any) => ub.branch) ?? [] };
}

export async function listUsers() {
  const users = await userRepository.listUsers();
  return users.map(toDTO);
}

export async function createUser(input: any, actorId: string) {
  const passwordHash = await hashPassword(input.password);
  const user = await userRepository.createUser({
    firstName: input.firstName, lastName: input.lastName, displayName: input.displayName,
    username: input.username, email: input.email, phone: input.phone,
    passwordHash, avatarSeed: randomUUID(), roleId: input.roleId,
  });
  await logAudit({ userId: actorId, action: "users.create", module: "users", entityType: "user", entityId: user.id, details: { username: user.username } });
  return toDTO(user);
}

export async function updateUser(id: string, input: any, actorId: string) {
  const user = await userRepository.updateUser(id, input);
  await logAudit({ userId: actorId, action: "users.update", module: "users", entityType: "user", entityId: id });
  return toDTO(user);
}

export async function updateUserStatus(id: string, status: "ACTIVE" | "DISABLED", actorId: string) {
  const user = await userRepository.updateUser(id, { status });
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "users.enable" : "users.disable", module: "users", entityType: "user", entityId: id });
  return toDTO(user);
}

export async function assignBranches(id: string, branchIds: string[], allBranches: boolean, actorId: string) {
  const existing = await userRepository.findUserById(id);
  if (!existing) throw new AppError(404, "Usuario no encontrado");

  await prisma.$transaction([
    prisma.userBranch.deleteMany({ where: { userId: id } }),
    prisma.userBranch.createMany({ data: branchIds.map((branchId) => ({ userId: id, branchId })) }),
    prisma.user.update({ where: { id }, data: { allBranches } }),
  ]);
  await logAudit({ userId: actorId, action: "users.assign_branches", module: "users", entityType: "user", entityId: id, details: { branchIds, allBranches } });

  const updated = await userRepository.findUserById(id);
  return toDTO(updated);
}
