import { prisma } from "../config/prisma";
import { roleWithPermissionsInclude } from "../utils/roleMapper";

export function findAllRolesWithPermissions() {
  return prisma.role.findMany({
    include: roleWithPermissionsInclude,
    orderBy: { name: "asc" },
  });
}

export function findRoleById(id: string) {
  return prisma.role.findUnique({ where: { id }, include: roleWithPermissionsInclude });
}

// Full replace, not a diff/patch: deletes every existing RolePermission row
// for this role and recreates the set from the caller's validated
// permissionIds, inside one transaction so a reader never observes a
// role with zero permissions mid-update.
export function replaceRolePermissions(roleId: string, permissionIds: string[]) {
  return prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    }
    return tx.role.findUniqueOrThrow({ where: { id: roleId }, include: roleWithPermissionsInclude });
  });
}
