import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { assertBranchAccess, getAccessibleBranchIds } from "./branchAccessService";
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

// "C-" de Compra, junto a "V-" (Venta) de saleService y "T-" (Transferencia)
// de transferService, con el mismo relleno de ceros a 6 dígitos.
export function formatPurchaseNumber(folio: number): string {
  return `C-${String(folio).padStart(6, "0")}`;
}

// Igual que mapTransfer, más `discrepancyCount`: el número de líneas ya
// recibidas cuya cantidad real difirió de lo pedido. Se calcula, no se
// guarda (es función pura de los items), para que nunca se desincronice; se
// expone porque conciliar diferencias es el propósito de este módulo.
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

// Paso 1 de 2. Registra lo PEDIDO y no mueve stock alguno: nada ha llegado
// físicamente aún. Es la diferencia deliberada con createTransfer, que
// descuenta la sucursal origen de inmediato porque la mercancía sí salió.
// Una orden de compra es una declaración de intención sobre un tercero que
// no controlamos, así que el inventario no se toca hasta que alguien cuenta
// lo que bajó del camión.
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
          // Explícitamente null, no 0: "aún no contado" y "contado, no llegó
          // nada" son hechos distintos y deben seguir siendo distinguibles.
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

// Paso 2 de 2, y la razón de ser de este módulo. Solo válido desde PENDING.
//
// Regla rectora, igual disciplina que receiveTransfer: un desajuste NUNCA es
// un error. Una entrega corta, de más, o una línea que no llegó son hechos
// normales al recibir mercancía de un tercero. El sistema registra la
// diferencia y mueve stock por lo que REALMENTE llegó, sin rechazar la
// entrega ni acreditar cantidades que nadie contó.
//
// Las líneas omitidas del payload se tratan como receivedQuantity 0, no se
// dejan en null: dejarlas null haría que una compra totalmente recibida
// cargara líneas "sin contar" para siempre. Cero es la lectura honesta de
// "quien recibió cerró esta entrega y esta línea no vino en ella".
//
// La sobre-entrega (receivedQuantity > expectedQuantity) se permite y se
// cuenta como discrepancia en vez de rechazarse, simétrico con un faltante:
// si llegaron 13 unidades de un pedido de 12, negarse a registrar la 13
// dejaría el sistema permanentemente desalineado con el anaquel.
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
        // Todo cambio de stock en esta app pasa por applyMovement: es el
        // único que escribe inventory.stock y escribe la fila de kardex en
        // la misma transacción. MovementType.PURCHASE ya existe en el enum
        // del esquema y se reutiliza tal cual.
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

        // Decisión de criterio: Product.cost se actualiza al costo unitario
        // realmente pagado en esta entrega. Ignorar la compra real más
        // reciente corrompería silenciosamente los reportes de margen, así
        // que la última factura real es la mejor referencia disponible.
        // Solo las líneas que sí llegaron lo actualizan. Es costo último,
        // no promedio ponderado; el unitCost por línea queda en
        // PurchaseItem, así que migrar a promedio ponderado no requiere
        // cambio de esquema.
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

// Solo válido desde PENDING. A diferencia de cancelTransfer no hay nada que
// revertir: una compra PENDING nunca tocó el inventario, así que cancelar es
// un cambio de estado puro. Una vez recibida, el stock es real y está en el
// anaquel; deshacerlo es una devolución/ajuste, otra operación con sus
// propios requisitos de auditoría, no una cancelación.
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

// Filtrado por sucursal igual que transferService.listTransfers:
// `allBranches` ve todo, el resto solo sus sucursales asignadas, y un
// branchId explícito fuera de ese conjunto es 403 en vez de una lista vacía.
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

// ---------- Proveedores ----------
// Sin filtro de sucursal: los proveedores son catálogo maestro de toda la
// empresa, cada sucursal pide del mismo catálogo.

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
