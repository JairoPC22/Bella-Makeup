import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Solo se llama dentro de la transacción de inventoryService.applyMovement;
// este repositorio nunca escribe `inventory.stock` directamente.
export function createMovement(data: Prisma.InventoryMovementUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.inventoryMovement.create({ data });
}

export function listMovements(productId: string, variantId?: string) {
  return prisma.inventoryMovement.findMany({
    where: { productId, variantId },
    // `user` usa un select limitado (no `user: true`) para no exponer passwordHash al frontend.
    include: { branch: true, user: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } } },
    orderBy: { createdAt: "desc" },
  });
}
