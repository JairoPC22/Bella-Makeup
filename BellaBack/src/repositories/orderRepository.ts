import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Include compartido, similar a saleInclude/transferInclude: customer,
// branch (subset público) e items con producto/variante. No hay `User`
// en este modelo, así que no hay riesgo de filtrar datos sensibles aquí.
export const orderInclude = {
  customer: true,
  branch: { select: { id: true, name: true, address: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
  // Presente solo cuando el pedido se completó (orderService.updateOrderStatus).
  sale: { select: { id: true, folio: true } },
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

// Usado por el rastreo público de pedidos, que solo tiene el folio decodificado.
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
