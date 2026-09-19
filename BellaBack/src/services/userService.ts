import { prisma } from "../config/prisma";
import * as userRepository from "../repositories/userRepository";
import { hashPassword } from "../utils/password";
import { generateRandomSeed } from "../utils/avatar";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";
import { toPublicUser } from "./authService";

export async function listUsers() {
  const users = await userRepository.listUsers();
  return users.map(toPublicUser);
}

export async function createUser(input: any, actorId: string) {
  const passwordHash = await hashPassword(input.password);
  const user = await userRepository.createUser({
    firstName: input.firstName, lastName: input.lastName, displayName: input.displayName,
    username: input.username, email: input.email, phone: input.phone,
    passwordHash, avatarSeed: generateRandomSeed(), roleId: input.roleId,
  });
  await logAudit({ userId: actorId, action: "users.create", module: "users", entityType: "user", entityId: user.id, details: { username: user.username } });
  return toPublicUser(user);
}

export async function updateUser(id: string, input: any, actorId: string) {
  // Admin accounts are protected from role changes entirely — neither an
  // admin editing their own account (self-demotion) nor a different admin
  // editing someone else's admin account can change `roleId`, regardless of
  // what the new value would be. Without this, any admin could accidentally
  // (or a compromised admin session could deliberately) strip admin access
  // from the system with no in-app recovery path, the same class of risk
  // the roles-permissions endpoint already guards against.
  if (input.roleId !== undefined) {
    const existing = await userRepository.findUserById(id);
    if (existing?.role.code === "admin" && input.roleId !== existing.roleId) {
      throw new AppError(400, "No se puede cambiar el rol de una cuenta de Administrador.");
    }
  }

  await userRepository.updateUser(id, input);
  const user = await userRepository.findUserById(id);
  await logAudit({ userId: actorId, action: "users.update", module: "users", entityType: "user", entityId: id, details: { changes: input } });
  return toPublicUser(user);
}

export async function updateUserStatus(id: string, status: "ACTIVE" | "DISABLED", actorId: string) {
  await userRepository.updateUser(id, { status });
  const user = await userRepository.findUserById(id);
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "users.enable" : "users.disable", module: "users", entityType: "user", entityId: id, details: { status } });
  return toPublicUser(user);
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
  return toPublicUser(updated);
}
