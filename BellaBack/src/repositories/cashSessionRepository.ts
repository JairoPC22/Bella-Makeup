import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Forma compartida para las respuestas de open/current/list/detail/close:
// branch reducido a {id,name} y el cajero reducido al mismo subconjunto
// seguro que usan los demás módulos, para que `passwordHash`/`pinHash` nunca
// se filtren por aquí.
//
// A propósito no se incluye `sales`: un cajero no debe poder sumar las
// ventas de su turno (y así conocer el total de caja) antes de hacer su
// conteo a ciegas. Las ventas solo son accesibles vía /api/sales.
export const cashSessionInclude = {
  branch: { select: { id: true, name: true } },
  user: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
} satisfies Prisma.CashSessionInclude;

export function createCashSession(
  data: Prisma.CashSessionUncheckedCreateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.cashSession.create({ data, include: cashSessionInclude });
}

export function findCashSessionById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.cashSession.findUnique({ where: { id }, include: cashSessionInclude });
}

// Busca si ya hay un turno abierto. Es determinista porque openCashSession
// impide crear una segunda fila OPEN para el mismo usuario o sucursal;
// se usa findFirst en vez de findUnique porque esa invariante se garantiza
// en la transacción del servicio, no con un índice único en la BD.
export function findOpenCashSession(
  where: { branchId?: string; userId?: string },
  tx: Prisma.TransactionClient = prisma
) {
  return tx.cashSession.findFirst({
    where: { ...where, status: "OPEN" },
    include: cashSessionInclude,
  });
}

export interface ListCashSessionsFilters {
  branchIds?: string[];
  branchId?: string;
  userId?: string;
  status?: "OPEN" | "CLOSED" | "CLOSED_WITH_DISCREPANCY";
  from?: Date;
  to?: Date;
}

export function listCashSessions(filters: ListCashSessionsFilters) {
  const where: Prisma.CashSessionWhereInput = {
    branchId: filters.branchId ?? (filters.branchIds ? { in: filters.branchIds } : undefined),
    userId: filters.userId,
    status: filters.status,
    openedAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };
  return prisma.cashSession.findMany({ where, include: cashSessionInclude, orderBy: { openedAt: "desc" } });
}

export function closeCashSession(
  id: string,
  data: Prisma.CashSessionUncheckedUpdateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.cashSession.update({ where: { id }, data, include: cashSessionInclude });
}

// Suma los pagos del turno por método, directo en la base de datos,
// restringido a ventas COMPLETED. Una venta cancelada durante el turno
// conserva su cashSessionId pero pasa a CANCELLED, así que queda excluida
// del cálculo sin necesidad de una reversión explícita.
export function sumSessionPaymentsByMethod(sessionId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.salePayment.groupBy({
    by: ["method"],
    where: { sale: { cashSessionId: sessionId, status: "COMPLETED" } },
    _sum: { amount: true },
  });
}
