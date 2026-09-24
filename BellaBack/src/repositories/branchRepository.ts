import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findAllBranches() {
  return prisma.branch.findMany({ orderBy: { name: "asc" } });
}

export function findBranchById(id: string) {
  return prisma.branch.findUnique({ where: { id } });
}

export function createBranch(data: Prisma.BranchCreateInput) {
  return prisma.branch.create({ data });
}

export function updateBranch(id: string, data: Prisma.BranchUpdateInput) {
  return prisma.branch.update({ where: { id }, data });
}

// Revenue per branch for a date window. Only COMPLETED sales count as
// revenue — a cancelled sale never happened financially, so it's excluded
// exactly like every other money total in this codebase (see
// saleRepository's own COMPLETED-only sums).
export function sumRevenueByBranch(from?: Date, to?: Date) {
  return prisma.sale.groupBy({
    by: ["branchId"],
    where: {
      status: "COMPLETED",
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    _sum: { total: true },
    _count: { _all: true },
  });
}
