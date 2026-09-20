import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Shared shape for list/detail/create/receive/cancel responses, mirroring
// saleRepository.ts's `saleInclude` exactly in spirit: source/destination
// branch, requester/receiver scoped to a display-safe subset (never
// `passwordHash`), and items with product/variant name+sku.
export const transferInclude = {
  sourceBranch: { select: { id: true, name: true } },
  destinationBranch: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  receivedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.TransferInclude;

export function createTransfer(data: Prisma.TransferUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.transfer.create({ data, include: transferInclude });
}

export function createTransferItem(data: Prisma.TransferItemUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.transferItem.create({ data });
}

export function findTransferById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.transfer.findUnique({ where: { id }, include: transferInclude });
}

export interface ListTransfersFilters {
  branchIds?: string[];
  branchId?: string;
  status?: "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  from?: Date;
  to?: Date;
}

export function listTransfers(filters: ListTransfersFilters) {
  const branchClause = filters.branchId
    ? { OR: [{ sourceBranchId: filters.branchId }, { destinationBranchId: filters.branchId }] }
    : filters.branchIds
      ? { OR: [{ sourceBranchId: { in: filters.branchIds } }, { destinationBranchId: { in: filters.branchIds } }] }
      : {};

  const where: Prisma.TransferWhereInput = {
    ...branchClause,
    status: filters.status,
    createdAt:
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined,
  };
  return prisma.transfer.findMany({ where, include: transferInclude, orderBy: { createdAt: "desc" } });
}

export function updateTransferStatus(
  id: string,
  data: Prisma.TransferUncheckedUpdateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.transfer.update({ where: { id }, data, include: transferInclude });
}
