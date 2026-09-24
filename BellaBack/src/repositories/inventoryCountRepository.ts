import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Mirrors mermaRepository.ts's include convention exactly.
export const inventoryCountInclude = {
  branch: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  startedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  completedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.InventoryCountInclude;

export function createInventoryCount(data: Prisma.InventoryCountUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.inventoryCount.create({ data, include: inventoryCountInclude });
}

export function createInventoryCountItems(data: Prisma.InventoryCountItemUncheckedCreateInput[], tx: Prisma.TransactionClient = prisma) {
  return tx.inventoryCountItem.createMany({ data });
}

export function findInventoryCountById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.inventoryCount.findUnique({ where: { id }, include: inventoryCountInclude });
}

export interface ListInventoryCountsFilters {
  branchIds?: string[];
  branchId?: string;
  status?: "OPEN" | "COMPLETED" | "CANCELLED";
}

export function listInventoryCounts(filters: ListInventoryCountsFilters) {
  const branchClause = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  const where: Prisma.InventoryCountWhereInput = { ...branchClause, status: filters.status };
  return prisma.inventoryCount.findMany({ where, include: inventoryCountInclude, orderBy: { createdAt: "desc" } });
}

export function updateCountItem(id: string, data: Prisma.InventoryCountItemUncheckedUpdateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.inventoryCountItem.update({ where: { id }, data });
}

export function updateInventoryCountStatus(
  id: string,
  data: Prisma.InventoryCountUncheckedUpdateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.inventoryCount.update({ where: { id }, data, include: inventoryCountInclude });
}

// Productos de una categoría, marca o lista explícita de ids, usados para
// sembrar las líneas de un nuevo conteo. A propósito NO se filtra por
// status (ni de producto ni de variante): un conteo físico verifica el
// stock real en el anaquel, y el inactivo/descontinuado es justo el que más
// necesita reconciliarse (mismo criterio que mermaService.registerMerma).
// Cada producto trae todas sus variantes (una línea de InventoryCountItem
// por variante, o una línea a nivel producto cuando no tiene ninguna).
export function findProductsForScope(scope: { categoryId?: string; brandId?: string; productIds?: string[] }) {
  const where: Prisma.ProductWhereInput = {};
  if (scope.productIds) where.id = { in: scope.productIds };
  else if (scope.categoryId) where.categoryId = scope.categoryId;
  else if (scope.brandId) where.brandId = scope.brandId;

  return prisma.product.findMany({
    where,
    include: { variants: true },
  });
}

export function findStockRows(branchId: string, productIds: string[]) {
  return prisma.inventory.findMany({ where: { branchId, productId: { in: productIds } } });
}
