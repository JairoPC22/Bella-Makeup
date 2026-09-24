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

export function findRoleByCode(code: string) {
  return prisma.role.findUnique({ where: { code } });
}

// Rol + permisos iniciales en una transacción, para no exponer un rol sin permisos a medio crear.
export function createRoleWithPermissions(
  data: { code: string; name: string; description: string },
  permissionIds: string[]
) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({ data });
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }
    return tx.role.findUniqueOrThrow({ where: { id: role.id }, include: roleWithPermissionsInclude });
  });
}

export function deleteRoleById(id: string) {
  return prisma.role.delete({ where: { id } });
}

// Reemplazo completo (no un parche): borra y recrea los permisos del rol
// en una sola transacción para no exponer un estado intermedio sin permisos.
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
