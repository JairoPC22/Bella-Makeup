import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { verifySupervisorPin, PIN_GENERIC_ERROR } from "./pinAuthService";
import { resolveUnitPrice } from "./saleService";
import * as mermaRepo from "../repositories/mermaRepository";

export type MermaType =
  | "TESTER_EXHIBICION"
  | "DANO_EN_TIENDA"
  | "CADUCIDAD_VENCIDO"
  | "MUESTRA_REGALO_CLIENTE"
  | "DEFECTO_PROVEEDOR";

export interface MermaItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface RegisterMermaInput {
  branchId: string;
  type: MermaType;
  comments: string;
  items: MermaItemInput[];
  pinCode: string;
}

// Identical to saleService/returnService's own round2 — see the note in
// returnService.ts about why it is duplicated rather than extracted.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// "M-" for Merma, alongside "V-" (Venta), "C-" (Compra), "T-"
// (Transferencia) and "D-" (Devolución), same 6-digit zero padding.
export function formatMermaNumber(folio: number): string {
  return `M-${String(folio).padStart(6, "0")}`;
}

// Mirrors saleService/purchaseService/returnService verbatim — same
// rationale documented there (requireBranchScope only reads req.params; a
// merma's branchId arrives in the request body).
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
function mapMerma(merma: any) {
  return {
    ...merma,
    mermaNumber: formatMermaNumber(merma.folio),
    itemCount: merma.items?.length ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalUnits: merma.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) ?? 0,
  };
}

interface PlannedMermaLine {
  productId: string;
  variantId?: string;
  quantity: number;
  unitCost: number;
  unitRetail: number;
}

interface MermaPlan {
  lines: PlannedMermaLine[];
  totalCostImpact: number;
  totalRetailImpact: number;
}

// Read-only validation + money snapshotting for one write-off. Same
// two-pass discipline as returnService.buildReturnPlan: run once before the
// PIN check for error quality (it writes nothing, so it cannot violate the
// wrong-PIN-no-side-effects guarantee), then again inside the write
// transaction, where it is the authoritative check — a concurrent sale could
// consume the stock this merma is about to write off.
async function buildMermaPlan(
  client: Prisma.TransactionClient,
  input: RegisterMermaInput,
  actorId: string
): Promise<MermaPlan> {
  await assertBranchAccess(client, actorId, input.branchId);

  const branch = await client.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new AppError(404, "Sucursal no encontrada");
  if (branch.status === "INACTIVE") throw new AppError(400, `La sucursal "${branch.name}" está inactiva`);

  if (input.items.length === 0) throw new AppError(400, "La merma debe tener al menos un artículo");
  // Defensive: merma.validators.ts already enforces this at the API
  // boundary, but the mandatory-explanation rule is a business rule, not a
  // transport concern, and this function is exported territory for future
  // callers (an import script, a scheduled expiry sweep) that may not go
  // through the validator.
  if (!input.comments || input.comments.trim().length === 0) {
    throw new AppError(400, "El comentario es obligatorio para registrar una merma");
  }

  let totalCostImpact = 0;
  let totalRetailImpact = 0;
  const lines: PlannedMermaLine[] = [];

  for (const item of input.items) {
    if (item.quantity <= 0) throw new AppError(400, "La cantidad debe ser mayor a cero");

    const product = await client.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new AppError(404, `Producto no encontrado: ${item.productId}`);

    let variant: { id: string; productId: string; name: string; price: Prisma.Decimal | null; status: string } | null = null;
    if (item.variantId) {
      variant = await client.productVariant.findUnique({ where: { id: item.variantId } });
      if (!variant) throw new AppError(404, `Variante no encontrada: ${item.variantId}`);
      if (variant.productId !== product.id) throw new AppError(400, "La variante no pertenece al producto indicado");
    }

    // Note there is deliberately no INACTIVE check on the product/variant
    // here, unlike createSale: discontinued stock is exactly the stock most
    // likely to expire or be written off as a tester, and refusing to record
    // that loss would leave phantom units on the books forever.

    // Snapshotted now, never re-derived on read: what the business paid for
    // the unit, and what it would have sold for today.
    const unitCost = product.cost.toNumber();
    const unitRetail = resolveUnitPrice(product, variant);

    totalCostImpact = round2(totalCostImpact + round2(unitCost * item.quantity));
    totalRetailImpact = round2(totalRetailImpact + round2(unitRetail * item.quantity));

    // Explicit availability pre-check for a clear, named message.
    // applyMovement stays the authoritative guard inside the transaction.
    const inventoryRow = await client.inventory.findFirst({
      where: { productId: item.productId, variantId: item.variantId ?? null, branchId: input.branchId },
    });
    const available = inventoryRow?.stock ?? 0;
    if (available < item.quantity) {
      throw new AppError(
        400,
        `Stock insuficiente para la merma: "${product.name}"${variant ? ` (${variant.name})` : ""}` +
          ` tiene ${available} disponible(s) y se intentan dar de baja ${item.quantity}`
      );
    }

    lines.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitCost,
      unitRetail,
    });
  }

  return { lines, totalCostImpact, totalRetailImpact };
}

