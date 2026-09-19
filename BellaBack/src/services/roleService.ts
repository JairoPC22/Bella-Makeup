import { prisma } from "../config/prisma";
import {
  createRoleWithPermissions,
  deleteRoleById,
  findAllRolesWithPermissions,
  findRoleByCode,
  findRoleById,
  replaceRolePermissions,
} from "../repositories/roleRepository";
import { mapRole } from "../utils/roleMapper";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

// Every code in `codes` must already exist in the Permission table — shared
// by both create and permission-replace so an unknown code (typo, stale
// frontend build) fails the whole request the same way in either path.
async function resolvePermissionIds(codes: string[]): Promise<string[]> {
  const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });
  if (permissions.length !== codes.length) {
    throw new AppError(400, "Uno o más permisos no son válidos");
  }
  return permissions.map((p) => p.id);
}

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

  // Diff against the CURRENT set (already loaded on `role` via
  // findRoleById's include) before applying the replace, so the audit
  // trail records what actually changed rather than just the resulting
  // full list — much more useful for reviewing a privilege change later.
  const currentCodes = role.rolePermissions.map((rp) => rp.permission.code);
  const added = uniqueCodes.filter((c) => !currentCodes.includes(c));
  const removed = currentCodes.filter((c) => !uniqueCodes.includes(c));

  const permissionIds = await resolvePermissionIds(uniqueCodes);
  const updated = await replaceRolePermissions(id, permissionIds);

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

export interface CreateRoleInput {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export async function createRole(input: CreateRoleInput, actorId: string) {
  const existing = await findRoleByCode(input.code);
  if (existing) throw new AppError(409, "Ya existe un rol con ese código");

  const uniqueCodes = Array.from(new Set(input.permissions));
  const permissionIds = await resolvePermissionIds(uniqueCodes);

  const role = await createRoleWithPermissions(
    { code: input.code, name: input.name, description: input.description },
    permissionIds
  );

  await logAudit({
    userId: actorId,
    action: "roles.create",
    module: "roles",
    entityType: "role",
    entityId: role.id,
    details: { code: role.code, name: role.name, permissions: uniqueCodes },
  });

  return mapRole(role);
}

export async function deleteRole(id: string, actorId: string) {
  const role = await findRoleById(id);
  if (!role) throw new AppError(404, "Rol no encontrado");

  if (role.isSystem) {
    throw new AppError(400, "No se puede eliminar un rol predeterminado del sistema");
  }
  if (role._count.users > 0) {
    throw new AppError(
      409,
      `No se puede eliminar el rol: tiene ${role._count.users} usuario(s) asignado(s). Reasígnalos a otro rol primero.`
    );
  }

  await deleteRoleById(id);

  await logAudit({
    userId: actorId,
    action: "roles.delete",
    module: "roles",
    entityType: "role",
    entityId: id,
    details: { code: role.code, name: role.name },
  });
}
