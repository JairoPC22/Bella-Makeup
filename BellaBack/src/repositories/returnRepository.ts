import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Shared shape for list/detail/create responses, mirroring
// purchaseRepository.ts's `purchaseInclude` in spirit: the branch, the two
// users involved narrowed to a display-safe subset, and items carrying
// product/variant name+sku so the returns screen can label every line
// without a second round trip.
//
// Both user sub-selects are explicit allow-lists rather than `true` for the
// same reason they are in purchaseRepository/saleRepository, and here it
// matters more than anywhere else in the codebase: `authorizedBy` is by
// construction a user who HAS a supervisor PIN set, so selecting the whole
// relation would publish a bcrypt hash of a 4-6 digit PIN — the exact
// credential this module's whole control depends on — on every returns list
// response.
//
// `originalSale` is deliberately a narrow select rather than the full
// saleInclude: the return screen needs to identify which ticket this came
// from (folio/total/date), not re-render the entire original sale, and
// pulling saleInclude here would nest that sale's own user relation.
export const returnInclude = {
  originalSale: {
    select: { id: true, folio: true, total: true, createdAt: true, status: true, branchId: true },
  },
  branch: { select: { id: true, name: true } },
  processedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  authorizedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.ReturnInclude;

export function createReturn(data: Prisma.ReturnUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.return.create({ data, include: returnInclude });
}

export function createReturnItem(
  data: Prisma.ReturnItemUncheckedCreateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.returnItem.create({ data });
}

export function findReturnById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.return.findUnique({ where: { id }, include: returnInclude });
}

// The cumulative over-return guard's data source. Sums, per SaleItem, every
// quantity EVER returned against it — across all prior Return documents, not
// just the one being processed — so "you cannot give back more of a line
// than you bought" holds over an unbounded series of partial returns, not
// merely within a single request.
//
// direction: "RETURNED" is essential: NEW lines on a previous exchange are
// merchandise that went OUT and must never count toward how much of an
// original line has come back.
//
// Takes a `tx` (and every caller passes one) so the read happens inside the
// same transaction that will write the new rows — reading it outside would
// open a window where two concurrent returns each see the same stale sum and
// both pass the check.
export async function sumReturnedQuantitiesBySaleItem(
  saleItemIds: string[],
  tx: Prisma.TransactionClient = prisma
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (saleItemIds.length === 0) return totals;

  const rows = await tx.returnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItemId: { in: saleItemIds }, direction: "RETURNED" },
    _sum: { quantity: true },
  });

  for (const row of rows) {
    if (row.saleItemId) totals.set(row.saleItemId, row._sum.quantity ?? 0);
  }
  return totals;
}

export interface ListReturnsFilters {
  branchIds?: string[];
  branchId?: string;
  from?: Date;
  to?: Date;
}

// Same branch clause as listPurchases: a return belongs to exactly one
// branch (the one that took the merchandise back), so it is visible to
// whoever can see that branch.
export function listReturns(filters: ListReturnsFilters) {
  const branchClause = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  const where: Prisma.ReturnWhereInput = {
    ...branchClause,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };
  return prisma.return.findMany({ where, include: returnInclude, orderBy: { createdAt: "desc" } });
}
