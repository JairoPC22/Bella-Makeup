import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { verifySupervisorPin, PIN_GENERIC_ERROR } from "./pinAuthService";
import { formatTicketNumber, resolveUnitPrice } from "./saleService";
import { assertBranchAccess, getAccessibleBranchIds } from "./branchAccessService";
import { getSettings as getCompanySettings } from "./companySettingsService";
import * as returnRepo from "../repositories/returnRepository";

export interface ReturnedItemInput {
  saleItemId: string;
  quantity: number;
  // False significa que la mercancía volvió invendible (sello roto, empaque
  // dañado, producto usado). Al cliente se le sigue acreditando (es una
  // decisión comercial que el supervisor acaba de autorizar), pero NO
  // vuelve al anaquel, así que no se aplica movimiento de stock en esa línea.
  restock: boolean;
}

export interface NewItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface ProcessReturnInput {
  originalSaleId: string;
  returnedItems: ReturnedItemInput[];
  newItems?: NewItemInput[];
  // Solo se exige cuando CompanySettings.requirePinForReturns está activo.
  pinCode?: string;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  notes?: string;
}

// Mismo manejo de dinero que saleService: number plano de JS, redondeado a
// 2 decimales tras cada operación que pudiera introducir drift. Idéntico al
// round2 privado de saleService, duplicado aquí por la misma razón que
// assertBranchAccess (documentada en purchaseService.ts): no existe un
// módulo compartido de utilidades de dinero/scope.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// "D-" de Devolución, junto a "V-" (Venta) de saleService, "C-" (Compra) de
// purchaseService y "T-" (Transferencia) de transferService, con el mismo
// relleno de ceros a 6 dígitos.
export function formatReturnNumber(folio: number): string {
  return `D-${String(folio).padStart(6, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReturn(ret: any) {
  return {
    ...ret,
    returnNumber: formatReturnNumber(ret.folio),
    // El ticket que el cliente presentó físicamente en el mostrador,
    // formateado igual que lo imprimió el POS, para buscar por el número en
    // el papel sin que el cliente lo recalcule.
    originalTicketNumber: ret.originalSale ? formatTicketNumber(ret.originalSale.folio) : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    returnedItemCount: ret.items?.filter((i: any) => i.direction === "RETURNED").length ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newItemCount: ret.items?.filter((i: any) => i.direction === "NEW").length ?? 0,
  };
}

interface PlannedReturnedLine {
  saleItemId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  restock: boolean;
}

interface PlannedNewLine {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
}

interface ReturnPlan {
  branchId: string;
  returnedLines: PlannedReturnedLine[];
  newLines: PlannedNewLine[];
  returnedTotal: number;
  newItemsTotal: number;
  balance: number;
  resolution: "EXACT_EXCHANGE" | "CUSTOMER_OWES" | "REFUND_OWED";
}

// Toda validación y aritmética de una devolución, como lectura pura: no
// escribe nada, así que es seguro correrla ANTES de validar el PIN de
// supervisor (para rechazar una solicitud mal formada con un mensaje útil
// en vez de un 401 genérico) y se corre DE NUEVO dentro de la transacción
// de escritura, donde su respuesta es la autoritativa.
//
// Correrla dos veces es deliberado, no redundancia. El primer paso existe
// por calidad del mensaje de error; el paso dentro de la transacción es el
// que realmente garantiza corrección, porque entre ambos una devolución
// concurrente podría consumir lo que quedaba por devolver de una línea, o
// una venta concurrente la última unidad de un artículo de cambio.
async function buildReturnPlan(
  client: Prisma.TransactionClient,
  input: ProcessReturnInput,
  actorId: string
): Promise<ReturnPlan> {
  const sale = await client.sale.findUnique({
    where: { id: input.originalSaleId },
    include: { items: true },
  });
  if (!sale) throw new AppError(404, "Venta original no encontrada");
  if (sale.status !== "COMPLETED") {
    // Una venta cancelada ya restauró el 100% de su stock vía cancelSale y
    // ya fue reembolsada por completo. Devolver contra ella acreditaría al
    // cliente dos veces y duplicaría el reingreso al anaquel.
    throw new AppError(400, "La venta original está cancelada; no admite devoluciones");
  }

  await assertBranchAccess(client, actorId, sale.branchId);

  if (input.returnedItems.length === 0) {
    throw new AppError(400, "La devolución debe incluir al menos un artículo devuelto");
  }

  // Las líneas repetidas se rechazan en vez de sumarse, igual que la regla
  // "Hay líneas repetidas" de receivePurchase. Sumarlas sería adivinar la
  // intención, y peor: una solicitud con el mismo saleItemId dos veces, una
  // con restock:true y otra con restock:false, no tendría sentido coherente.
  const seen = new Set<string>();
  for (const line of input.returnedItems) {
    if (seen.has(line.saleItemId)) throw new AppError(400, "Hay líneas repetidas en la devolución");
    seen.add(line.saleItemId);
  }

  const saleItemIds = input.returnedItems.map((l) => l.saleItemId);
  // LA validación acumulada. Suma toda cantidad previamente devuelta de
  // cada una de estas líneas, en todos los Return anteriores. Se lee con el
  // mismo client que las escrituras, así que dentro de la transacción no
  // puede quedar desactualizada.
  const alreadyReturned = await returnRepo.sumReturnedQuantitiesBySaleItem(saleItemIds, client);

  let returnedTotal = 0;
  const returnedLines: PlannedReturnedLine[] = [];

  for (const line of input.returnedItems) {
    const saleItem = sale.items.find((i) => i.id === line.saleItemId);
    // Validado contra los items de ESTA venta, así que no se puede devolver
    // una línea de otro ticket adivinando su id.
    if (!saleItem) throw new AppError(400, `La línea ${line.saleItemId} no pertenece a esta venta`);
    if (line.quantity <= 0) throw new AppError(400, "La cantidad devuelta debe ser mayor a cero");

    const priorlyReturned = alreadyReturned.get(line.saleItemId) ?? 0;
    const remaining = saleItem.quantity - priorlyReturned;
    if (line.quantity > remaining) {
      // Un solo mensaje cubre tanto la sobre-devolución de una vez como el
      // caso acumulado, y nombra la cifra real restante para que el cajero
      // vea POR QUÉ (ej. "compró 3, ya devolvió 2, quedan 1").
      throw new AppError(
        400,
        `No se puede devolver ${line.quantity} de esta línea: se compraron ${saleItem.quantity}` +
          `, ya se devolvieron ${priorlyReturned} y quedan ${remaining} por devolver`
      );
    }

    // Se acredita lo que el cliente REALMENTE pagó por unidad en el ticket
    // original (SaleItem.unitPrice), nunca el precio de lista de hoy. Si esa
    // línea tenía descuento, el crédito lo refleja.
    const unitPrice = saleItem.unitPrice.toNumber();
    returnedTotal = round2(returnedTotal + round2(unitPrice * line.quantity));

    returnedLines.push({
      saleItemId: saleItem.id,
      productId: saleItem.productId,
      variantId: saleItem.variantId,
      quantity: line.quantity,
      unitPrice,
      restock: line.restock,
    });
  }

  let newItemsTotal = 0;
  const newLines: PlannedNewLine[] = [];

  for (const item of input.newItems ?? []) {
    if (item.quantity <= 0) throw new AppError(400, "La cantidad del artículo nuevo debe ser mayor a cero");

    const product = await client.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new AppError(404, `Producto no encontrado: ${item.productId}`);
    if (product.status === "INACTIVE") throw new AppError(400, `El producto "${product.name}" está inactivo`);

    let variant: { id: string; productId: string; name: string; price: Prisma.Decimal | null; status: string } | null = null;
    if (item.variantId) {
      variant = await client.productVariant.findUnique({ where: { id: item.variantId } });
      if (!variant) throw new AppError(404, `Variante no encontrada: ${item.variantId}`);
      if (variant.productId !== product.id) throw new AppError(400, "La variante no pertenece al producto indicado");
      if (variant.status === "INACTIVE") throw new AppError(400, `La variante "${variant.name}" está inactiva`);
    }

    // Precio ACTUAL, vía el resolveUnitPrice del propio POS. Un artículo
    // nuevo es una venta nueva: no hereda el descuento del ticket original
    // ni una promo que ya terminó.
    const unitPrice = resolveUnitPrice(product, variant);
    newItemsTotal = round2(newItemsTotal + round2(unitPrice * item.quantity));

    // Chequeo explícito de disponibilidad para que un cambio por algo que la
    // sucursal no tiene falle con un mensaje que nombra el producto y las
    // cifras reales, en vez del genérico "dejaría el inventario en negativo"
    // de applyMovement. applyMovement sigue siendo la validación autoritativa
    // dentro de la transacción; esto es un mejor error, no un reemplazo.
    const inventoryRow = await client.inventory.findFirst({
      where: { productId: item.productId, variantId: item.variantId ?? null, branchId: sale.branchId },
    });
    const available = inventoryRow?.stock ?? 0;
    if (available < item.quantity) {
      throw new AppError(
        400,
        `Stock insuficiente para el cambio: "${product.name}"${variant ? ` (${variant.name})` : ""}` +
          ` tiene ${available} disponible(s) y se solicitan ${item.quantity}`
      );
    }

    newLines.push({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, unitPrice });
  }

  const balance = round2(newItemsTotal - returnedTotal);
  const resolution = balance > 0 ? "CUSTOMER_OWES" : balance < 0 ? "REFUND_OWED" : "EXACT_EXCHANGE";

  // Solo se exige para CUSTOMER_OWES, el único caso donde dinero se mueve
  // hacia el negocio en este mostrador. Decisión de criterio: aceptar un
  // saldo positivo sin método de pago registrado dejaría una cuenta por
  // cobrar que nadie puede conciliar contra la caja. En las otras dos
  // resoluciones, cualquier paymentMethod enviado se descarta en vez de
  // guardarse, para que un campo obsoleto en el formulario del POS nunca
  // haga parecer que un reembolso se cobró en efectivo.
  if (resolution === "CUSTOMER_OWES" && !input.paymentMethod) {
    throw new AppError(400, "Se requiere un método de pago para cobrar la diferencia");
  }

  return { branchId: sale.branchId, returnedLines, newLines, returnedTotal, newItemsTotal, balance, resolution };
}

// Una sola transacción de mostrador: entra mercancía, opcionalmente sale
// otra, y se salda la diferencia. Estructuralmente es el ciclo de reingreso
// de cancelSale más los movimientos de salida de una venta nueva,
// conciliados en un solo saldo, todo dentro de UNA prisma.$transaction para
// que un fallo en la última línea revierta todo lo anterior.
export async function processReturn(input: ProcessReturnInput, actorId: string) {
  // --- Fase 1: validación de solo lectura. No escribe nada. --------------
  // Corre antes de validar el PIN justamente para que un error honesto
  // (ticket equivocado, devolver más de lo comprado) reporte la razón real
  // en vez de un 401 genérico. Al ser de solo lectura, hacerlo primero no
  // puede generar el efecto secundario que el camino de PIN incorrecto debe
  // evitar.
  await buildReturnPlan(prisma, input, actorId);

  // --- Fase 2: autorización del supervisor. ------------------------------
  // Antes de abrir la transacción de escritura. El permiso validado es el
  // del SUPERVISOR ("returns.authorize"), no el del cajero (su propio gate
  // es `returns.create` en la ruta). Si falla, lanza antes de que exista un
  // solo movimiento de stock o fila Return.
  //
  // El mensaje genérico se reutiliza tal cual de la primitiva para que estos
  // endpoints no filtren más de lo que ya filtra POST /api/auth/verify-pin:
  // dígitos incorrectos, un PIN sin returns.authorize, un supervisor de otra
  // sucursal y un PIN mal formado dan todos el mismo 401 indistinguible.
  //
  // Configurable por CompanySettings.requirePinForReturns: si el negocio
  // decide que no exige un segundo PIN aquí, la devolución se autoatribuye
  // (authorizedByUserId = actorId) en vez de exigir un supervisor presente.
  const settings = await getCompanySettings();
  let authorizedByUserId = actorId;
  if (settings.requirePinForReturns) {
    const auth = await verifySupervisorPin(actorId, input.pinCode ?? "", "returns.authorize");
    if (!auth.ok) throw new AppError(401, PIN_GENERIC_ERROR);
    authorizedByUserId = auth.supervisorId;
  }

  // --- Fase 3: la escritura atómica. --------------------------------------
  const created = await prisma.$transaction(async (tx) => {
    // Revalidado dentro de la transacción: este paso es el autoritativo.
    // Entre la fase 1 y aquí, una devolución concurrente pudo consumir lo
    // que quedaba de una línea, o una venta concurrente la última unidad de
    // un artículo de cambio.
    const plan = await buildReturnPlan(tx, input, actorId);

    const ret = await returnRepo.createReturn(
      {
        originalSaleId: input.originalSaleId,
        branchId: plan.branchId,
        processedByUserId: actorId,
        authorizedByUserId,
        returnedTotal: plan.returnedTotal,
        newItemsTotal: plan.newItemsTotal,
        balance: plan.balance,
        resolution: plan.resolution,
        // Se guarda solo donde tiene sentido. Ver buildReturnPlan.
        paymentMethod: plan.resolution === "CUSTOMER_OWES" ? input.paymentMethod : null,
        notes: input.notes,
      },
      tx
    );

    for (const line of plan.returnedLines) {
      await returnRepo.createReturnItem(
        {
          returnId: ret.id,
          direction: "RETURNED",
          saleItemId: line.saleItemId,
          productId: line.productId,
          variantId: line.variantId ?? undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          restocked: line.restock,
        },
        tx
      );

      // Una línea sin reingreso escribe su fila ReturnItem arriba y luego a
      // propósito NO mueve stock: la mercancía existe físicamente pero no
      // como inventario vendible. Esa fila es lo que mantiene la pérdida
      // auditable (y es justo lo que leería un reporte de "devoluciones
      // dañadas" a futuro).
      if (line.restock) {
        await applyMovement(
          {
            productId: line.productId,
            variantId: line.variantId ?? undefined,
            branchId: plan.branchId,
            type: "RETURN",
            quantity: line.quantity,
            reference: ret.id,
            userId: actorId,
          },
          tx
        );
      }
    }

    for (const line of plan.newLines) {
      await returnRepo.createReturnItem(
        {
          returnId: ret.id,
          direction: "NEW",
          // Sin línea de venta de origen: esta mercancía está saliendo ahora.
          saleItemId: null,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          // Nunca aplica a una línea de salida.
          restocked: false,
        },
        tx
      );

      // MovementType.SALE, porque eso es exactamente lo que es: mercancía
      // saliendo de la sucursal con un cliente. Reutilizar SALE (en vez de
      // un tipo EXCHANGE_OUT) mantiene correcto cualquier reporte de
      // "unidades vendidas" sin enseñarle un tipo nuevo, siguiendo el
      // precedente que cancelSale ya estableció al reutilizar SALE para su
      // propia reversión.
      await applyMovement(
        {
          productId: line.productId,
          variantId: line.variantId,
          branchId: plan.branchId,
          type: "SALE",
          quantity: -line.quantity,
          reference: ret.id,
          userId: actorId,
        },
        tx
      );
    }

    return (await returnRepo.findReturnById(ret.id, tx))!;
  });

  await logAudit({
    userId: actorId,
    action: "returns.create",
    module: "returns",
    entityType: "return",
    entityId: created.id,
    branchId: created.branchId,
    // Registra AMBAS partes, para que esta bitácora se pueda cruzar con la
    // entrada `auth.verify_pin` que pinAuthService escribió en ese momento.
    details: {
      folio: created.folio,
      originalSaleId: created.originalSaleId,
      authorizedByUserId: created.authorizedByUserId,
      returnedTotal: created.returnedTotal.toNumber(),
      newItemsTotal: created.newItemsTotal.toNumber(),
      balance: created.balance.toNumber(),
      resolution: created.resolution,
    },
  });

  return mapReturn(created);
}

export interface ListReturnsFilters {
  branchId?: string;
  from?: Date;
  to?: Date;
}

// Filtrado por sucursal igual que listSales/listPurchases: `allBranches` ve
// todo, el resto solo sus sucursales asignadas, y un branchId explícito
// fuera de ese conjunto es 403 en vez de una lista vacía.
export async function listReturns(actorId: string, filters: ListReturnsFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const returns = await returnRepo.listReturns({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    from: filters.from,
    to: filters.to,
  });

  return returns.map((r) => mapReturn(r));
}

export async function getReturn(id: string, actorId: string) {
  const ret = await returnRepo.findReturnById(id);
  if (!ret) throw new AppError(404, "Devolución no encontrada");

  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && !accessible.includes(ret.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  return mapReturn(ret);
}
