import { findAllRolesWithPermissions } from "../repositories/roleRepository";

export async function listRoles() {
  const roles = await findAllRolesWithPermissions();
  return roles.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: role.rolePermissions.map((rp) => rp.permission.code),
    assignedUsersCount: role._count.users,
  }));
}
