import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Forma compartida para list/detail/create/receive/cancel: proveedor y
// sucursal, los usuarios que crean/reciben reducidos a un subconjunto
// seguro, e items con nombre/sku de producto/variante para no requerir una
// segunda consulta en la pantalla de recepción.
//
// Los sub-selects de usuario son listas explícitas (no `true`) porque User
// incluye `passwordHash` y `pinHash`; seleccionar la relación completa
// expondría el hash del PIN del supervisor en cada respuesta.
export const purchaseInclude = {
  supplier: { select: { id: true, name: true, contactName: true, phone: true, email: true, status: true } },
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  receivedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.PurchaseInclude;

export function createPurchase(data: Prisma.PurchaseUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.purchase.create({ data, include: purchaseInclude });
}

export function createPurchaseItem(
  data: Prisma.PurchaseItemUncheckedCreateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.purchaseItem.create({ data });
}

export function findPurchaseById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.purchase.findUnique({ where: { id }, include: purchaseInclude });
}

export function updatePurchaseStatus(
  id: string,
  data: Prisma.PurchaseUncheckedUpdateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.purchase.update({ where: { id }, data, include: purchaseInclude });
}

export function setPurchaseItemReceived(
  id: string,
  receivedQuantity: number,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.purchaseItem.update({ where: { id }, data: { receivedQuantity } });
}

// Registra el costo real pagado en la última entrega. Se mantiene en el
// repositorio (en vez de usar prisma.product directo desde el servicio) para
// que todas las llamadas a Prisma de este módulo vivan en un solo archivo.
export function updateProductCost(productId: string, cost: Prisma.Decimal | number, tx: Prisma.TransactionClient = prisma) {
  return tx.product.update({ where: { id: productId }, data: { cost } });
}

export interface ListPurchasesFilters {
  branchIds?: string[];
  branchId?: string;
  status?: "PENDING" | "COMPLETED" | "RECEIVED_WITH_DISCREPANCIES" | "CANCELLED";
  supplierId?: string;
  from?: Date;
  to?: Date;
}

// Filtro de sucursal más simple que el de listTransfers: una compra tiene
// una sola sucursal (la que recibe), así que es visible para quien pueda
// ver esa sucursal.
export function listPurchases(filters: ListPurchasesFilters) {
  const branchClause = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  const where: Prisma.PurchaseWhereInput = {
    ...branchClause,
    status: filters.status,
    supplierId: filters.supplierId,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };
  return prisma.purchase.findMany({ where, include: purchaseInclude, orderBy: { createdAt: "desc" } });
}

// ---------- Proveedores ----------
// Sin filtro de sucursal: los proveedores son catálogo maestro de toda la
// empresa, no pertenecen a una sucursal en particular.

export function listSuppliers(status?: "ACTIVE" | "INACTIVE") {
  return prisma.supplier.findMany({ where: { status }, orderBy: { name: "asc" } });
}

export function findSupplierById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.supplier.findUnique({ where: { id } });
}

export function createSupplier(data: Prisma.SupplierUncheckedCreateInput) {
  return prisma.supplier.create({ data });
}

export function updateSupplier(id: string, data: Prisma.SupplierUncheckedUpdateInput) {
  return prisma.supplier.update({ where: { id }, data });
}
