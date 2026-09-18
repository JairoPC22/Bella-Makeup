import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Only ever called from inside inventoryService.applyMovement's transaction
// — this repository does not expose any function that writes
// `inventory.stock` directly, per the plan's Global Constraints.
export function createMovement(data: Prisma.InventoryMovementUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.inventoryMovement.create({ data });
}

export function listMovements(productId: string, variantId?: string) {
  return prisma.inventoryMovement.findMany({
    where: { productId, variantId },
    include: { branch: true, user: true },
    orderBy: { createdAt: "desc" },
  });
}
