import { prisma } from "../config/prisma";

// Postgres unique constraints treat every NULL as a distinct value, so the
// `@@unique([productId, variantId, branchId])` index does NOT enforce
// uniqueness across two rows that share productId/branchId and both have a
// NULL variantId (i.e. products without variants). That means
// `findUnique`/`upsert` against the generated `productId_variantId_branchId`
// compound key can't be trusted for variant-less products — see
// prisma/seed.ts's own findFirst-then-create workaround for the same issue.
// Every lookup here builds an explicit where clause that branches on
// variantId being present instead of relying on the compound unique input.
function whereRow(productId: string, variantId: string | undefined | null, branchId: string) {
  return variantId
    ? { productId, variantId, branchId }
    : { productId, variantId: null, branchId };
}

// Read-only. Writes to `inventory.stock` must only ever happen inside
// inventoryService.applyMovement's locked transaction — see that file's
// comment for why a bare findFirst-then-write here (outside a lock) would
// be unsafe for concurrent callers.
export function findInventoryRow(productId: string, variantId: string | undefined, branchId: string) {
  return prisma.inventory.findFirst({ where: whereRow(productId, variantId, branchId) });
}

export function listInventory(filters: { branchId?: string; categoryId?: string }) {
  return prisma.inventory.findMany({
    where: {
      branchId: filters.branchId,
      product: filters.categoryId ? { categoryId: filters.categoryId } : undefined,
    },
    include: { product: true, variant: true, branch: true },
    orderBy: { product: { name: "asc" } },
  });
}
