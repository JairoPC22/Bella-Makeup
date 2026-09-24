import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { assertBranchAccess, getAccessibleBranchIds } from "./branchAccessService";
import * as countRepo from "../repositories/inventoryCountRepository";

export interface CreateInventoryCountInput {
  branchId: string;
  categoryId?: string;
  brandId?: string;
  productIds?: string[];
  notes?: string;
}

// "CF-" de Conteo Físico, mismo formato de 6 dígitos que otros folios (V-/C-/T-/D-/M-).
export function formatCountNumber(folio: number): string {
  return `CF-${String(folio).padStart(6, "0")}`;
}

// Mientras el conteo está OPEN, se oculta `systemStock`/`difference` (conteo
// "a ciegas"), igual que cashSessionService con systemCashTotal: si el
// empleado viera el número esperado, podría copiarlo en vez de contar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCount(count: any) {
  const blind = count.status === "OPEN";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (count.items ?? []).map((i: any) => {
    if (blind) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { systemStock, ...rest } = i;
      return { ...rest, difference: null };
    }
    return { ...i, difference: i.countedStock == null ? null : i.countedStock - i.systemStock };
  });
  return {
    ...count,
    items,
    countNumber: formatCountNumber(count.folio),
    itemCount: items.length,
    countedItemCount: items.filter((i: { countedStock: number | null }) => i.countedStock != null).length,
  };
}

export async function createInventoryCount(input: CreateInventoryCountInput, actorId: string) {
  const scopeCount = [input.categoryId, input.brandId, input.productIds?.length ? input.productIds : undefined].filter(Boolean).length;
  if (scopeCount !== 1) {
    throw new AppError(400, "Selecciona exactamente una forma de elegir productos: categoría, marca o selección manual");
  }

  await assertBranchAccess(prisma, actorId, input.branchId);
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new AppError(404, "Sucursal no encontrada");
  if (branch.status === "INACTIVE") throw new AppError(400, `La sucursal "${branch.name}" está inactiva`);

  const products = await countRepo.findProductsForScope({
    categoryId: input.categoryId,
    brandId: input.brandId,
    productIds: input.productIds,
  });
  if (products.length === 0) {
    throw new AppError(400, "No se encontraron productos para el criterio seleccionado");
  }

  const stockRows = await countRepo.findStockRows(input.branchId, products.map((p) => p.id));
  const stockByKey = new Map(stockRows.map((r) => [`${r.productId}:${r.variantId ?? ""}`, r.stock]));

  const lines: Prisma.InventoryCountItemUncheckedCreateInput[] = [];
  // countId de relleno, se completa apenas exista la fila de cabecera.
  for (const product of products) {
    if (product.variants.length === 0) {
      lines.push({
        countId: "",
        productId: product.id,
        systemStock: stockByKey.get(`${product.id}:`) ?? 0,
      });
    } else {
      for (const variant of product.variants) {
        lines.push({
          countId: "",
          productId: product.id,
          variantId: variant.id,
          systemStock: stockByKey.get(`${product.id}:${variant.id}`) ?? 0,
        });
      }
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const count = await countRepo.createInventoryCount(
      {
        branchId: input.branchId,
        categoryId: input.categoryId,
        brandId: input.brandId,
        notes: input.notes,
        startedByUserId: actorId,
      },
      tx
    );
    await countRepo.createInventoryCountItems(
      lines.map((l) => ({ ...l, countId: count.id })),
      tx
    );
    return (await countRepo.findInventoryCountById(count.id, tx))!;
  });

  await logAudit({
    userId: actorId,
    action: "inventoryCounts.create",
    module: "inventoryCounts",
    entityType: "inventoryCount",
    entityId: created.id,
    branchId: created.branchId,
    details: { folio: created.folio, itemCount: created.items.length },
  });

  return mapCount(created);
}

export interface ListInventoryCountsFilters {
  branchId?: string;
  status?: "OPEN" | "COMPLETED" | "CANCELLED";
}

export async function listInventoryCounts(actorId: string, filters: ListInventoryCountsFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const counts = await countRepo.listInventoryCounts({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    status: filters.status,
  });
  return counts.map(mapCount);
}

export async function getInventoryCount(id: string, actorId: string) {
  const count = await countRepo.findInventoryCountById(id);
  if (!count) throw new AppError(404, "Conteo no encontrado");
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && !accessible.includes(count.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }
  return mapCount(count);
}

