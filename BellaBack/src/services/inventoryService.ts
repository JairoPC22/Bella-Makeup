import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { createMovement } from "../repositories/inventoryMovementRepository";

export interface ApplyMovementInput {
  productId: string;
  variantId?: string;
  branchId: string;
  type: "ADJUSTMENT" | "PURCHASE" | "SALE" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN";
  quantity: number; // signed: positive = stock-in, negative = stock-out
  reference?: string;
  userId?: string;
}

// THE single source of truth for changing `inventory.stock`. Per the plan's
// Global Constraints, no other code may write that column directly — every
// future phase (sales, purchases, transfers, physical counts) must call
// this function instead of touching `prisma.inventory` itself.
//
// It reads the current stock for (productId, variantId, branchId), computes
// the new stock, rejects the change with AppError(400) if it would go
// negative, and — only if accepted — atomically writes the new stock and a
// movement/kardex row together.
//
// Concurrency: two overlapping applyMovement calls for the same inventory
// row must not lose an update or allow stock to go negative via a
// read/read/write/write interleaving. A bare `prisma.$transaction` wrapped
// around a read-then-write is NOT sufficient by itself under Postgres's
// default READ COMMITTED isolation: two concurrent transactions can each
// run their read before either commits its write, so both could compute
// stock from the same stale `stockBefore`. Task 3's fix for the exact same
// shape of bug (productImageRepository.createImageWithAutoPrimary) closes
// it with an explicit `SELECT ... FOR UPDATE` row lock taken before the
// read; the same technique is used here.
//
// The lock is taken on the *Product* row rather than the Inventory row
// directly, for two reasons specific to this schema:
//   1. The Inventory row may not exist yet (first-ever movement for a given
//      variant/branch combination), so there is nothing to `FOR UPDATE` on
//      the very first write — Product always exists by the time
//      applyMovement is called.
//   2. `Inventory`'s compound unique key is [productId, variantId, branchId]
//      with a nullable variantId. Postgres unique constraints never treat
//      two NULLs as conflicting, so relying on `inventory.upsert`'s
//      ON CONFLICT semantics (ON CONFLICT never fires when variant_id IS
//      NULL) would silently allow duplicate inventory rows for
//      variant-less products under concurrent first-writes — see
//      prisma/seed.ts's own findFirst-then-create workaround for the same
//      NULL-handling issue. Locking Product first and doing an explicit
//      findFirst + create/update inside that lock sidesteps the ON
//      CONFLICT/NULL problem entirely, because only one transaction at a
//      time is ever manipulating inventory for that product.
// The trade-off: this serializes applyMovement calls across all
// variants/branches of the same product, not just the same row. That is
// coarser than strictly necessary, but it is correct, and it mirrors the
// precedent Task 3 already established for this exact race-condition shape.
export async function applyMovement(input: ApplyMovementInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${input.productId} FOR UPDATE`;

    const whereRow = input.variantId
      ? { productId: input.productId, variantId: input.variantId, branchId: input.branchId }
      : { productId: input.productId, variantId: null, branchId: input.branchId };

    const existing = await tx.inventory.findFirst({ where: whereRow });
    const stockBefore = existing?.stock ?? 0;
    const stockAfter = stockBefore + input.quantity;

    if (stockAfter < 0) {
      throw new AppError(400, "La operación dejaría el inventario en negativo");
    }

    if (existing) {
      await tx.inventory.update({ where: { id: existing.id }, data: { stock: stockAfter } });
    } else {
      await tx.inventory.create({
        data: { productId: input.productId, variantId: input.variantId, branchId: input.branchId, stock: stockAfter },
      });
    }

    return createMovement(
      {
        productId: input.productId,
        variantId: input.variantId,
        branchId: input.branchId,
        type: input.type,
        quantity: input.quantity,
        stockBefore,
        stockAfter,
        reference: input.reference,
        userId: input.userId,
      },
      tx
    );
  });
}

export function computeStatus(stock: number, minStock: number): "AVAILABLE" | "LOW" | "CRITICAL" | "OUT" {
  if (stock <= 0) return "OUT";
  if (stock <= Math.floor(minStock / 2)) return "CRITICAL";
  if (stock <= minStock) return "LOW";
  return "AVAILABLE";
}

export { findInventoryRow, listInventory } from "../repositories/inventoryRepository";
export { listMovements } from "../repositories/inventoryMovementRepository";
