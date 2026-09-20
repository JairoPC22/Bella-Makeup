import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import * as transferRepo from "../repositories/transferRepository";

export interface TransferItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CreateTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  items: TransferItemInput[];
}

export function formatTransferNumber(folio: number): string {
  return `T-${String(folio).padStart(6, "0")}`;
}

// Mirrors saleService.ts's assertBranchAccess exactly (same rationale: no
// currently-live shared helper for a body-supplied branchId, since
// requireBranchScope middleware only reads req.params).
async function assertBranchAccess(client: Prisma.TransactionClient, userId: string, branchId: string): Promise<void> {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "Usuario no encontrado");
  if (user.allBranches) return;
  const assignment = await client.userBranch.findUnique({ where: { userId_branchId: { userId, branchId } } });
  if (!assignment) throw new AppError(403, "Sin acceso a esta sucursal");
}

async function getAccessibleBranchIds(userId: string): Promise<string[] | "ALL"> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "Usuario no encontrado");
  if (user.allBranches) return "ALL";
  const rows = await prisma.userBranch.findMany({ where: { userId }, select: { branchId: true } });
  return rows.map((r) => r.branchId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransfer(transfer: any) {
  return {
    ...transfer,
    transferNumber: formatTransferNumber(transfer.folio),
    itemCount: transfer.items?.length ?? 0,
  };
}

// Two-step lifecycle: creating a transfer immediately decrements the source
// branch (goods have physically left), moving straight to IN_TRANSIT — there
// is no separate "approve/dispatch" step in this design, so PENDING is only
// ever a schema-level default, never actually reached in practice.
// receiveTransfer later increments the destination branch and completes it;
// cancelTransfer (only valid while IN_TRANSIT) reverses the source decrement.
export async function createTransfer(input: CreateTransferInput, actorId: string) {
  if (input.sourceBranchId === input.destinationBranchId) {
    throw new AppError(400, "La sucursal de origen y destino no pueden ser la misma");
  }
  if (input.items.length === 0) {
    throw new AppError(400, "La transferencia debe tener al menos un artículo");
  }

  const transfer = await prisma.$transaction(async (tx) => {
    await assertBranchAccess(tx, actorId, input.sourceBranchId);

    const sourceBranch = await tx.branch.findUnique({ where: { id: input.sourceBranchId } });
    if (!sourceBranch) throw new AppError(404, "Sucursal de origen no encontrada");
    if (sourceBranch.status === "INACTIVE") throw new AppError(400, `La sucursal "${sourceBranch.name}" está inactiva`);

    const destinationBranch = await tx.branch.findUnique({ where: { id: input.destinationBranchId } });
    if (!destinationBranch) throw new AppError(404, "Sucursal de destino no encontrada");
    if (destinationBranch.status === "INACTIVE") throw new AppError(400, `La sucursal "${destinationBranch.name}" está inactiva`);

    for (const item of input.items) {
      if (item.quantity <= 0) throw new AppError(400, "La cantidad debe ser mayor a cero");

      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new AppError(404, `Producto no encontrado: ${item.productId}`);

      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant) throw new AppError(404, `Variante no encontrada: ${item.variantId}`);
        if (variant.productId !== product.id) throw new AppError(400, "La variante no pertenece al producto indicado");
      }

      const whereRow = item.variantId
        ? { productId: item.productId, variantId: item.variantId, branchId: input.sourceBranchId }
        : { productId: item.productId, variantId: null, branchId: input.sourceBranchId };
      const inventoryRow = await tx.inventory.findFirst({ where: whereRow });
      const available = inventoryRow?.stock ?? 0;
      if (available < item.quantity) {
        throw new AppError(
          400,
          `Stock insuficiente para "${product.name}" en la sucursal de origen (disponible: ${available}, solicitado: ${item.quantity})`
        );
      }
    }

    const created = await transferRepo.createTransfer(
      {
        sourceBranchId: input.sourceBranchId,
        destinationBranchId: input.destinationBranchId,
        notes: input.notes,
        requestedByUserId: actorId,
        status: "IN_TRANSIT",
        dispatchedAt: new Date(),
      },
      tx
    );

    for (const item of input.items) {
      await transferRepo.createTransferItem(
        {
          transferId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        },
        tx
      );

      // Goods have physically left the source branch the moment the
      // transfer is dispatched — decrement immediately, not on receipt.
      await applyMovement(
        {
          productId: item.productId,
          variantId: item.variantId,
          branchId: input.sourceBranchId,
          type: "TRANSFER_OUT",
          quantity: -item.quantity,
          reference: created.id,
          userId: actorId,
        },
        tx
      );
    }

    const full = await transferRepo.findTransferById(created.id, tx);
    return full!;
  });

  await logAudit({
    userId: actorId,
    action: "transfers.create",
    module: "transfers",
    entityType: "transfer",
    entityId: transfer.id,
    branchId: transfer.sourceBranchId,
    details: { folio: transfer.folio, destinationBranchId: transfer.destinationBranchId, itemCount: transfer.items.length },
  });

  return mapTransfer(transfer);
}

