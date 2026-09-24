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

// Candidatos para la autorización con PIN de supervisor. No existe una
// búsqueda "por valor de PIN" en todo el código: el PIN es demasiado corto
// para identificar a alguien, así que primero se filtra por permiso,
// estado ACTIVE y sucursal, y solo después se compara el PIN con bcrypt.
// `pinHash` se selecciona solo aquí; nunca sale de pinAuthService ni de la API.
// `branchIds === undefined` significa que el usuario tiene `allBranches`.
export function findPinSupervisorCandidates(permissionCode: string, branchIds?: string[]) {
  return prisma.user.findMany({
    where: {
      pinHash: { not: null },
      status: "ACTIVE",
      role: { rolePermissions: { some: { permission: { code: permissionCode } } } },
      ...(branchIds
        ? { OR: [{ allBranches: true }, { userBranches: { some: { branchId: { in: branchIds } } } }] }
        : {}),
    },
    select: { id: true, displayName: true, pinHash: true },
  });
}

// Búsqueda mínima para el alcance de sucursales, sin los includes pesados de findUserById.
export function findUserBranchScope(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, allBranches: true, userBranches: { select: { branchId: true } } },
  });
}
