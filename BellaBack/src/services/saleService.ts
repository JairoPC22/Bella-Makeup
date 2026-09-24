import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { assertBranchAccess, getAccessibleBranchIds } from "./branchAccessService";
import { hasPermissionByRole } from "./permissionCheckService";
import { verifySupervisorPin, PIN_GENERIC_ERROR } from "./pinAuthService";
import { getSettings as getCompanySettings } from "./companySettingsService";
import * as saleRepo from "../repositories/saleRepository";

export interface SaleItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  discount?: number;
}

export interface SalePaymentInput {
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  amount: number;
  reference?: string;
}

export interface CreateSaleInput {
  branchId: string;
  customerId?: string;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  // PIN de supervisor, igual que en devoluciones/mermas: solo se exige (y
  // solo se verifica) cuando algún descuento excede el umbral que el cajero
  // puede autorizar con su propio rol.
  pinCode?: string;
}

// El dinero se maneja como number plano de JS en todo este servicio (no
// instancias Prisma.Decimal/decimal.js) por legibilidad de la aritmética,
// redondeado a 2 decimales tras cada operación que pudiera introducir
// drift de punto flotante. Prisma acepta un number plano al escribir una
// columna Decimal, así que no hace falta reconvertir.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Un descuento solo puede reducir el precio: un promoPrice que resulte
// *mayor* al precio normal (por ejemplo, dejado obsoleto tras terminar una
// promo) nunca debe usarse para cobrar de más. El `price` propio de una
// variante (cuando existe) sobreescribe por completo la lógica de
// precio/promo del producto; las variantes no tienen su propio campo promo.
//
// Exportada (antes era privada) para que returnService y mermaService
// calculen el precio con esta misma función en vez de una copia. Ambas
// necesitan exactamente esta regla, y una copia duplicada se desalinearía
// en cuanto cambiara la regla de promoción.
export function resolveUnitPrice(
  product: { price: Prisma.Decimal; promoPrice: Prisma.Decimal | null },
  variant: { price: Prisma.Decimal | null } | null
): number {
  if (variant && variant.price != null) return variant.price.toNumber();
  const price = product.price.toNumber();
  const promo = product.promoPrice != null ? product.promoPrice.toNumber() : null;
  if (promo != null && promo < price) return promo;
  return price;
}

export function formatTicketNumber(folio: number): string {
  return `V-${String(folio).padStart(6, "0")}`;
}

function customerDisplayName(customer: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!customer) return "Cliente general";
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return name || "Cliente general";
}

// Da forma a cada venta (create/list/detail/cancel) igual, así el ticket y
// la lista de ventas obtienen `ticketNumber` y `customerName` gratis sin
// recalcularlos en el cliente. `changeDue` solo tiene sentido justo después
// del checkout (el cambio de los pagos recién enviados), se omite en
// list/detail y se incluye solo cuando createSale lo pasa explícitamente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSale(sale: any, changeDue?: number) {
  const mapped: Record<string, unknown> = {
    ...sale,
    ticketNumber: formatTicketNumber(sale.folio),
    customerName: customerDisplayName(sale.customer),
    itemCount: sale.items?.length ?? 0,
  };
  if (changeDue !== undefined) mapped.changeDue = changeDue;
  return mapped;
}

