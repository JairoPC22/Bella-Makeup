import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { formatTicketNumber } from "./saleService";
import { assertBranchAccess, getAccessibleBranchIds } from "./branchAccessService";
import * as orderRepo from "../repositories/orderRepository";
import * as saleRepo from "../repositories/saleRepository";

export interface OnlineOrderItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export type OnlineOrderFulfillmentInput =
  | { type: "PICKUP"; branchId: string }
  | { type: "DELIVERY"; branchId: string; address: string; lat?: number; lng?: number };

export interface CreateOnlineOrderInput {
  customer: { firstName: string; lastName?: string; phone: string; email?: string };
  fulfillment: OnlineOrderFulfillmentInput;
  paymentMethod: "CASH" | "CARD" | "TRANSFER";
  items: OnlineOrderItemInput[];
  notes?: string;
}

type OrderStatusValue = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

// Misma convención de redondeo que round2 en saleService.ts: el dinero se
// maneja como number plano de JS, redondeado a 2 decimales tras cada
// operación que pudiera introducir drift de punto flotante.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Copiado de resolveUnitPrice en saleService.ts (no se exporta desde ahí, así
// que se replica la lógica en vez de importarla): gana el precio de la
// variante si existe; si no, gana promoPrice solo si es menor al precio
// normal (un promoPrice desactualizado mayor al precio nunca debe cobrar de más).
function resolveUnitPrice(
  product: { price: Prisma.Decimal; promoPrice: Prisma.Decimal | null },
  variant: { price: Prisma.Decimal | null } | null
): number {
  if (variant && variant.price != null) return variant.price.toNumber();
  const price = product.price.toNumber();
  const promo = product.promoPrice != null ? product.promoPrice.toNumber() : null;
  if (promo != null && promo < price) return promo;
  return price;
}

export function formatOrderNumber(folio: number): string {
  return `P-${String(folio).padStart(6, "0")}`;
}


// Busca o crea por teléfono, siguiendo la misma convención de enriquecimiento
// de bajo riesgo usada en otras partes del código (los campos vacíos de un
// registro creado rápido se completan en un match posterior, pero un campo
// ya lleno nunca se sobrescribe). El teléfono no es una restricción única en
// la BD (solo tiene índice, no @unique), así que se elige el match más
// antiguo de forma determinista para no duplicar Customer en pedidos repetidos.
async function findOrCreateCustomer(
  tx: Prisma.TransactionClient,
  input: { firstName: string; lastName?: string; phone: string; email?: string }
) {
  const existing = await tx.customer.findFirst({ where: { phone: input.phone }, orderBy: { createdAt: "asc" } });
  if (existing) {
    const patch: Prisma.CustomerUncheckedUpdateInput = {};
    if (!existing.firstName && input.firstName) patch.firstName = input.firstName;
    if (!existing.lastName && input.lastName) patch.lastName = input.lastName;
    if (!existing.email && input.email) patch.email = input.email;
    if (Object.keys(patch).length === 0) return existing;
    return tx.customer.update({ where: { id: existing.id }, data: patch });
  }
  return tx.customer.create({
    data: { firstName: input.firstName, lastName: input.lastName, phone: input.phone, email: input.email },
  });
}

function customerFullName(customer: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!customer) return "Cliente";
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return name || "Cliente";
}

