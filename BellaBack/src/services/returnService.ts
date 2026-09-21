import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { verifySupervisorPin, PIN_GENERIC_ERROR } from "./pinAuthService";
import { formatTicketNumber, resolveUnitPrice } from "./saleService";
import * as returnRepo from "../repositories/returnRepository";

export interface ReturnedItemInput {
  saleItemId: string;
  quantity: number;
  // False means the merchandise came back unsellable (broken seal, damaged
  // packaging, used product). The customer is still credited for it — that
  // is a commercial decision the supervisor just authorized — but it does
  // NOT go back on the shelf, so no stock movement is applied for that line.
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
  pinCode: string;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  notes?: string;
}

// Same money handling as saleService: plain JS numbers, rounded to 2 dp
// after every operation that could introduce float drift. Identical to
// saleService's own private round2 — kept local for the same reason
// assertBranchAccess is duplicated across these services (documented in
// purchaseService.ts): there is no live shared money/scope util module, and
// inventing one as a side effect of this task would touch every existing
// service.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// "D-" for Devolución, alongside saleService's "V-" (Venta),
// purchaseService's "C-" (Compra) and transferService's "T-"
// (Transferencia), with the same 6-digit zero padding.
export function formatReturnNumber(folio: number): string {
  return `D-${String(folio).padStart(6, "0")}`;
}

// Mirrors saleService/purchaseService's verbatim — see the rationale
// documented there: requireBranchScope only reads req.params, and a
// return's branch is derived from the original sale in the request body.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReturn(ret: any) {
  return {
    ...ret,
    returnNumber: formatReturnNumber(ret.folio),
    // The ticket the customer physically presented at the counter, formatted
    // the same way the POS printed it, so the returns list is searchable by
    // the number on the paper without the client recomputing it.
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

// Every validation and every peso of arithmetic for one return, as a pure
// read: it writes nothing, so it is safe to run BEFORE the supervisor PIN is
// checked (to reject an obviously malformed request with a useful message
// rather than a generic 401) and it is run AGAIN inside the write
// transaction, where its answer is the authoritative one.
//
// Running it twice is deliberate, not redundancy. The pre-PIN pass exists
// for error quality; the in-transaction pass is what actually guarantees
// correctness, because between the two a concurrent return could consume the
// remaining returnable quantity of a line or the last unit of stock for an
// exchange item. Only the in-transaction pass reads under the same snapshot
// that the writes commit in.
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
    // A cancelled sale already restored 100% of its stock via cancelSale and
    // was refunded in full. Returning against it would credit the customer
    // twice and double-restock the shelf.
    throw new AppError(400, "La venta original está cancelada; no admite devoluciones");
  }

  await assertBranchAccess(client, actorId, sale.branchId);

  if (input.returnedItems.length === 0) {
    throw new AppError(400, "La devolución debe incluir al menos un artículo devuelto");
  }

  // Repeated lines are rejected rather than summed, mirroring
  // receivePurchase's "Hay líneas repetidas" rule. Summing them would be a
  // guess about intent, and — worse — a request that listed the same
  // saleItemId twice with restock:true and restock:false would have no
  // coherent meaning at all.
  const seen = new Set<string>();
  for (const line of input.returnedItems) {
    if (seen.has(line.saleItemId)) throw new AppError(400, "Hay líneas repetidas en la devolución");
    seen.add(line.saleItemId);
  }

  const saleItemIds = input.returnedItems.map((l) => l.saleItemId);
  // THE cumulative guard. Sums every quantity previously returned against
  // each of these lines, across all prior Return documents. Read through the
  // same client as the writes, so inside the transaction it cannot go stale.
  const alreadyReturned = await returnRepo.sumReturnedQuantitiesBySaleItem(saleItemIds, client);

  let returnedTotal = 0;
  const returnedLines: PlannedReturnedLine[] = [];

  for (const line of input.returnedItems) {
    const saleItem = sale.items.find((i) => i.id === line.saleItemId);
    // Checked against THIS sale's own items, so a caller cannot return a
    // line belonging to somebody else's ticket by guessing its id.
    if (!saleItem) throw new AppError(400, `La línea ${line.saleItemId} no pertenece a esta venta`);
    if (line.quantity <= 0) throw new AppError(400, "La cantidad devuelta debe ser mayor a cero");

    const priorlyReturned = alreadyReturned.get(line.saleItemId) ?? 0;
    const remaining = saleItem.quantity - priorlyReturned;
    if (line.quantity > remaining) {
      // One message covers both the single-shot over-return and the
      // cumulative case, and names the real remaining figure so the cashier
      // can see WHY (e.g. "bought 3, already returned 2, 1 left").
      throw new AppError(
        400,
        `No se puede devolver ${line.quantity} de esta línea: se compraron ${saleItem.quantity}` +
          `, ya se devolvieron ${priorlyReturned} y quedan ${remaining} por devolver`
      );
    }

    // Credited at what the customer ACTUALLY paid per unit on the original
    // ticket (SaleItem.unitPrice), never today's list price. If that line
    // carried a discount, the credit reflects it.
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

    // CURRENT pricing, via the POS's own resolveUnitPrice. A new item is a
    // new sale: it does not inherit the original ticket's discount or a
    // promo that has since ended.
    const unitPrice = resolveUnitPrice(product, variant);
    newItemsTotal = round2(newItemsTotal + round2(unitPrice * item.quantity));

    // Explicit availability pre-check so an exchange for something the
    // branch does not have fails with a message that names the product and
    // the real figures, instead of applyMovement's generic
    // "dejaría el inventario en negativo". applyMovement remains the
    // authoritative guard inside the transaction — this is a better error,
    // not a replacement for it.
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

  // Only enforced for CUSTOMER_OWES, the one case where money actually moves
  // toward the business at this counter. Judgment call (flagged in the
  // report): the alternative — accepting a positive balance with no recorded
  // payment method — would leave a receivable nobody can reconcile against
  // the drawer. For the other two resolutions any submitted paymentMethod is
  // discarded below rather than stored, so a stale field left on a POS form
  // can never make a refund look like it was collected as cash.
  if (resolution === "CUSTOMER_OWES" && !input.paymentMethod) {
    throw new AppError(400, "Se requiere un método de pago para cobrar la diferencia");
  }

  return { branchId: sale.branchId, returnedLines, newLines, returnedTotal, newItemsTotal, balance, resolution };
}

