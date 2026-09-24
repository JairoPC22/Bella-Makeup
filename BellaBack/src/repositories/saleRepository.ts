import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Forma compartida por listado/detalle/creación/cancelación. `user` se
// limita a un subconjunto seguro para mostrar, para que passwordHash nunca
// salga de la API.
export const saleInclude = {
  branch: true,
  user: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  customer: true,
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
  payments: true,
} satisfies Prisma.SaleInclude;

export function createSale(data: Prisma.SaleUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.sale.create({ data, include: saleInclude });
}

export function createSaleItem(data: Prisma.SaleItemUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.saleItem.create({ data });
}

export function createSalePayment(data: Prisma.SalePaymentUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.salePayment.create({ data });
}

export function findSaleById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.sale.findUnique({ where: { id }, include: saleInclude });
}

export interface ListSalesFilters {
  branchIds?: string[];
  branchId?: string;
  status?: "COMPLETED" | "CANCELLED";
  from?: Date;
  to?: Date;
}

export function listSales(filters: ListSalesFilters) {
  const where: Prisma.SaleWhereInput = {
    branchId: filters.branchId ?? (filters.branchIds ? { in: filters.branchIds } : undefined),
    status: filters.status,
    createdAt:
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined,
  };
  return prisma.sale.findMany({ where, include: saleInclude, orderBy: { createdAt: "desc" } });
}

export function cancelSale(
  id: string,
  data: { cancelledAt: Date; cancelledBy: string; cancelReason: string },
  tx: Prisma.TransactionClient = prisma
) {
  return tx.sale.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: data.cancelledAt, cancelledBy: data.cancelledBy, cancelReason: data.cancelReason },
    include: saleInclude,
  });
}