// Da forma a cada pedido (create/list/detail/status-update) exactamente
// como el tipo `OnlineOrder` de BellaFront/src/types/api.ts — nombres de
// campo verificados contra ese archivo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrder(order: any) {
  return {
    id: order.id,
    orderNumber: formatOrderNumber(order.folio),
    status: order.status,
    customerName: customerFullName(order.customer),
    customerPhone: order.customer?.phone ?? "",
    customerEmail: order.customer?.email ?? null,
    fulfillmentType: order.fulfillmentType,
    branch: { id: order.branch.id, name: order.branch.name, address: order.branch.address },
    deliveryAddress: order.deliveryAddress,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    taxTotal: order.taxTotal,
    total: order.total,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: order.items.map((item: any) => ({
      id: item.id,
      product: item.product,
      variant: item.variant ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    notes: order.notes,
    cancelReason: order.cancelReason ?? null,
    // También visible para el cliente, no solo para staff — "en cuánto
    // tiempo" es justo lo que alguien rastreando su pedido quiere ver.
    estimatedReadyAt: order.estimatedReadyAt ?? null,
    // También visible para el cliente: en un pedido PICKUP lo necesita para
    // mostrarlo al personal en persona. Es null hasta que el pedido llega a
    // READY, y siempre null en pedidos DELIVERY.
    pickupCode: order.pickupCode ?? null,
    confirmedAt: order.confirmedAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    completedAt: order.completedAt ?? null,
    createdAt: order.createdAt,
    // Presente solo una vez COMPLETED — el ticket de venta real en que se
    // convirtió este pedido. Ver updateOrderStatus.
    saleNumber: order.sale ? formatTicketNumber(order.sale.folio) : null,
  };
}

// Checkout público sin autenticación: valida que cada producto/variante
// exista y esté ACTIVE, resuelve unitPrice en el servidor (nunca confía en
// un precio del cliente), valida la cantidad pedida contra el stock real
// disponible en la sucursal elegida (igual que el chequeo de createTransfer
// en transferService.ts), busca o crea el Customer por teléfono, y — en una
// sola prisma.$transaction — crea Order + OrderItem y descuenta stock de
// cada línea vía applyMovement(tx), igual que createSale en saleService.ts.
export async function createOnlineOrder(input: CreateOnlineOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: input.fulfillment.branchId } });
    if (!branch) throw new AppError(404, "Sucursal no encontrada");
    if (branch.status === "INACTIVE") throw new AppError(400, `La sucursal "${branch.name}" está inactiva`);

    let subtotal = 0;
    let taxTotal = 0;
    const itemsToCreate: Array<{
      productId: string;
      variantId?: string;
      quantity: number;
      unitPrice: number;
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

      // Chequeo de stock disponible en la sucursal elegida — réplica exacta
      // del chequeo de createTransfer en transferService.ts.
      const whereRow = item.variantId
        ? { productId: item.productId, variantId: item.variantId, branchId: input.fulfillment.branchId }
        : { productId: item.productId, variantId: null, branchId: input.fulfillment.branchId };
      const inventoryRow = await tx.inventory.findFirst({ where: whereRow });
      const available = inventoryRow?.stock ?? 0;
      if (available < item.quantity) {
        throw new AppError(
          400,
          `Stock insuficiente para "${product.name}" en la sucursal seleccionada (disponible: ${available}, solicitado: ${item.quantity})`
        );
      }

      const unitPrice = resolveUnitPrice(product, variant);
      const lineTotal = round2(unitPrice * item.quantity);
      const lineTax = round2(lineTotal * (product.taxRate.toNumber() / 100));

      subtotal = round2(subtotal + lineTotal);
      taxTotal = round2(taxTotal + lineTax);

      itemsToCreate.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    const total = round2(subtotal + taxTotal);
    const customer = await findOrCreateCustomer(tx, input.customer);

    const created = await orderRepo.createOrder(
      {
        customerId: customer.id,
        status: "PENDING",
        fulfillmentType: input.fulfillment.type,
        branchId: input.fulfillment.branchId,
        deliveryAddress: input.fulfillment.type === "DELIVERY" ? input.fulfillment.address : undefined,
        deliveryLat: input.fulfillment.type === "DELIVERY" ? input.fulfillment.lat : undefined,
        deliveryLng: input.fulfillment.type === "DELIVERY" ? input.fulfillment.lng : undefined,
        paymentMethod: input.paymentMethod,
        subtotal,
        taxTotal,
        total,
        notes: input.notes,
      },
      tx
    );

    for (const item of itemsToCreate) {
      await orderRepo.createOrderItem(
        {
          orderId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        },
        tx
      );

      // Pasar `tx` (misma composición que saleService/transferService) es
      // lo que hace atómico todo el checkout: si esto lanza error (stock
      // insuficiente, una carrera contra el chequeo de arriba si otro
      // pedido consumió el stock mientras tanto), aborta la MISMA
      // transacción que creó Order/OrderItem, revirtiendo todo junto.
      //
      // `userId` se omite a propósito: no hay un actor autenticado en un
      // pedido público del storefront. InventoryMovement.userId ya es
      // opcional en el esquema, así que no requiere cambios adicionales.
      await applyMovement(
        {
          productId: item.productId,
          variantId: item.variantId,
          branchId: input.fulfillment.branchId,
          type: "ORDER",
          quantity: -item.quantity,
          reference: created.id,
        },
        tx
      );
    }

    const full = await orderRepo.findOrderById(created.id, tx);
    return full!;
  });

  await logAudit({
    userId: null,
    action: "orders.create",
    module: "orders",
    entityType: "order",
    entityId: order.id,
    branchId: order.branchId,
    details: { folio: order.folio, total: order.total.toNumber(), itemCount: order.items.length },
  });

  return mapOrder(order);
}

