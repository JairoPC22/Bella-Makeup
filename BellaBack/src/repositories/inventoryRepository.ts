import { prisma } from "../config/prisma";

// Postgres trata cada NULL como distinto, así que el índice único no protege
// productos sin variante (variantId NULL); por eso el where se arma a mano.
function whereRow(productId: string, variantId: string | undefined | null, branchId: string) {
  return variantId
    ? { productId, variantId, branchId }
    : { productId, variantId: null, branchId };
}

// Solo lectura: escribir `inventory.stock` fuera de la transacción bloqueada
// de inventoryService.applyMovement sería inseguro con llamadas concurrentes.
export function findInventoryRow(productId: string, variantId: string | undefined, branchId: string) {
  return prisma.inventory.findFirst({ where: whereRow(productId, variantId, branchId) });
}

// `branchIds` es el alcance de sucursales del usuario (undefined si tiene acceso a todas).
export function listInventory(filters: { branchId?: string; categoryId?: string; branchIds?: string[] }) {
  return prisma.inventory.findMany({
    where: {
      branchId: filters.branchId ?? (filters.branchIds ? { in: filters.branchIds } : undefined),
      product: filters.categoryId ? { categoryId: filters.categoryId } : undefined,
    },
    include: { product: true, variant: true, branch: true },
    orderBy: { product: { name: "asc" } },
  });
}
