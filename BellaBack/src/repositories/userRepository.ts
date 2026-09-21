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

// Candidate set for the supervisor-PIN co-sign primitive
// (pinAuthService.verifySupervisorPin). There is deliberately NO "look up a
// user by PIN value" query anywhere in this codebase: a 4-6 digit PIN is far
// too small a space to identify anyone system-wide, and two users may
// legitimately share one. Instead the candidate set is narrowed FIRST by
// everything the server already knows — has a PIN at all, is ACTIVE, holds
// the permission being authorized, and is reachable from the acting
// cashier's branch — and only then are the submitted digits bcrypt-compared
// against that short list.
//
// `pinHash` is selected here because comparing against it is the entire
// point; this is the one and only place it is read, it never leaves
// pinAuthService, and it is never included in any API response (see
// toPublicUser, which strips it).
//
// `branchIds === undefined` means the acting user has `allBranches`, so no
// branch restriction is applied. An empty array means the acting user has no
// branch assignments at all, which correctly leaves only `allBranches`
// supervisors eligible.
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

// Minimal actor lookup for verifySupervisorPin's branch scoping — avoids
// findUserById's heavy role/permission/branch includes when all that's
// needed is "which branches is this cashier standing in".
export function findUserBranchScope(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, allBranches: true, userBranches: { select: { branchId: true } } },
  });
}
