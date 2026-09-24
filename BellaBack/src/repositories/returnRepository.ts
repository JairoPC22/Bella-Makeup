import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Forma compartida para list/detail/create: sucursal, los dos usuarios
// involucrados reducidos a un subconjunto seguro, e items con
// nombre/sku de producto/variante para no requerir una segunda consulta.
//
// Los sub-selects de usuario son listas explícitas, no `true`: aquí importa
// más que en ningún otro módulo, porque `authorizedBy` siempre es un usuario
// con PIN de supervisor configurado, y seleccionar la relación completa
// expondría el hash de ese PIN en cada respuesta.
//
// `originalSale` usa un select angosto en vez del saleInclude completo: la
// pantalla de devoluciones solo necesita identificar el ticket de origen
// (folio/total/fecha), no volver a traer toda la venta original.
export const returnInclude = {
  originalSale: {
    select: { id: true, folio: true, total: true, createdAt: true, status: true, branchId: true },
  },
  branch: { select: { id: true, name: true } },
  processedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  authorizedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.ReturnInclude;

export function createReturn(data: Prisma.ReturnUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.return.create({ data, include: returnInclude });
}

export function createReturnItem(
  data: Prisma.ReturnItemUncheckedCreateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.returnItem.create({ data });
}

export function findReturnById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.return.findUnique({ where: { id }, include: returnInclude });
}

// Fuente de datos para la validación de sobre-devolución acumulada: suma,
// por SaleItem, todo lo devuelto en TODOS los Return anteriores (no solo el
// actual), para que "no puedes devolver más de lo comprado" se cumpla a
// través de una serie ilimitada de devoluciones parciales.
//
// direction: "RETURNED" es esencial: las líneas NUEVAS de un cambio previo
// son mercancía que salió y nunca deben contar como devolución de una línea
// original.
//
// Recibe `tx` (y cada llamador lo pasa) para leer dentro de la misma
// transacción que escribirá las nuevas filas; leer fuera de ella abriría una
// ventana donde dos devoluciones concurrentes verían la misma suma y ambas
// pasarían la validación.
export async function sumReturnedQuantitiesBySaleItem(
  saleItemIds: string[],
  tx: Prisma.TransactionClient = prisma
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (saleItemIds.length === 0) return totals;

  const rows = await tx.returnItem.groupBy({
    by: ["saleItemId"],
    where: { saleItemId: { in: saleItemIds }, direction: "RETURNED" },
    _sum: { quantity: true },
  });

  for (const row of rows) {
    if (row.saleItemId) totals.set(row.saleItemId, row._sum.quantity ?? 0);
  }
  return totals;
}

export interface ListReturnsFilters {
  branchIds?: string[];
  branchId?: string;
  from?: Date;
  to?: Date;
}

// Mismo filtro de sucursal que listPurchases: una devolución pertenece a
// una sola sucursal (la que recibió la mercancía), así que es visible para
// quien pueda ver esa sucursal.
export function listReturns(filters: ListReturnsFilters) {
  const branchClause = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  const where: Prisma.ReturnWhereInput = {
    ...branchClause,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };
  return prisma.return.findMany({ where, include: returnInclude, orderBy: { createdAt: "desc" } });
}
