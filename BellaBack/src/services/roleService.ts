import { prisma } from "../config/prisma";
import { findAllRolesWithPermissions, findRoleById, replaceRolePermissions } from "../repositories/roleRepository";
import { mapRole } from "../utils/roleMapper";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

export async function listRoles() {
  const roles = await findAllRolesWithPermissions();
  return roles.map(mapRole);
}

// Permissions the seeded "admin" role must always keep — without
// roles.manage no one (including admin) could ever call this endpoint
// again, and without roles.view no one could even see roles to diagnose
// the problem. Unlike a regular user disabling their own account (which
// any OTHER admin can still fix), there's no recovery path once the one
// role that can grant roles.manage loses it: no in-app way to grant it
// back. Guarded here, not just in the UI, since the UI check is trivially
// bypassable by calling the endpoint directly.
const ADMIN_ROLE_REQUIRED_PERMISSIONS = ["roles.manage", "roles.view"] as const;

// Full replace of a role's permission set (not a diff), gated by
// roles.manage at the route layer. Every code in the request must already
// exist in the Permission table — an unknown code (typo, stale frontend
// build, etc.) fails the whole request with a 400 rather than silently
// dropping it.
export async function updateRolePermissions(id: string, codes: string[], actorId: string) {
  const role = await findRoleById(id);
  if (!role) throw new AppError(404, "Rol no encontrado");

  const uniqueCodes = Array.from(new Set(codes));

  if (role.code === "admin") {
    const missing = ADMIN_ROLE_REQUIRED_PERMISSIONS.filter((p) => !uniqueCodes.includes(p));
    if (missing.length > 0) {
      throw new AppError(
        400,
        `No se puede quitar el permiso ${missing.join(" ni ")} del rol Administrador: dejaría el sistema sin forma de gestionar roles.`
      );
    }
  }

  const permissions = await prisma.permission.findMany({ where: { code: { in: uniqueCodes } } });
  if (permissions.length !== uniqueCodes.length) {
    throw new AppError(400, "Uno o más permisos no son válidos");
  }

  // Diff against the CURRENT set (already loaded on `role` via
  // findRoleById's include) before applying the replace, so the audit
  // trail records what actually changed rather than just the resulting
  // full list — much more useful for reviewing a privilege change later.
  const currentCodes = role.rolePermissions.map((rp) => rp.permission.code);
  const added = uniqueCodes.filter((c) => !currentCodes.includes(c));
  const removed = currentCodes.filter((c) => !uniqueCodes.includes(c));

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
    details: { added, removed },
  });

  return mapRole(updated);
}
