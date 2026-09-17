import { findAllRolesWithPermissions } from "../repositories/roleRepository";
import { mapRole } from "../utils/roleMapper";

export async function listRoles() {
  const roles = await findAllRolesWithPermissions();
  return roles.map(mapRole);
}
