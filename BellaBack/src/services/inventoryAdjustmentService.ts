import { applyMovement } from "./inventoryService";
import { createAdjustment } from "../repositories/inventoryAdjustmentRepository";
import { logAudit } from "./auditService";

export interface AdjustInventoryInput {
  productId: string;
  variantId?: string;
  branchId: string;
  quantity: number;
  reason: string;
}

// Thin wrapper around applyMovement for manual/authorized stock corrections
// (physical count discrepancies, damage write-offs, etc.). Three steps:
//   1. applyMovement(type: "ADJUSTMENT") — the single source of truth for
//      `inventory.stock`, guarded by its own advisory-lock transaction
//      (Task 5). Throws AppError(400) and writes nothing if the adjustment
//      would take stock negative.
//   2. Only if step 1 succeeded: create the linked InventoryAdjustment row
//      (reason + authorizedBy) referencing the new movement's id.
//   3. Audit log entry.
//
// NOTE on transaction boundaries (see task-6-report.md for the full
// writeup): step 1 runs in its OWN prisma.$transaction (opened inside
// applyMovement) and is NOT extended to cover step 2. This means a
// movement could, in a rare transient-DB-error scenario, be committed
// without its InventoryAdjustment row ever being created. This matches the
// brief's literal reference implementation; it was a deliberate choice, not
// an oversight — see the report for the reasoning.
export async function adjustInventory(input: AdjustInventoryInput, actorId: string) {
  const movement = await applyMovement({
    productId: input.productId,
    variantId: input.variantId,
    branchId: input.branchId,
    type: "ADJUSTMENT",
    quantity: input.quantity,
    userId: actorId,
  });

  await createAdjustment({ movementId: movement.id, reason: input.reason, authorizedBy: actorId });

  await logAudit({
    userId: actorId,
    action: "inventory.adjust",
    module: "inventory",
    entityType: "product",
    entityId: input.productId,
    branchId: input.branchId,
    details: { productId: input.productId, quantity: input.quantity, reason: input.reason },
  });

  return movement;
}
