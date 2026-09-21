import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Shared shape for open/current/list/detail/close responses, mirroring
// transferRepository.ts's `transferInclude` exactly in spirit: branch
// narrowed to {id,name}, and the owning cashier narrowed to the same
// display-safe subset every other module uses, so `passwordHash`/`pinHash`
// can never leave the API through this module either.
//
// Note what is NOT included here: `sales`. A cashier holding the session id
// must not be able to pull this shift's sales (and therefore add up its
// running cash total) through the caja endpoints before submitting their
// blind count. Sales remain reachable only through /api/sales, which is
// gated on sales.view — a permission the seeded Vendedor/Cajero does hold,
// but that is a pre-existing, separately-audited surface, not one this
// module widens.
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

// The "is a shift already open" lookup. Deterministic by construction:
// openCashSession refuses to create a second OPEN row for the same user (or
// for the same branch under a different user), so this can only ever match
// one row. findFirst rather than findUnique because that invariant is
// enforced in the service transaction, not by a DB unique constraint —
// Prisma can't express the partial unique index (`WHERE status = 'OPEN'`)
// this would otherwise need.
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

// Close-time truth: sums this session's own payments by method, straight in
// the database, restricted to COMPLETED sales. A sale cancelled mid-shift
// keeps its cashSessionId but flips to CANCELLED, so it drops out of this
// aggregate naturally — no reversal row, no bookkeeping, it simply never
// counted.
export function sumSessionPaymentsByMethod(sessionId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.salePayment.groupBy({
    by: ["method"],
    where: { sale: { cashSessionId: sessionId, status: "COMPLETED" } },
    _sum: { amount: true },
  });
}
