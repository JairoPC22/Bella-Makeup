import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Thin data-access layer for the `inventory_adjustments` table — the reason
// + authorizedBy audit trail linked 1:1 (movementId is unique) to the
// InventoryMovement row that inventoryService.applyMovement created. This
// never writes `inventory.stock` itself; that's applyMovement's job alone.
export function createAdjustment(
  data: { movementId: string; reason: string; authorizedBy?: string },
  tx: Prisma.TransactionClient = prisma
) {
  return tx.inventoryAdjustment.create({ data });
}
