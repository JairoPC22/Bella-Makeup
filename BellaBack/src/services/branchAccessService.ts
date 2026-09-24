import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";

type DbClient = PrismaClient | Prisma.TransactionClient;

// Compartido por todos los servicios que escriben datos scoped a sucursal:
// valida que el usuario tenga acceso antes de tocar esa sucursal. Acepta el
// cliente de transacción activo (o `prisma` directo) para que la validación
// lea el mismo snapshot que la escritura que la sigue.
export async function assertBranchAccess(client: DbClient, userId: string, branchId: string): Promise<void> {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "Usuario no encontrado");
  if (user.allBranches) return;
  const assignment = await client.userBranch.findUnique({ where: { userId_branchId: { userId, branchId } } });
  if (!assignment) throw new AppError(403, "Sin acceso a esta sucursal");
}

export async function getAccessibleBranchIds(userId: string): Promise<string[] | "ALL"> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "Usuario no encontrado");
  if (user.allBranches) return "ALL";
  const rows = await prisma.userBranch.findMany({ where: { userId }, select: { branchId: true } });
  return rows.map((r) => r.branchId);
}