// GET /api/public/orders/:orderNumber?phone= — rastreo público de pedidos.
// Decodifica el folio del orderNumber "P-000123" y exige que el teléfono
// coincida exactamente con el del cliente antes de devolver nada, para que
// no se puedan enumerar pedidos de otros clientes adivinando números
// consecutivos. Un teléfono que no coincide da el mismo 404 que un
// orderNumber inválido, sin filtrar si el número existe.
export async function trackOnlineOrder(orderNumber: string, phone: string) {
  const match = /^P-(\d+)$/.exec(orderNumber.trim());
  if (!match) throw new AppError(404, "Pedido no encontrado");
  const folio = Number(match[1]);
  const order = await orderRepo.findOrderByFolio(folio);
  if (!order || order.customer.phone !== phone) throw new AppError(404, "Pedido no encontrado");
  return mapOrder(order);
}

export interface ListOrdersFilters {
  branchId?: string;
  status?: OrderStatusValue;
  from?: Date;
  to?: Date;
}

// Filtrado por sucursal igual que listSales en saleService.ts: allBranches
// ve todo, el resto solo sus sucursales asignadas, y un branchId explícito
// fuera de ese conjunto se rechaza con 403.
export async function listOrders(actorId: string, filters: ListOrdersFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const orders = await orderRepo.listOrders({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    status: filters.status,
    from: filters.from,
    to: filters.to,
  });

  return orders.map(mapOrder);
}

export async function getOrder(id: string, actorId: string) {
  const order = await orderRepo.findOrderById(id);
  if (!order) throw new AppError(404, "Pedido no encontrado");
  await assertBranchAccess(prisma, actorId, order.branchId);
  return mapOrder(order);
}

