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
    // `user` is scoped to a display-safe subset (not `user: true`) — the
    // kardex is shown directly in the frontend's movements modal, and a
    // bare `include: { user: true }` would ship every field on User,
    // including `passwordHash`, to the browser on every request.
    include: { branch: true, user: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } } },
    orderBy: { createdAt: "desc" },
  });
}
