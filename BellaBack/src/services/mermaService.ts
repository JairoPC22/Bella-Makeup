import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";
import { verifySupervisorPin, PIN_GENERIC_ERROR } from "./pinAuthService";
import { resolveUnitPrice } from "./saleService";
import { assertBranchAccess, getAccessibleBranchIds } from "./branchAccessService";
import { getSettings as getCompanySettings } from "./companySettingsService";
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
  // Solo se exige cuando CompanySettings.requirePinForShrinkage está activo.
  pinCode?: string;
}

// Idéntico al round2 de saleService/returnService (duplicado a propósito, ver returnService.ts).
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// "M-" de Merma, junto a "V-", "C-", "T-" y "D-", mismo padding de 6 dígitos.
export function formatMermaNumber(folio: number): string {
  return `M-${String(folio).padStart(6, "0")}`;
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

// Validación de solo lectura + cálculo de montos para una baja. Igual patrón
// de dos pasadas que returnService.buildReturnPlan: primero antes del PIN
// (no escribe nada), luego dentro de la transacción como chequeo final.
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
  // Defensivo: el validador ya lo exige, pero es una regla de negocio y esta
  // función puede ser llamada por otros flujos que no pasen por el validador.
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

    // A propósito no se valida INACTIVE aquí (a diferencia de createSale):
    // el stock descontinuado es justo el que más probablemente caduque o se
    // dé de baja como tester, y rechazar el registro dejaría esas unidades
    // fantasma en el inventario para siempre.

    // Se toma la foto ahora (nunca se recalcula al leer): costo pagado y precio de venta actual.
    const unitCost = product.cost.toNumber();
    const unitRetail = resolveUnitPrice(product, variant);

    totalCostImpact = round2(totalCostImpact + round2(unitCost * item.quantity));
    totalRetailImpact = round2(totalRetailImpact + round2(unitRetail * item.quantity));

    // Verificación previa de disponibilidad, para un mensaje claro; applyMovement
    // sigue siendo la validación autoritativa dentro de la transacción.
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
  // Fase 1: validación de solo lectura, para mensajes de error claros.
  await buildMermaPlan(prisma, input, actorId);

  // Fase 2: autorización del supervisor, antes de escribir nada. Igual que
  // returnService.processReturn: el permiso es del titular del PIN, no del
  // solicitante. Configurable por CompanySettings.requirePinForShrinkage: si
  // está apagado, la merma se autoatribuye en vez de exigir un supervisor.
  const settings = await getCompanySettings();
  let authorizedByUserId = actorId;
  if (settings.requirePinForShrinkage) {
    const auth = await verifySupervisorPin(actorId, input.pinCode ?? "", "shrinkage.authorize");
    if (!auth.ok) throw new AppError(401, PIN_GENERIC_ERROR);
    authorizedByUserId = auth.supervisorId;
  }

  // Fase 3: la escritura atómica.
  const created = await prisma.$transaction(async (tx) => {
    // Revalidación autoritativa bajo el snapshot de la transacción.
    const plan = await buildMermaPlan(tx, input, actorId);

    const merma = await mermaRepo.createMerma(
      {
        branchId: input.branchId,
        requestedByUserId: actorId,
        authorizedByUserId,
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

      // Reutiliza MovementType.ADJUSTMENT: una merma es un ajuste manual de
      // stock; lo que la distingue es el documento auditado al que apunta (merma.id).
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
