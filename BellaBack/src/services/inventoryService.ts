import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { createMovement } from "../repositories/inventoryMovementRepository";
import * as inventoryRepo from "../repositories/inventoryRepository";
import { getAccessibleBranchIds } from "./branchAccessService";

export interface ApplyMovementInput {
  productId: string;
  variantId?: string;
  branchId: string;
  type: "ADJUSTMENT" | "PURCHASE" | "SALE" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN" | "ORDER";
  quantity: number; // con signo: positivo = entrada de stock, negativo = salida de stock
  reference?: string;
  userId?: string;
}

// Deriva de forma determinista una clave entera de 64 bits (con signo) para
// pg_advisory_xact_lock(bigint) a partir de la tupla exacta (productId,
// variantId, branchId). Al usar un hash en vez de concatenar/parsear, la
// clave depende de la tupla completa —incluyendo si variantId está
// presente—, así que una fila sin variante y la de una variante específica
// nunca colisionan, y la probabilidad de colisión entre productos/sucursales
// distintos es prácticamente nula (SHA-256 truncado a 8 bytes).
export function inventoryLockKey(productId: string, variantId: string | undefined, branchId: string): bigint {
  const raw = `${productId}:${variantId ?? "null"}:${branchId}`;
  const hash = createHash("sha256").update(raw).digest();
  return hash.readBigInt64BE(0);
}

// Única fuente de verdad para modificar `inventory.stock`. Ningún otro
// código debe escribir esa columna directamente: cada módulo (ventas,
// compras, transferencias, conteos físicos) debe llamar a esta función en
// vez de tocar `prisma.inventory` directamente.
//
// Lee el stock actual de (productId, variantId, branchId), calcula el nuevo
// stock, rechaza el cambio con AppError(400) si quedaría negativo y, solo si
// se acepta, escribe atómicamente el nuevo stock junto con su
// movimiento/kardex.
//
// Concurrencia: bajo el aislamiento READ COMMITTED de Postgres, un simple
// `prisma.$transaction` alrededor de un lectura-luego-escritura no basta —
// dos transacciones concurrentes pueden leer antes de que cualquiera
// confirme su escritura, calculando ambas el stock desde el mismo
// `stockBefore` obsoleto. Por eso se toma un advisory lock de Postgres
// (`pg_advisory_xact_lock`) antes de leer, en vez de un `SELECT ... FOR
// UPDATE` sobre el Product padre.
//
// Se eligió bloquear por la tupla exacta (productId, variantId, branchId) en
// vez de la fila de Inventory (puede no existir aún en el primer movimiento)
// o del Product padre (serializaría TODOS los movimientos de un producto
// aunque toquen sucursales o variantes completamente distintas, un cuello de
// botella innecesario). El advisory lock no requiere una fila existente y se
// libera automáticamente al terminar/revertir la transacción, sin riesgo de
// quedar retenido tras un AppError. El caso de variantId nulo también queda
// cubierto: inventoryLockKey incluye su presencia/ausencia en el hash, así
// que las filas sin variante para el mismo (productId, branchId) siguen
// serializándose por la misma clave, sin depender de la semántica ON
// CONFLICT de `inventory.upsert` (que no dispara con NULL).
//
// `tx` es un cliente de transacción de Prisma opcional, propiedad de quien
// llama. Si se provee (p.ej. un checkout que combina varias llamadas a
// applyMovement junto con la creación de Sale/SaleItem en UNA sola
// transacción — ver saleService), esta función participa en esa transacción
// externa en vez de abrir la suya, así que una falla a la mitad revierte
// todo lo que el llamador haya hecho hasta ese punto. Si se omite, se abre
// un `prisma.$transaction` propio exactamente como antes.
export async function applyMovement(input: ApplyMovementInput, tx?: Prisma.TransactionClient) {
  const run = async (client: Prisma.TransactionClient) => {
    const lockKey = inventoryLockKey(input.productId, input.variantId, input.branchId);
    // $executeRaw (no $queryRaw): pg_advisory_xact_lock devuelve `void`, que
    // el deserializador de Prisma no puede mapear vía $queryRaw ("Failed to
    // deserialize column of type 'void'"). $executeRaw solo ejecuta la
    // sentencia y devuelve el conteo de filas afectadas, que es lo único
    // que importa aquí: el lock se adquiere como efecto secundario.
    await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

    const whereRow = input.variantId
      ? { productId: input.productId, variantId: input.variantId, branchId: input.branchId }
      : { productId: input.productId, variantId: null, branchId: input.branchId };

    const existing = await client.inventory.findFirst({ where: whereRow });
    const stockBefore = existing?.stock ?? 0;
    const stockAfter = stockBefore + input.quantity;

    if (stockAfter < 0) {
      throw new AppError(400, "La operación dejaría el inventario en negativo");
    }

    if (existing) {
      await client.inventory.update({ where: { id: existing.id }, data: { stock: stockAfter } });
    } else {
      await client.inventory.create({
        data: { productId: input.productId, variantId: input.variantId, branchId: input.branchId, stock: stockAfter },
      });
    }

    return createMovement(
      {
        productId: input.productId,
        variantId: input.variantId,
        branchId: input.branchId,
        type: input.type,
        quantity: input.quantity,
        stockBefore,
        stockAfter,
        reference: input.reference,
        userId: input.userId,
      },
      client
    );
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}

export function computeStatus(stock: number, minStock: number): "AVAILABLE" | "LOW" | "CRITICAL" | "OUT" {
  if (stock <= 0) return "OUT";
  if (stock <= Math.floor(minStock / 2)) return "CRITICAL";
  if (stock <= minStock) return "LOW";
  return "AVAILABLE";
}

export { findInventoryRow } from "../repositories/inventoryRepository";
export { listMovements } from "../repositories/inventoryMovementRepository";

// GET /api/inventory solo estaba protegido por
// `requirePermission("inventory.view")`, sin ninguna validación de
// sucursal: un usuario de una sola sucursal podía pasar un `branchId` fuera
// de su alcance (u omitirlo) y leer el stock de todas las sucursales, el
// único endpoint de listado que no se restringía ya a las sucursales
// accesibles como sí hacen listSales/listOrders/listTransfers/etc.
export async function listInventory(actorId: string, filters: { branchId?: string; categoryId?: string }) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }
  return inventoryRepo.listInventory({
    branchId: filters.branchId,
    categoryId: filters.categoryId,
    branchIds: accessible === "ALL" ? undefined : accessible,
  });
}
