import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import * as purchaseRepo from "../repositories/purchaseRepository";

export interface PurchaseItemInput {
  productId: string;
  variantId?: string;
  expectedQuantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  supplierId: string;
  branchId: string;
  reference?: string;
  notes?: string;
  items: PurchaseItemInput[];
}

export interface ReceivePurchaseItemInput {
  purchaseItemId: string;
  receivedQuantity: number;
}

// "C-" for Compra, alongside saleService's "V-" (Venta) and transferService's
// "T-" (Transferencia), with the same 6-digit zero padding.
export function formatPurchaseNumber(folio: number): string {
  return `C-${String(folio).padStart(6, "0")}`;
}

// Mirrors transferService.ts's assertBranchAccess verbatim, which in turn
// mirrors saleService.ts's — same rationale as documented there: the
// requireBranchScope middleware only reads req.params, and a purchase's
// branchId arrives in the request body, so there is no live shared helper to
// reuse for this case.
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

// Mirrors mapTransfer, plus `discrepancyCount` — the number of
// already-received lines whose actual quantity differed from what was
// ordered. Derived rather than stored (it is a pure function of the items) so
// it can never fall out of sync, and surfaced because reconciling differences
// is the entire point of this module: the receiving list needs to show "3 of
// 12 lines came up short" without the client recomputing it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPurchase(purchase: any) {
  return {
    ...purchase,
    purchaseNumber: formatPurchaseNumber(purchase.folio),
    itemCount: purchase.items?.length ?? 0,
    discrepancyCount:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      purchase.items?.filter((i: any) => i.receivedQuantity !== null && i.receivedQuantity !== i.expectedQuantity)
        .length ?? 0,
  };
}

// Step 1 of 2. Records what was ORDERED and moves no stock whatsoever —
// nothing has physically arrived yet. This is the deliberate difference from
// createTransfer, which decrements the source branch immediately because
// goods really have left it at that moment. A purchase order is a statement
// of intent about a third party we do not control, so inventory stays
// untouched until someone counts what came off the truck.
export async function createPurchase(input: CreatePurchaseInput, actorId: string) {
  if (input.items.length === 0) {
    throw new AppError(400, "La compra debe tener al menos un artículo");
  }

  const purchase = await prisma.$transaction(async (tx) => {
    await assertBranchAccess(tx, actorId, input.branchId);

    const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new AppError(404, "Sucursal no encontrada");
    if (branch.status === "INACTIVE") throw new AppError(400, `La sucursal "${branch.name}" está inactiva`);

    const supplier = await purchaseRepo.findSupplierById(input.supplierId, tx);
    if (!supplier) throw new AppError(404, "Proveedor no encontrado");
    if (supplier.status === "INACTIVE") throw new AppError(400, `El proveedor "${supplier.name}" está inactivo`);

    for (const item of input.items) {
      if (item.expectedQuantity <= 0) throw new AppError(400, "La cantidad esperada debe ser mayor a cero");
      if (item.unitCost < 0) throw new AppError(400, "El costo unitario no puede ser negativo");

      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new AppError(404, `Producto no encontrado: ${item.productId}`);
      if (product.status === "INACTIVE") throw new AppError(400, `El producto "${product.name}" está inactivo`);

      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant) throw new AppError(404, `Variante no encontrada: ${item.variantId}`);
        if (variant.productId !== product.id) throw new AppError(400, "La variante no pertenece al producto indicado");
      }
    }

    const created = await purchaseRepo.createPurchase(
      {
        supplierId: input.supplierId,
        branchId: input.branchId,
        reference: input.reference,
        notes: input.notes,
        createdByUserId: actorId,
        status: "PENDING",
      },
      tx
    );

    for (const item of input.items) {
      await purchaseRepo.createPurchaseItem(
        {
          purchaseId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          expectedQuantity: item.expectedQuantity,
          // Explicitly null, not 0: "not yet counted" and "counted, none
          // arrived" are different facts and must stay distinguishable.
          receivedQuantity: null,
          unitCost: new Prisma.Decimal(item.unitCost),
        },
        tx
      );
    }

    const full = await purchaseRepo.findPurchaseById(created.id, tx);
    return full!;
  });

  await logAudit({
    userId: actorId,
    action: "purchases.create",
    module: "purchases",
    entityType: "purchase",
    entityId: purchase.id,
    branchId: purchase.branchId,
    details: { folio: purchase.folio, supplierId: purchase.supplierId, itemCount: purchase.items.length },
  });

  return mapPurchase(purchase);
}