export async function receiveTransfer(id: string, actorId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const transfer = await transferRepo.findTransferById(id, tx);
    if (!transfer) throw new AppError(404, "Transferencia no encontrada");
    if (transfer.status === "COMPLETED") throw new AppError(400, "La transferencia ya fue recibida");
    if (transfer.status === "CANCELLED") throw new AppError(400, "La transferencia está cancelada");
    if (transfer.status !== "IN_TRANSIT") throw new AppError(400, "La transferencia no está en tránsito");

    await assertBranchAccess(tx, actorId, transfer.destinationBranchId);

    for (const item of transfer.items) {
      await applyMovement(
        {
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          branchId: transfer.destinationBranchId,
          type: "TRANSFER_IN",
          quantity: item.quantity,
          reference: transfer.id,
          userId: actorId,
        },
        tx
      );
    }

    return transferRepo.updateTransferStatus(
      id,
      { status: "COMPLETED", receivedByUserId: actorId, completedAt: new Date() },
      tx
    );
  });

  await logAudit({
    userId: actorId,
    action: "transfers.receive",
    module: "transfers",
    entityType: "transfer",
    entityId: updated.id,
    branchId: updated.destinationBranchId,
    details: { folio: updated.folio },
  });

  return mapTransfer(updated);
}

// Only valid from IN_TRANSIT (mirrors saleService.ts's cancelSale): restores
// every item's quantity back onto the source branch, since createTransfer
// already decremented it at dispatch time.
export async function cancelTransfer(id: string, reason: string, actorId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const transfer = await transferRepo.findTransferById(id, tx);
    if (!transfer) throw new AppError(404, "Transferencia no encontrada");
    if (transfer.status === "COMPLETED") throw new AppError(400, "No se puede cancelar una transferencia ya recibida");
    if (transfer.status === "CANCELLED") throw new AppError(400, "La transferencia ya está cancelada");

    await assertBranchAccess(tx, actorId, transfer.sourceBranchId);

    for (const item of transfer.items) {
      await applyMovement(
        {
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          branchId: transfer.sourceBranchId,
          type: "TRANSFER_IN",
          quantity: item.quantity,
          reference: `cancel:${transfer.id}`,
          userId: actorId,
        },
        tx
      );
    }

    return transferRepo.updateTransferStatus(
      id,
      { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
      tx
    );
  });

  await logAudit({
    userId: actorId,
    action: "transfers.cancel",
    module: "transfers",
    entityType: "transfer",
    entityId: updated.id,
    branchId: updated.sourceBranchId,
    details: { folio: updated.folio, reason },
  });

  return mapTransfer(updated);
}

export interface ListTransfersFilters {
  branchId?: string;
  status?: "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  from?: Date;
  to?: Date;
}

// Branch-scoped like saleService.ts's listSales: `branchId` matches either
// direction (source OR destination) since a branch manager needs visibility
// into transfers leaving AND arriving at their branch. A caller without
// `allBranches` is restricted to their assigned branches; an explicit
// `branchId` outside that set is rejected with 403.
export async function listTransfers(actorId: string, filters: ListTransfersFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const transfers = await transferRepo.listTransfers({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    status: filters.status,
    from: filters.from,
    to: filters.to,
  });

  return transfers.map((t) => mapTransfer(t));
}

export async function getTransfer(id: string, actorId: string) {
  const transfer = await transferRepo.findTransferById(id);
  if (!transfer) throw new AppError(404, "Transferencia no encontrada");

  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && !accessible.includes(transfer.sourceBranchId) && !accessible.includes(transfer.destinationBranchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  return mapTransfer(transfer);
}