// Checkout: crea una Sale y sus filas SaleItem/SalePayment, y descuenta
// stock de cada línea, todo como UNA prisma.$transaction atómica. Si algún
// item falla al calcular precio (404/400) o sobrevende (AppError(400) de
// applyMovement), toda la transacción se revierte: ninguna venta parcial,
// ningún descuento parcial de los items que sí eran válidos. Cada llamada a
// applyMovement de abajo pasa la `tx` externa para participar en esta misma
// transacción en vez de abrir una propia.
export async function createSale(input: CreateSaleInput, actorId: string) {
  const companySettings = await getCompanySettings();
  const { sale, changeDue, discountSupervisorId } = await prisma.$transaction(async (tx) => {
    await assertBranchAccess(tx, actorId, input.branchId);

    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const canAuthorizeDiscount = await hasPermissionByRole(tx, actor.roleId, "discounts.authorize");

    // El PIN de supervisor se verifica como máximo una vez por venta (no una
    // vez por línea): la primera línea que exceda su propio umbral dispara
    // la verificación, y el resultado se reutiliza para el resto de líneas.
    let pinChecked = false;
    let discountSupervisorId: string | null = null;
    async function isDiscountAuthorized(): Promise<boolean> {
      if (canAuthorizeDiscount) return true;
      if (pinChecked) return discountSupervisorId !== null;
      pinChecked = true;
      if (!input.pinCode) return false;
      const auth = await verifySupervisorPin(actorId, input.pinCode, "discounts.authorize");
      if (!auth.ok) throw new AppError(401, PIN_GENERIC_ERROR);
      discountSupervisorId = auth.supervisorId;
      return true;
    }

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    const itemsToCreate: Array<{
      productId: string;
      variantId?: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      lineTotal: number;
    }> = [];

    for (const item of input.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new AppError(404, `Producto no encontrado: ${item.productId}`);
      if (product.status === "INACTIVE") throw new AppError(400, `El producto "${product.name}" está inactivo`);

      let variant: { id: string; productId: string; name: string; price: Prisma.Decimal | null; status: string } | null = null;
      if (item.variantId) {
        variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant) throw new AppError(404, `Variante no encontrada: ${item.variantId}`);
        if (variant.productId !== product.id) throw new AppError(400, "La variante no pertenece al producto indicado");
        if (variant.status === "INACTIVE") throw new AppError(400, `La variante "${variant.name}" está inactiva`);
      }

      const unitPrice = resolveUnitPrice(product, variant);
      const lineSubtotal = round2(unitPrice * item.quantity);
      const discount = item.discount ?? 0;

      // Valor por defecto provisional: un descuento de hasta 15% del
      // subtotal de la línea solo requiere `discounts.apply` (ya validado
      // en la ruta). Más que eso requiere `discounts.authorize`. El umbral en
      // sí sigue fijo en 15% (aún no configurable), pero CompanySettings.
      // requirePinForDiscounts sí decide si ese tope se exige del todo: si
      // el negocio lo apaga, cualquier descuento pasa sin pedir PIN.
      if (discount > 0 && companySettings.requirePinForDiscounts) {
        const threshold = round2(lineSubtotal * 0.15);
        if (discount > threshold && !(await isDiscountAuthorized())) {
          throw new AppError(403, "Este descuento requiere autorización");
        }
      }

      const lineTotal = round2(lineSubtotal - discount);
      const lineTax = round2(lineTotal * (product.taxRate.toNumber() / 100));

      subtotal = round2(subtotal + lineSubtotal);
      discountTotal = round2(discountTotal + discount);
      taxTotal = round2(taxTotal + lineTax);

      itemsToCreate.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        discount,
        lineTotal,
      });
    }

    const total = round2(subtotal - discountTotal + taxTotal);
    const paymentsTotal = round2(input.payments.reduce((sum, p) => sum + p.amount, 0));
    if (paymentsTotal < total) {
      throw new AppError(400, "El pago no cubre el total de la venta");
    }
    const changeDue = round2(paymentsTotal - total);

    // Auto-attach de caja. Una venta de POS registrada por un cajero que
    // tiene una CashSession OPEN en esta sucursal se asocia a esa sesión,
    // así el cierre a ciegas puede sumar después "lo vendido en este turno"
    // sin que el POS tenga que pasar un session id por el checkout. La
    // búsqueda es determinista por construcción: openSession de
    // cashSessionService impide una segunda sesión OPEN para el mismo
    // usuario o sucursal, así que esto solo puede coincidir con una fila.
    //
    // Es una búsqueda nullable a propósito, no un requisito: si no hay
    // sesión abierta, cashSessionId queda null y la venta se comporta igual
    // que antes de que existiera este módulo. Eso mantiene intacto cualquier
    // camino que no sea POS/pedido en línea. Agrega un SELECT indexado a la
    // transacción sin cambiar su atomicidad: se lee dentro de la misma tx,
    // así que se revierte con todo lo demás y no puede asociar una venta a
    // una sesión que un cierre concurrente está retirando.
    const openCashSession = await tx.cashSession.findFirst({
      where: { branchId: input.branchId, userId: actorId, status: "OPEN" },
      select: { id: true },
    });

    const createdSale = await saleRepo.createSale(
      {
        branchId: input.branchId,
        userId: actorId,
        customerId: input.customerId,
        cashSessionId: openCashSession?.id,
        subtotal,
        discountTotal,
        taxTotal,
        total,
      },
      tx
    );

    for (const item of itemsToCreate) {
      await saleRepo.createSaleItem(
        {
          saleId: createdSale.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          lineTotal: item.lineTotal,
        },
        tx
      );

      // Pasar `tx` aquí es lo que hace atómico todo el checkout: si esto
      // lanza error (stock insuficiente), aborta la MISMA transacción que
      // creó las filas Sale/SaleItem de arriba, revirtiendo todo junto.
      await applyMovement(
        {
          productId: item.productId,
          variantId: item.variantId,
          branchId: input.branchId,
          type: "SALE",
          quantity: -item.quantity,
          reference: createdSale.id,
          userId: actorId,
        },
        tx
      );
    }

    for (const payment of input.payments) {
      await saleRepo.createSalePayment(
        { saleId: createdSale.id, method: payment.method, amount: payment.amount, reference: payment.reference },
        tx
      );
    }

    const full = await saleRepo.findSaleById(createdSale.id, tx);
    return { sale: full!, changeDue, discountSupervisorId };
  });

  await logAudit({
    userId: actorId,
    action: "sales.create",
    module: "sales",
    entityType: "sale",
    entityId: sale.id,
    branchId: sale.branchId,
    details: {
      folio: sale.folio,
      total: sale.total.toNumber(),
      itemCount: sale.items.length,
      ...(discountSupervisorId ? { discountAuthorizedBy: discountSupervisorId } : {}),
    },
  });

  return mapSale(sale, changeDue);
}

