import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../utils/AppError";

type DbClient = PrismaClient | Prisma.TransactionClient;

// Primitiva compartida: ¿el rol dado tiene el permiso `code`? Usada dentro de
// una transacción de escritura (saleService, cashSessionService, etc.) para
// autorizar una acción puntual (descuento, auditoría de caja) sin pasar por
// el middleware requirePermission, que solo lee el rol del JWT del actor.
export async function hasPermissionByRole(client: DbClient, roleId: string, code: string): Promise<boolean> {
  const count = await client.rolePermission.count({ where: { roleId, permission: { code } } });
  return count > 0;
}

// Variante que resuelve el rol a partir del userId, para servicios que solo
// reciben el id del actor (nunca el claim roleId del JWT).
export async function hasPermissionByUser(client: DbClient, userId: string, code: string): Promise<boolean> {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "Usuario no encontrado");
  return hasPermissionByRole(client, user.roleId, code);
}
