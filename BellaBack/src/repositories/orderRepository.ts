import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Shared shape for create/list/detail/status-update responses, mirroring
// saleRepository.ts's `saleInclude` / transferRepository.ts's
// `transferInclude` exactly in spirit: customer, branch (scoped to the
// public-safe subset — id/name/address, matching OnlineOrder's `branch`
// field in BellaFront/src/types/api.ts), and items with product/variant
// name+sku. There is no `User` relation on this model at all (a public
// order has no authenticated actor), so there's no passwordHash-style leak
// risk to guard against here the way sale/transfer's `user`/`requestedBy`
// selects do.
export const orderInclude = {
  customer: true,
  branch: { select: { id: true, name: true, address: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export function createOrder(data: Prisma.OrderUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.order.create({ data, include: orderInclude });
}

export function createOrderItem(data: Prisma.OrderItemUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.orderItem.create({ data });
}

export function findOrderById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.order.findUnique({ where: { id }, include: orderInclude });
}

// Used by the public order-tracking lookup (GET /api/public/orders/:orderNumber),
// which only has the folio (decoded from the orderNumber) to go on.
export function findOrderByFolio(folio: number) {
  return prisma.order.findFirst({ where: { folio }, include: orderInclude });
}

export interface ListOrdersFilters {
  branchIds?: string[];
  branchId?: string;
  status?: "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  from?: Date;
  to?: Date;
}

export function listOrders(filters: ListOrdersFilters) {
  const where: Prisma.OrderWhereInput = {
    branchId: filters.branchId ?? (filters.branchIds ? { in: filters.branchIds } : undefined),
    status: filters.status,
    createdAt:
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined,
  };
  return prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: "desc" } });
}

export function updateOrderStatus(
  id: string,
  data: Prisma.OrderUncheckedUpdateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.order.update({ where: { id }, data, include: orderInclude });
}