export interface ListSalesFilters {
  branchId?: string;
  status?: "COMPLETED" | "CANCELLED";
  from?: Date;
  to?: Date;
}

// Filtrado por sucursal igual que requireBranchScope: quien tiene
// `allBranches` ve todo (opcionalmente acotado por el query param
// `branchId`); el resto solo ve sus sucursales asignadas, y un `branchId`
// explícito fuera de ese conjunto se rechaza con 403 en vez de devolver
// silenciosamente cero filas.
export async function listSales(actorId: string, filters: ListSalesFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const sales = await saleRepo.listSales({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    status: filters.status,
    from: filters.from,
    to: filters.to,
  });

  return sales.map((s) => mapSale(s));
}

export async function getSale(id: string, actorId: string) {
  const sale = await saleRepo.findSaleById(id);
  if (!sale) throw new AppError(404, "Venta no encontrada");
  await assertBranchAccess(prisma, actorId, sale.branchId);
  return mapSale(sale);
}

// Anulación total (un "deshacer" de la misma sesión), no una devolución
// parcial/posterior: restaura por completo el stock de cada línea vía
// applyMovement y marca la venta CANCELLED. Las devoluciones parciales
// contra una venta ya completada son una función distinta, fuera del
// alcance aquí (gateada tras el permiso `sales.return`, ya sembrado).
//
// sales.cancel ya no se exige en la ruta (solo sales.view, el piso para
// intentarlo): quien no tiene sales.cancel puede seguir cancelando si
// CompanySettings.allowPinForSaleCancel está activo y trae el PIN de un
// supervisor que sí lo tiene. Con el interruptor apagado (su default), el
// comportamiento es idéntico al de antes de esta función existir: sin el
// permiso, no hay forma de cancelar.
export async function cancelSale(id: string, reason: string, actorId: string, pinCode?: string) {
  const settings = await getCompanySettings();
  const { updated, cancelSupervisorId } = await prisma.$transaction(async (tx) => {
    const sale = await saleRepo.findSaleById(id, tx);
    if (!sale) throw new AppError(404, "Venta no encontrada");
    if (sale.status === "CANCELLED") throw new AppError(400, "La venta ya está cancelada");

    await assertBranchAccess(tx, actorId, sale.branchId);

    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const canCancelDirectly = await hasPermissionByRole(tx, actor.roleId, "sales.cancel");
    let cancelSupervisorId: string | null = null;
    if (!canCancelDirectly) {
      if (!settings.allowPinForSaleCancel) throw new AppError(403, "No tienes permiso para cancelar ventas");
      const auth = await verifySupervisorPin(actorId, pinCode ?? "", "sales.cancel");
      if (!auth.ok) throw new AppError(401, PIN_GENERIC_ERROR);
      cancelSupervisorId = auth.supervisorId;
    }

    for (const item of sale.items) {
      await applyMovement(
        {
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          branchId: sale.branchId,
          type: "SALE",
          quantity: item.quantity,
          reference: `cancel:${sale.id}`,
          userId: actorId,
        },
        tx
      );
    }

    const updated = await saleRepo.cancelSale(id, { cancelledAt: new Date(), cancelledBy: actorId, cancelReason: reason }, tx);
    return { updated, cancelSupervisorId };
  });

  await logAudit({
    userId: actorId,
    action: "sales.cancel",
    module: "sales",
    entityType: "sale",
    entityId: updated.id,
    branchId: updated.branchId,
    details: {
      folio: updated.folio,
      reason,
      ...(cancelSupervisorId ? { cancelAuthorizedBy: cancelSupervisorId } : {}),
    },
  });

  return mapSale(updated);
}