export interface CountedLineInput {
  itemId: string;
  countedStock: number;
}

// Guarda (o sobrescribe) el conteo físico de una o más líneas; es un guardado,
// no un commit, así que nunca toca `inventory.stock`.
export async function saveCountedItems(countId: string, items: CountedLineInput[], actorId: string) {
  const count = await countRepo.findInventoryCountById(countId);
  if (!count) throw new AppError(404, "Conteo no encontrado");
  await assertBranchAccess(prisma, actorId, count.branchId);
  if (count.status !== "OPEN") throw new AppError(400, "Este conteo ya fue cerrado o cancelado");

  const validIds = new Set(count.items.map((i) => i.id));
  for (const line of items) {
    if (!validIds.has(line.itemId)) throw new AppError(404, `Línea de conteo no encontrada: ${line.itemId}`);
  }

  await prisma.$transaction(
    items.map((line) =>
      countRepo.updateCountItem(line.itemId, { countedStock: line.countedStock, countedAt: new Date() })
    )
  );

  return getInventoryCount(countId, actorId);
}

// Finaliza el conteo: todas las líneas deben estar contadas (una línea sin
// contar ocultaría una diferencia real), y genera un movimiento ADJUSTMENT
// por cada línea cuyo valor contado difiera del sistema.
export async function completeInventoryCount(id: string, actorId: string) {
  const existing = await countRepo.findInventoryCountById(id);
  if (!existing) throw new AppError(404, "Conteo no encontrado");
  await assertBranchAccess(prisma, actorId, existing.branchId);
  if (existing.status !== "OPEN") throw new AppError(400, "Este conteo ya fue cerrado o cancelado");

  const uncounted = existing.items.filter((i) => i.countedStock == null);
  if (uncounted.length > 0) {
    throw new AppError(400, `Faltan ${uncounted.length} producto(s) por contar antes de cerrar este conteo`);
  }

  let adjustedLines = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of existing.items) {
      // Se compara contra el stock LIVE (no el snapshot inicial), porque
      // pudo haber ventas/traspasos/compras mientras el conteo estaba abierto.
      const whereRow = item.variantId
        ? { productId: item.productId, variantId: item.variantId, branchId: existing.branchId }
        : { productId: item.productId, variantId: null, branchId: existing.branchId };
      const liveRow = await tx.inventory.findFirst({ where: whereRow });
      const liveStock = liveRow?.stock ?? 0;
      const diff = item.countedStock! - liveStock;
      if (diff !== 0) {
        adjustedLines += 1;
        await applyMovement(
          {
            productId: item.productId,
            variantId: item.variantId ?? undefined,
            branchId: existing.branchId,
            type: "ADJUSTMENT",
            quantity: diff,
            reference: existing.id,
            userId: actorId,
          },
          tx
        );
      }
      // Se sobrescribe systemStock con el valor recién leído: mapCount
      // calcula la diferencia mostrada como countedStock - systemStock, y
      // si se dejara el snapshot original (tomado al abrir el conteo)
      // mostraría un desfase que no coincide con el ajuste real que
      // acaba de aplicarse arriba.
      await countRepo.updateCountItem(item.id, { systemStock: liveStock }, tx);
    }
    await countRepo.updateInventoryCountStatus(id, { status: "COMPLETED", completedByUserId: actorId, completedAt: new Date() }, tx);
  });

  const result = await getInventoryCount(id, actorId);

  await logAudit({
    userId: actorId,
    action: "inventoryCounts.complete",
    module: "inventoryCounts",
    entityType: "inventoryCount",
    entityId: id,
    branchId: existing.branchId,
    details: { folio: existing.folio, adjustedLines },
  });

  return result;
}

export async function cancelInventoryCount(id: string, actorId: string) {
  const existing = await countRepo.findInventoryCountById(id);
  if (!existing) throw new AppError(404, "Conteo no encontrado");
  await assertBranchAccess(prisma, actorId, existing.branchId);
  if (existing.status !== "OPEN") throw new AppError(400, "Este conteo ya fue cerrado o cancelado");

  await countRepo.updateInventoryCountStatus(id, { status: "CANCELLED" });

  await logAudit({
    userId: actorId,
    action: "inventoryCounts.cancel",
    module: "inventoryCounts",
    entityType: "inventoryCount",
    entityId: id,
    branchId: existing.branchId,
  });

  return getInventoryCount(id, actorId);
}
