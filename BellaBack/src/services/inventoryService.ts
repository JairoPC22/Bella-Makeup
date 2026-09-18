import { createHash } from "crypto";
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

// Deterministically derives a signed 64-bit integer key for
// pg_advisory_xact_lock(bigint) from the exact (productId, variantId,
// branchId) tuple applyMovement is about to touch. Hashing (rather than,
// say, concatenating and parsing) means the key depends on the full tuple
// including variantId's presence/absence, so a variant-less row (variantId
// undefined) and a specific variant's row never collide, and two different
// products/branches essentially never collide either (SHA-256 over a
// unique string, truncated to 8 bytes — collision odds are astronomically
// low, and a false-positive collision would only ever cost a spurious
// serialization between two unrelated rows, never a correctness bug).
export function inventoryLockKey(productId: string, variantId: string | undefined, branchId: string): bigint {
  const raw = `${productId}:${variantId ?? "null"}:${branchId}`;
  const hash = createHash("sha256").update(raw).digest();
  return hash.readBigInt64BE(0);
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
// it with an explicit lock taken before the read; the same technique is
// used here.
//
// Review round 2 revised this from a `SELECT ... FOR UPDATE` on the parent
// Product row to a Postgres advisory lock (`pg_advisory_xact_lock`) keyed
// on the exact (productId, variantId, branchId) tuple. Reasoning for each
// choice:
//   - Why not lock the Inventory row directly (finest-grained option)?
//     The Inventory row may not exist yet on a first-ever movement for a
//     given variant/branch combination, so there's nothing to `FOR UPDATE`
//     on the very first write.
//   - Why not lock the Product row (the original approach)? It's always
//     correct — Product always exists — but it serializes EVERY
//     applyMovement call for a product through one lock, even when two
//     calls touch entirely disjoint Inventory rows (same product,
//     different branches, or different variants). That's an unnecessary
//     bottleneck for a busy multi-branch product once concurrent POS
//     sales land in a later phase.
//   - Why an advisory lock keyed on the full tuple solves both problems:
//     `pg_advisory_xact_lock` takes an arbitrary integer key and requires
//     no existing row to lock, so it serializes "does this exact tuple's
//     row exist yet" for concurrent first-time movements exactly like the
//     Product lock did, but scoped down to only the calls that actually
//     target the same (productId, variantId, branchId) — different
//     branches or variants of the same product now proceed independently.
//     It's also released automatically at transaction end/rollback (no
//     manual unlock, no risk of a held lock leaking past a thrown
//     AppError).
//   - The NULL-variantId edge case is still closed: inventoryLockKey hashes
//     variantId's presence/absence into the key (`variantId ?? "null"`),
//     so all variant-less-row candidates for the same (productId,
//     branchId) still serialize through the same key, and a plain
//     findFirst + create/update inside the lock never needs to depend on
//     `inventory.upsert`'s ON CONFLICT semantics — which don't fire on
//     NULL and would otherwise let two concurrent first-writes create
//     duplicate rows for variant-less products (see
//     prisma/seed.ts's own findFirst-then-create workaround for the same
//     issue).
export async function applyMovement(input: ApplyMovementInput) {
  return prisma.$transaction(async (tx) => {
    const lockKey = inventoryLockKey(input.productId, input.variantId, input.branchId);
    // $executeRaw (not $queryRaw): pg_advisory_xact_lock returns `void`,
    // which Prisma's result deserializer can't map to a Prisma type when
    // fetched via $queryRaw ("Failed to deserialize column of type
    // 'void'"). $executeRaw just runs the statement and returns the
    // affected-row count, which is exactly what's needed here — the lock
    // is acquired as a side effect, its return value is irrelevant.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

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
