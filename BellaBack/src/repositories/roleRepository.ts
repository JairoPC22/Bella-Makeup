import { prisma } from "../config/prisma";
import { roleWithPermissionsInclude } from "../utils/roleMapper";

export function findAllRolesWithPermissions() {
  return prisma.role.findMany({
    include: roleWithPermissionsInclude,
    orderBy: { name: "asc" },
  });
}