// Step 2 of 2, and the reason this module exists. Only valid from PENDING.
//
// The governing rule, straight from the spec and matching receiveTransfer's
// discipline: a mismatch is NEVER an error. A short delivery, an over
// delivery, or a line that did not arrive at all are all ordinary facts of
// receiving goods from a third party. The system records the difference and
// moves stock by what ACTUALLY arrived — it does not refuse the delivery, and
// it does not quietly credit the branch with quantities nobody ever counted.
//
// Lines omitted from the payload are treated as receivedQuantity 0 rather
// than left null. Leaving them null would make a fully received purchase
// carry "not yet counted" lines forever and make the COMPLETED vs
// RECEIVED_WITH_DISCREPANCIES decision incoherent; 0 is the honest reading of
// "the receiver closed out this delivery and this line was not in it".
//
// Over-delivery (receivedQuantity > expectedQuantity) is allowed and counted
// as a discrepancy rather than rejected, symmetrically with a shortfall: if
// 13 units physically arrived against an order of 12, refusing to record the
// 13th would put the system permanently out of step with the shelf.
export async function receivePurchase(
  id: string,
  input: { items: ReceivePurchaseItemInput[] },
  actorId: string
) {
  const updated = await prisma.$transaction(async (tx) => {
    const purchase = await purchaseRepo.findPurchaseById(id, tx);
    if (!purchase) throw new AppError(404, "Compra no encontrada");
    if (purchase.status === "COMPLETED" || purchase.status === "RECEIVED_WITH_DISCREPANCIES") {
      throw new AppError(400, "La compra ya fue recibida");
    }
    if (purchase.status === "CANCELLED") throw new AppError(400, "La compra está cancelada");
    if (purchase.status !== "PENDING") throw new AppError(400, "La compra no está pendiente de recepción");

    await assertBranchAccess(tx, actorId, purchase.branchId);

    const submitted = new Map<string, number>();
    for (const line of input.items) {
      if (submitted.has(line.purchaseItemId)) {
        throw new AppError(400, "Hay líneas repetidas en la recepción");
      }
      const target = purchase.items.find((i) => i.id === line.purchaseItemId);
      if (!target) {
        throw new AppError(400, `La línea ${line.purchaseItemId} no pertenece a esta compra`);
      }
      if (line.receivedQuantity < 0) {
        throw new AppError(400, "La cantidad recibida no puede ser negativa");
      }
      submitted.set(line.purchaseItemId, line.receivedQuantity);
    }

    let allMatched = true;
    for (const item of purchase.items) {
      const receivedQuantity = submitted.get(item.id) ?? 0;
      if (receivedQuantity !== item.expectedQuantity) allMatched = false;

      await purchaseRepo.setPurchaseItemReceived(item.id, receivedQuantity, tx);

      if (receivedQuantity > 0) {
        // Every stock change in this app goes through applyMovement — it is
        // the only writer of inventory.stock and it writes the kardex row in
        // the same transaction. MovementType.PURCHASE already exists in the
        // schema enum and is reused as-is.
        await applyMovement(
          {
            productId: item.productId,
            variantId: item.variantId ?? undefined,
            branchId: purchase.branchId,
            type: "PURCHASE",
            quantity: receivedQuantity,
            reference: purchase.id,
            userId: actorId,
          },
          tx
        );

        // Judgment call (flagged in the report): Product.cost is refreshed to
        // the unit cost actually paid on this delivery. Cost tracking that
        // ignores the most recent real purchase goes stale immediately and
        // silently corrupts every margin report downstream, so the latest
        // real invoice is the best available answer. Only lines that actually
        // arrived update it — a line that never showed up tells us nothing
        // about current cost. Note this is last-cost, not weighted-average
        // costing; the per-line unitCost stays on PurchaseItem forever, so
        // moving to a weighted average later needs no schema change.
        await purchaseRepo.updateProductCost(item.productId, item.unitCost, tx);
      }
    }

    return purchaseRepo.updatePurchaseStatus(
      id,
      {
        status: allMatched ? "COMPLETED" : "RECEIVED_WITH_DISCREPANCIES",
        receivedByUserId: actorId,
        receivedAt: new Date(),
      },
      tx
    );
  });

  await logAudit({
    userId: actorId,
    action: "purchases.receive",
    module: "purchases",
    entityType: "purchase",
    entityId: updated.id,
    branchId: updated.branchId,
    details: {
      folio: updated.folio,
      status: updated.status,
      lines: updated.items.map((i) => ({
        purchaseItemId: i.id,
        expected: i.expectedQuantity,
        received: i.receivedQuantity,
      })),
    },
  });

  return mapPurchase(updated);
}

