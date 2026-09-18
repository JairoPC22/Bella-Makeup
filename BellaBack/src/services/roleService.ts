import { prisma } from "../config/prisma";
import { findAllRolesWithPermissions, findRoleById, replaceRolePermissions } from "../repositories/roleRepository";
import { mapRole } from "../utils/roleMapper";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

export async function listRoles() {
  const roles = await findAllRolesWithPermissions();
  return roles.map(mapRole);
}

// Full replace of a role's permission set (not a diff), gated by
// roles.manage at the route layer. Every code in the request must already
// exist in the Permission table — an unknown code (typo, stale frontend
// build, etc.) fails the whole request with a 400 rather than silently
// dropping it.
export async function updateRolePermissions(id: string, codes: string[], actorId: string) {
  const role = await findRoleById(id);
  if (!role) throw new AppError(404, "Rol no encontrado");

  const uniqueCodes = Array.from(new Set(codes));
  const permissions = await prisma.permission.findMany({ where: { code: { in: uniqueCodes } } });
  if (permissions.length !== uniqueCodes.length) {
    throw new AppError(400, "Uno o más permisos no son válidos");
  }

  const updated = await replaceRolePermissions(
    id,
    permissions.map((p) => p.id)
  );

  await logAudit({
    userId: actorId,
    action: "roles.update_permissions",
    module: "roles",
    entityType: "role",
    entityId: id,
    details: { permissions: uniqueCodes },
  });

  return mapRole(updated);
}
