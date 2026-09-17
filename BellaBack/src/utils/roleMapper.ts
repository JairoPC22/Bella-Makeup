import { Role, RolePermission, Permission } from "@prisma/client";

type RoleWithRelations = Role & {
  rolePermissions: (RolePermission & { permission: Permission })[];
  _count: { users: number };
};

export const roleWithPermissionsInclude = {
  rolePermissions: { include: { permission: true } },
  _count: { select: { users: true } },
} as const;

export function mapRole(role: RoleWithRelations) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: role.rolePermissions.map((rp) => rp.permission.code),
    assignedUsersCount: role._count.users,
  };
}