// One counter transaction: merchandise comes back, optionally other
// merchandise goes out, and the difference is settled. Structurally this is
// cancelSale's restock loop plus a fresh sale's worth of outbound movements,
// reconciled into a single balance — all inside ONE prisma.$transaction, so
// a failure on the last line rolls back every stock movement and every row
// written before it.
export async function processReturn(input: ProcessReturnInput, actorId: string) {
  // --- Phase 1: read-only validation. Writes nothing. -------------------
  // Runs before the PIN check purely so an honest mistake (wrong ticket,
  // returning more than was bought) reports the real reason instead of a
  // generic 401. Because it is read-only, doing it first cannot create the
  // side effect the wrong-PIN path is required to avoid.
  await buildReturnPlan(prisma, input, actorId);

  // --- Phase 2: supervisor authorization. --------------------------------
  // Up front, before the write transaction opens. The permission checked is
  // the SUPERVISOR's ("returns.authorize"), not the acting cashier's — the
  // cashier's own gate is `returns.create` on the route. On failure this
  // throws before a single stock movement or Return row exists.
  //
  // The generic message is reused verbatim from the primitive so these
  // endpoints cannot leak more than POST /api/auth/verify-pin itself does:
  // wrong digits, a PIN that belongs to somebody without returns.authorize,
  // a supervisor at another branch, and a malformed PIN are all one
  // indistinguishable 401.
  const auth = await verifySupervisorPin(actorId, input.pinCode, "returns.authorize");
  if (!auth.ok) throw new AppError(401, PIN_GENERIC_ERROR);

  // --- Phase 3: the atomic write. ----------------------------------------
  const created = await prisma.$transaction(async (tx) => {
    // Re-validated inside the transaction: this pass is the authoritative
    // one. Between phase 1 and here, a concurrent return could have consumed
    // the rest of a line's returnable quantity, or a concurrent sale the
    // last unit of an exchange item.
    const plan = await buildReturnPlan(tx, input, actorId);

    const ret = await returnRepo.createReturn(
      {
        originalSaleId: input.originalSaleId,
        branchId: plan.branchId,
        processedByUserId: actorId,
        authorizedByUserId: auth.supervisorId,
        returnedTotal: plan.returnedTotal,
        newItemsTotal: plan.newItemsTotal,
        balance: plan.balance,
        resolution: plan.resolution,
        // Stored only where it means something. See buildReturnPlan.
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

      // A non-restocked line writes its ReturnItem row above and then
      // deliberately moves NO stock: the goods exist physically, but not as
      // sellable inventory. The row is what keeps that loss auditable
      // (and is exactly what a later "damaged returns" report reads).
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
          // No originating sale line — this merchandise is leaving now.
          saleItemId: null,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          // Never meaningful for an outbound line.
          restocked: false,
        },
        tx
      );

      // MovementType.SALE, because that is exactly what this is: goods
      // leaving the branch with a customer. Reusing SALE (rather than adding
      // an EXCHANGE_OUT type) keeps every "units sold" report correct
      // without teaching it a new type, and follows the precedent cancelSale
      // already set by reusing SALE for its own reversal.
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
    // Records BOTH parties, so this trail reconciles against the
    // `auth.verify_pin` entry pinAuthService wrote for the same moment.
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

// Branch-scoped exactly like listSales/listPurchases: `allBranches` sees
// everything, everyone else only their assigned branches, and an explicit
// branchId outside that set is a 403 rather than a silently empty list.
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
