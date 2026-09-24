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

// Cada código debe existir en la tabla Permission; un código desconocido falla toda la solicitud.
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

// El rol "admin" nunca debe perder roles.manage/roles.view: sin ellos nadie
// podría volver a otorgarlos. Se valida en el backend, no solo en la UI.
const ADMIN_ROLE_REQUIRED_PERMISSIONS = ["roles.manage", "roles.view"] as const;

// Reemplazo completo del conjunto de permisos del rol (no un diff).
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