// El staff transiciona PENDING -> CONFIRMED -> PREPARING -> READY ->
// COMPLETED estrictamente en secuencia (un paso a la vez), o a CANCELLED
// desde cualquier estado no terminal, igual que cancelSale/cancelTransfer:
// cancelar restaura el stock de cada línea vía applyMovement con signo
// invertido (positivo).
const STATUS_SEQUENCE: OrderStatusValue[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

// Código de verificación de retiro de 6 dígitos. Rellenado con ceros para
// que "007123" mantenga 6 dígitos y no quede en "7123".
function generatePickupCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatusValue,
  actorId: string,
  reason?: string,
  pickupCode?: string
) {
  const updated = await prisma.$transaction(async (tx) => {
    const order = await orderRepo.findOrderById(id, tx);
    if (!order) throw new AppError(404, "Pedido no encontrado");

    await assertBranchAccess(tx, actorId, order.branchId);

    if (order.status === "CANCELLED") throw new AppError(400, "El pedido ya está cancelado");
    if (order.status === "COMPLETED") throw new AppError(400, "El pedido ya fue completado");

    if (status === "CANCELLED") {
      for (const item of order.items) {
        await applyMovement(
          {
            productId: item.productId,
            variantId: item.variantId ?? undefined,
            branchId: order.branchId,
            type: "ORDER",
            quantity: item.quantity,
            reference: `cancel:${order.id}`,
            userId: actorId,
          },
          tx
        );
      }
      return orderRepo.updateOrderStatus(id, { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason }, tx);
    }

    const currentIdx = STATUS_SEQUENCE.indexOf(order.status as OrderStatusValue);
    const targetIdx = STATUS_SEQUENCE.indexOf(status);
    if (targetIdx !== currentIdx + 1) {
      throw new AppError(400, `No se puede pasar de "${order.status}" a "${status}" directamente`);
    }

    const data: Prisma.OrderUncheckedUpdateInput = { status };
    if (status === "CONFIRMED") data.confirmedAt = new Date();

    // Código de verificación de retiro: se genera al pasar un pedido
    // PICKUP a READY (el staff lo envía por el mensaje de WhatsApp de
    // OrdersPage.tsx) y se exige de vuelta para cerrar el ciclo en
    // COMPLETED. Los pedidos DELIVERY nunca lo reciben, no hay entrega en
    // persona que verificar en ese caso.
    if (status === "READY" && order.fulfillmentType === "PICKUP") {
      data.pickupCode = generatePickupCode();
    }

    if (status === "COMPLETED") {
      // Falla cerrado: si es PICKUP, siempre se exige el código, aunque
      // por algún motivo la orden no tenga uno guardado (nunca debería
      // pasar por el flujo normal, pero así una fila con datos corruptos
      // o un futuro cambio que se salte el paso READY no puede completarse
      // sin verificación en vez de dejarla pasar en silencio.
      if (order.fulfillmentType === "PICKUP") {
        if (!order.pickupCode || !pickupCode || pickupCode !== order.pickupCode) {
          throw new AppError(400, "Código de retiro incorrecto");
        }
      }
      data.completedAt = new Date();

      // La Order ya ES el documento pre-venta (su folio "P-" es el ticket
      // pre-venta, creado en el checkout junto al movimiento ORDER que ya
      // descontó inventario). Completar el pedido NO debe tocar el
      // inventario de nuevo (duplicaría el descuento); solo necesita
      // materializar el registro Sale real para que el pedido cumplido
      // aparezca en Ventas con un ticket "V-". Se usan las llamadas al
      // repositorio directas (saleRepo.createSale/createSaleItem/
      // createSalePayment) en vez de saleService.createSale, justamente
      // para evitar sus propias llamadas a applyMovement.
      const sale = await saleRepo.createSale(
        {
          branchId: order.branchId,
          userId: actorId,
          customerId: order.customerId,
          subtotal: order.subtotal,
          discountTotal: 0,
          taxTotal: order.taxTotal,
          total: order.total,
          status: "COMPLETED",
        },
        tx
      );
      for (const item of order.items) {
        await saleRepo.createSaleItem(
          {
            saleId: sale.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          },
          tx
        );
      }
      await saleRepo.createSalePayment(
        { saleId: sale.id, method: order.paymentMethod, amount: order.total },
        tx
      );
      data.saleId = sale.id;
    }

    return orderRepo.updateOrderStatus(id, data, tx);
  });

  await logAudit({
    userId: actorId,
    action: "orders.updateStatus",
    module: "orders",
    entityType: "order",
    entityId: updated.id,
    branchId: updated.branchId,
    details: { folio: updated.folio, status: updated.status, reason, saleId: updated.saleId ?? undefined },
  });

  return mapOrder(updated);
}

// El staff define/cambia la promesa de "listo para" que ve el cliente al
// rastrear su pedido. Es independiente del pipeline de estados a propósito:
// el ETA puede fijarse o revisarse en cualquier momento antes de COMPLETED.
export async function setEstimatedReadyAt(id: string, estimatedReadyAt: Date | null, actorId: string) {
  const order = await orderRepo.findOrderById(id);
  if (!order) throw new AppError(404, "Pedido no encontrado");
  await assertBranchAccess(prisma, actorId, order.branchId);
  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    throw new AppError(400, `No se puede cambiar el tiempo estimado de un pedido "${order.status.toLowerCase()}"`);
  }

  const updated = await orderRepo.updateOrderStatus(id, { estimatedReadyAt }, prisma);

  await logAudit({
    userId: actorId,
    action: "orders.setEta",
    module: "orders",
    entityType: "order",
    entityId: updated.id,
    branchId: updated.branchId,
    details: { folio: updated.folio, estimatedReadyAt },
  });

  return mapOrder(updated);
}
