import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import * as orderRepo from "../repositories/orderRepository";

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

// Same rounding convention as saleService.ts's round2 — money is handled as
// plain JS numbers, rounded to 2 decimals after every operation that could
// introduce floating-point drift, so partial-cent errors never accumulate
// across a multi-item cart.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Copied verbatim from saleService.ts's resolveUnitPrice (not exported from
// that file, and orderService has no other dependency on saleService, so
// this mirrors the logic rather than importing it): variant price wins if
// set; otherwise promoPrice wins only if it's actually lower than price (a
// stale promoPrice higher than the regular price must never upcharge).
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

// Mirrors saleService.ts's assertBranchAccess/getAccessibleBranchIds
// exactly (same rationale documented there: no currently-live shared
// helper for a body-supplied/order-owned branchId, since requireBranchScope
// middleware only reads req.params).
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

// Find-or-create by phone, matching the low-risk enrichment convention
// established elsewhere in this codebase (a quick-created record gets its
// blank fields filled in on a later match, but an already-populated field
// is never overwritten by a new submission). Phone is not a unique DB
// constraint (Customer.phone is only indexed, not @unique — see
// schema.prisma), so this picks the earliest-created match deterministically
// rather than risk creating duplicate Customer rows for the same shopper on
// repeat orders.
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

// Shapes every order (create/list/detail/status-update) into exactly the
// `OnlineOrder` shape BellaFront/src/types/api.ts declares — field names
// verified against that file, not approximated.
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
    createdAt: order.createdAt,
  };
}

// Public, unauthenticated checkout: validates every item's product/variant
// exists and is ACTIVE, resolves unitPrice server-side (never trusting a
// client-sent price — the contract doesn't even send one), validates
// requested quantity against the ACTUAL available stock at the chosen
// branch (mirrors transferService.ts's createTransfer stock check exactly),
// finds-or-creates the Customer by phone, and — in one prisma.$transaction —
// creates the Order + OrderItem rows and decrements stock for every line
// item via applyMovement(tx), exactly like saleService.ts's createSale
// composes applyMovement calls into the same atomic transaction that
// creates the Sale/SaleItem rows.
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

      // Available-stock check at the specific chosen branch — mirrors
      // transferService.ts's createTransfer check verbatim.
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

      // Passing `tx` (same composition saleService/transferService use) is
      // what makes this whole checkout atomic: if this throws (insufficient
      // stock — a race against the availability check above, since another
      // order could have consumed the stock between the check and this
      // write), it aborts the SAME transaction that created the
      // Order/OrderItem rows, rolling all of it back together.
      //
      // `userId` is intentionally omitted: there is no authenticated actor
      // for a public/unauthenticated storefront order.
      // InventoryMovement.userId is already nullable in schema.prisma and
      // ApplyMovementInput.userId is already optional in
      // inventoryService.ts, so this requires no schema change and no
      // change to any other applyMovement call site — the lower-risk of
      // the two options considered (the alternative, a dedicated seeded
      // "system" user, would have added a fake actor with no real
      // audit/security meaning).
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

// GET /api/public/orders/:orderNumber?phone= — public order tracking.
// Decodes the folio from the "P-000123" orderNumber and requires an exact
// phone match against the order's customer before returning anything, so
// this can't be used to enumerate other customers' orders by guessing
// sequential order numbers. A non-match returns the same 404 as an
// unparseable orderNumber, so the response never leaks whether the order
// number itself exists.
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

// Branch-scoped exactly like saleService.ts's listSales: allBranches sees
// everything, everyone else only their assigned branches, and an explicit
// branchId filter outside that set is rejected with 403.
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

// Staff transitions PENDING -> CONFIRMED -> PREPARING -> READY -> COMPLETED
// strictly in sequence (one step at a time — no skipping ahead), or
// CANCELLED from any non-terminal state, mirroring cancelSale/cancelTransfer
// exactly: cancelling restores every line item's stock via applyMovement
// with the reverse (positive) sign.
const STATUS_SEQUENCE: OrderStatusValue[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

export async function updateOrderStatus(id: string, status: OrderStatusValue, actorId: string, reason?: string) {
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
    if (status === "COMPLETED") data.completedAt = new Date();

    return orderRepo.updateOrderStatus(id, data, tx);
  });

  await logAudit({
    userId: actorId,
    action: "orders.updateStatus",
    module: "orders",
    entityType: "order",
    entityId: updated.id,
    branchId: updated.branchId,
    details: { folio: updated.folio, status: updated.status, reason },
  });

  return mapOrder(updated);
}
