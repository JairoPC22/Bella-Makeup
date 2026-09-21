import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
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
}

// Money is handled as plain JS numbers throughout this service (not
// Prisma.Decimal/decimal.js instances) for readability of the arithmetic —
// rounded to 2 decimal places after every operation that could introduce
// floating-point drift, so partial-cent errors never accumulate across a
// multi-item cart. Prisma accepts a plain number for a Decimal column on
// write, so no conversion back to Decimal is needed before create/update.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// A discount is only ever a reduction — a promoPrice that happens to be
// *higher* than the regular price (e.g. left stale after a promo ended)
// must never be used to upcharge a customer, so it's ignored in that case.
// A variant's own `price` (when set) overrides the product's price/promo
// logic entirely — variants don't have their own promo field in the schema.
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

async function hasPermission(client: Prisma.TransactionClient, roleId: string, code: string): Promise<boolean> {
  const count = await client.rolePermission.count({ where: { roleId, permission: { code } } });
  return count > 0;
}

// Mirrors middleware/permissions.ts's requireBranchScope logic (allBranches
// OR an explicit UserBranch row), but against a body-supplied branchId
// instead of a route param — requireBranchScope only reads req.params, so it
// can't be reused directly here. There's no currently-live shared helper for
// the body-supplied-branchId case (an earlier version of the messaging
// feature had one before that feature was pivoted away from
// branch-scoping), so this is written inline per that established pattern.
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

export function formatTicketNumber(folio: number): string {
  return `V-${String(folio).padStart(6, "0")}`;
}

function customerDisplayName(customer: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!customer) return "Cliente general";
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return name || "Cliente general";
}

// Shapes every sale (create/list/detail/cancel) the same way, so the
// frontend's receipt/ticket view and the sales list both get `ticketNumber`
// and `customerName` for free instead of recomputing them client-side.
// `changeDue` is only meaningful right after checkout (it's the change owed
// on the payments just submitted) — omitted from list/detail responses,
// included only when createSale passes it explicitly.
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

// Checkout: creates a Sale + its SaleItem/SalePayment rows and decrements
// stock for every line item as ONE atomic prisma.$transaction. If any item
// fails to price (404/400) or oversells (applyMovement's own AppError(400)),
// the whole transaction rolls back — no partial sale, no partial stock
// decrement for the items that *were* valid. This is exactly what Task 1's
// `applyMovement(input, tx)` extension exists for: every applyMovement call
// below passes the outer `tx` so it participates in this same transaction
// instead of opening its own.
export async function createSale(input: CreateSaleInput, actorId: string) {
  const { sale, changeDue } = await prisma.$transaction(async (tx) => {
    await assertBranchAccess(tx, actorId, input.branchId);

    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const canAuthorizeDiscount = await hasPermission(tx, actor.roleId, "discounts.authorize");

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

      // Placeholder default: a discount up to 15% of the line's own
      // subtotal only requires `discounts.apply` (already gated at the
      // route level). Anything above that requires `discounts.authorize`.
      // Not yet configurable (e.g. via CompanySettings) — this constant is
      // the single source of truth for the threshold until a future task
      // makes it per-branch/company configurable.
      if (discount > 0) {
        const threshold = round2(lineSubtotal * 0.15);
        if (discount > threshold && !canAuthorizeDiscount) {
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

    // Caja auto-attach. A POS sale rung up by a cashier who currently has
    // an OPEN CashSession at this same branch accrues to that session, so
    // the blind close can later sum "this shift's takings" without the POS
    // frontend ever having to thread a session id through checkout. The
    // lookup is deterministic by construction: cashSessionService.openSession
    // refuses to create a second OPEN session for the same user (or a second
    // one at the same branch under a different user), so this can match at
    // most one row.
    //
    // Deliberately a plain nullable lookup rather than a requirement: if no
    // session is open, cashSessionId stays null and the sale behaves exactly
    // as it did before this module existed. That is what keeps every
    // non-POS/online-order-adjacent path — and every existing test — working
    // untouched. It adds one indexed SELECT to the transaction and changes
    // none of its atomicity properties: it reads inside the same tx, so it
    // rolls back with everything else and cannot attach a sale to a session
    // that a concurrent close is retiring.
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

      // Passing `tx` here (Task 1's signature extension) is what makes this
      // whole checkout atomic: if this throws (insufficient stock), it
      // aborts the SAME transaction that created the Sale/SaleItem rows
      // above, rolling all of it back together.
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
    return { sale: full!, changeDue };
  });

  await logAudit({
    userId: actorId,
    action: "sales.create",
    module: "sales",
    entityType: "sale",
    entityId: sale.id,
    branchId: sale.branchId,
    details: { folio: sale.folio, total: sale.total.toNumber(), itemCount: sale.items.length },
  });

  return mapSale(sale, changeDue);
}

export interface ListSalesFilters {
  branchId?: string;
  status?: "COMPLETED" | "CANCELLED";
  from?: Date;
  to?: Date;
}

// Branch-scoped exactly like requireBranchScope: a caller with
// `allBranches` sees everything (optionally narrowed further by the
// `branchId` query param); everyone else is restricted to their assigned
// branches, and an explicit `branchId` query param outside that set is
// rejected with 403 rather than silently returning zero rows.
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

// Full void (same-session "undo"), not a partial/post-hoc return — restores
// every line item's stock in full via applyMovement and marks the sale
// CANCELLED. Partial/post-hoc returns against an already-completed sale are
// explicitly out of scope for this task (a distinct future feature gated
// behind the already-seeded `sales.return` permission).
export async function cancelSale(id: string, reason: string, actorId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const sale = await saleRepo.findSaleById(id, tx);
    if (!sale) throw new AppError(404, "Venta no encontrada");
    if (sale.status === "CANCELLED") throw new AppError(400, "La venta ya está cancelada");

    await assertBranchAccess(tx, actorId, sale.branchId);

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

    return saleRepo.cancelSale(id, { cancelledAt: new Date(), cancelledBy: actorId, cancelReason: reason }, tx);
  });

  await logAudit({
    userId: actorId,
    action: "sales.cancel",
    module: "sales",
    entityType: "sale",
    entityId: updated.id,
    branchId: updated.branchId,
    details: { folio: updated.folio, reason },
  });

  return mapSale(updated);
}