// Only valid from PENDING. Unlike cancelTransfer there is nothing to reverse:
// a PENDING purchase has never touched inventory, so cancelling is a pure
// status change. Once received, the stock is real and on the shelf — undoing
// that is a return/adjustment, a different operation with its own audit
// requirements, not a cancellation.
export async function cancelPurchase(id: string, reason: string, actorId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const purchase = await purchaseRepo.findPurchaseById(id, tx);
    if (!purchase) throw new AppError(404, "Compra no encontrada");
    if (purchase.status === "CANCELLED") throw new AppError(400, "La compra ya está cancelada");
    if (purchase.status === "COMPLETED" || purchase.status === "RECEIVED_WITH_DISCREPANCIES") {
      throw new AppError(400, "No se puede cancelar una compra ya recibida");
    }

    await assertBranchAccess(tx, actorId, purchase.branchId);

    return purchaseRepo.updatePurchaseStatus(
      id,
      { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
      tx
    );
  });

  await logAudit({
    userId: actorId,
    action: "purchases.cancel",
    module: "purchases",
    entityType: "purchase",
    entityId: updated.id,
    branchId: updated.branchId,
    details: { folio: updated.folio, reason },
  });

  return mapPurchase(updated);
}

export interface ListPurchasesFilters {
  branchId?: string;
  status?: "PENDING" | "COMPLETED" | "RECEIVED_WITH_DISCREPANCIES" | "CANCELLED";
  supplierId?: string;
  from?: Date;
  to?: Date;
}

// Branch-scoped exactly like transferService.listTransfers: `allBranches`
// sees everything, everyone else is restricted to their assigned branches,
// and an explicit branchId outside that set is a 403 rather than a silently
// empty list.
export async function listPurchases(actorId: string, filters: ListPurchasesFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const purchases = await purchaseRepo.listPurchases({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    status: filters.status,
    supplierId: filters.supplierId,
    from: filters.from,
    to: filters.to,
  });

  return purchases.map((p) => mapPurchase(p));
}

export async function getPurchase(id: string, actorId: string) {
  const purchase = await purchaseRepo.findPurchaseById(id);
  if (!purchase) throw new AppError(404, "Compra no encontrada");

  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && !accessible.includes(purchase.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  return mapPurchase(purchase);
}

// ---------- Suppliers ----------
// No branch scoping: suppliers are company-wide master data, so every branch
// orders from the same catalog.

export async function listSuppliers(filters: { status?: "ACTIVE" | "INACTIVE" } = {}) {
  return purchaseRepo.listSuppliers(filters.status);
}

export async function createSupplier(
  input: { name: string; contactName?: string; phone?: string; email?: string },
  actorId: string
) {
  const supplier = await purchaseRepo.createSupplier(input);
  await logAudit({
    userId: actorId,
    action: "suppliers.create",
    module: "purchases",
    entityType: "supplier",
    entityId: supplier.id,
    details: { name: supplier.name },
  });
  return supplier;
}

export async function updateSupplier(
  id: string,
  input: { name?: string; contactName?: string; phone?: string; email?: string; status?: "ACTIVE" | "INACTIVE" },
  actorId: string
) {
  const existing = await purchaseRepo.findSupplierById(id);
  if (!existing) throw new AppError(404, "Proveedor no encontrado");

  const supplier = await purchaseRepo.updateSupplier(id, input);
  await logAudit({
    userId: actorId,
    action: "suppliers.update",
    module: "purchases",
    entityType: "supplier",
    entityId: supplier.id,
    details: { changes: input },
  });
  return supplier;
}
