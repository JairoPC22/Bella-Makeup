import { prisma } from "../config/prisma";

export function findAllRolesWithPermissions() {
  return prisma.role.findMany({
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });
}