export async function registerMerma(input: RegisterMermaInput, actorId: string) {
  // Phase 1: read-only validation, for error quality. Writes nothing.
  await buildMermaPlan(prisma, input, actorId);

  // Phase 2: supervisor authorization, up front. Same discipline as
  // returnService.processReturn — the permission checked belongs to the PIN
  // HOLDER, not the requesting staff member, and a failure throws the exact
  // generic message the primitive itself uses, before any stock moves or any
  // row is written.
  const auth = await verifySupervisorPin(actorId, input.pinCode, "shrinkage.authorize");
  if (!auth.ok) throw new AppError(401, PIN_GENERIC_ERROR);

  // Phase 3: the atomic write.
  const created = await prisma.$transaction(async (tx) => {
    // Authoritative re-validation under the transaction's own snapshot.
    const plan = await buildMermaPlan(tx, input, actorId);

    const merma = await mermaRepo.createMerma(
      {
        branchId: input.branchId,
        requestedByUserId: actorId,
        authorizedByUserId: auth.supervisorId,
        type: input.type,
        comments: input.comments.trim(),
        totalCostImpact: plan.totalCostImpact,
        totalRetailImpact: plan.totalRetailImpact,
      },
      tx
    );

    for (const line of plan.lines) {
      await mermaRepo.createMermaItem(
        {
          mermaId: merma.id,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          unitRetail: line.unitRetail,
        },
        tx
      );

      // MovementType.ADJUSTMENT, reused as-is rather than given its own
      // type: a merma IS a manual stock adjustment. What makes it different
      // from a blind correction is not the movement, it is the audited
      // document this movement references — which carries the category, the
      // mandatory explanation, the authorizing supervisor and the money
      // impact. The kardex row points at merma.id, so any adjustment in the
      // ledger can be traced back to its reason.
      await applyMovement(
        {
          productId: line.productId,
          variantId: line.variantId,
          branchId: input.branchId,
          type: "ADJUSTMENT",
          quantity: -line.quantity,
          reference: merma.id,
          userId: actorId,
        },
        tx
      );
    }

    return (await mermaRepo.findMermaById(merma.id, tx))!;
  });

  await logAudit({
    userId: actorId,
    action: "mermas.create",
    module: "mermas",
    entityType: "merma",
    entityId: created.id,
    branchId: created.branchId,
    details: {
      folio: created.folio,
      type: created.type,
      authorizedByUserId: created.authorizedByUserId,
      totalCostImpact: created.totalCostImpact.toNumber(),
      totalRetailImpact: created.totalRetailImpact.toNumber(),
      itemCount: created.items.length,
    },
  });

  return mapMerma(created);
}

export interface ListMermasFilters {
  branchId?: string;
  type?: MermaType;
  from?: Date;
  to?: Date;
}

export async function listMermas(actorId: string, filters: ListMermasFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const mermas = await mermaRepo.listMermas({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    type: filters.type,
    from: filters.from,
    to: filters.to,
  });

  return mermas.map((m) => mapMerma(m));
}

export async function getMerma(id: string, actorId: string) {
  const merma = await mermaRepo.findMermaById(id);
  if (!merma) throw new AppError(404, "Merma no encontrada");

  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && !accessible.includes(merma.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  return mapMerma(merma);
}
