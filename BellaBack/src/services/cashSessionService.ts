import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";
import { assertBranchAccess, getAccessibleBranchIds } from "./branchAccessService";
import { hasPermissionByUser } from "./permissionCheckService";
import * as cashSessionRepo from "../repositories/cashSessionRepository";

// Misma técnica que inventoryLockKey en inventoryService.ts: convierte un id
// de tipo string en un entero de 64 bits con signo para pg_advisory_xact_lock(bigint).
function lockKeyFor(scope: string, id: string): bigint {
  const hash = createHash("sha256").update(`${scope}:${id}`).digest();
  return hash.readBigInt64BE(0);
}

export interface CashBreakdownLine {
  denomination: number;
  count: number;
}

export interface CloseCashSessionInput {
  cashBreakdown: CashBreakdownLine[];
  cardTotal: number;
}

// El dinero se maneja como number plano de JS y se redondea a 2 decimales
// tras cada operación para evitar drift de punto flotante, misma convención
// que saleService.ts. Prisma acepta un number plano al escribir una columna
// Decimal, así que no hace falta reconvertir.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Función crítica del módulo: separa lo que el cajero declaró (siempre
// seguro de devolver) de lo que el sistema calculó (systemCashTotal/
// systemCardTotal/cashDifference/cardDifference). Este segundo grupo nunca
// debe llegar a un cajero que aún no hizo su conteo a ciegas, porque si ve
// el total esperado antes podría "ajustar" su conteo físico para que
// coincida — justo el fraude que este control busca evitar.
//
// Por eso se usa una allowlist que RECONSTRUYE el objeto campo por campo en
// vez de esparcir (spread) la fila de Prisma y borrar cosas: con spread, una
// columna nueva en el modelo se filtraría a toda respuesta sin que nadie lo
// note. Aquí una columna nueva es invisible hasta que alguien la agregue
// explícitamente, y el bloque de totales del sistema es inalcanzable si la
// sesión no está cerrada.
//
// Para una sesión OPEN los cuatro campos del sistema se OMITEN por completo
// (claves ausentes, no null): así el cliente no puede renderizar "esperado: —"
// a partir de una clave inexistente, y un test puede usar toBeUndefined() en
// vez del más débil toBeNull().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSession(session: any) {
  const base: Record<string, unknown> = {
    id: session.id,
    branchId: session.branchId,
    userId: session.userId,
    openingFloat: session.openingFloat,
    status: session.status,
    // Declaración propia del cajero — null mientras está OPEN, pero es suya de todos modos.
    declaredCashBreakdown: session.declaredCashBreakdown,
    declaredCashTotal: session.declaredCashTotal,
    declaredCardTotal: session.declaredCardTotal,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    branch: session.branch,
    user: session.user,
  };

  if (session.status === "OPEN") return base;

  return {
    ...base,
    systemCashTotal: session.systemCashTotal,
    systemCardTotal: session.systemCardTotal,
    cashDifference: session.cashDifference,
    cardDifference: session.cardDifference,
  };
}

// ---------------------------------------------------------------------------
// Apertura
// ---------------------------------------------------------------------------

// Dos reglas de exclusividad, ambas validadas dentro de la transacción que
// crea la fila para que un doble envío no pueda saltárselas:
//
//  1. Una sola sesión OPEN por USUARIO. Un cajero tiene un solo cajón; un
//     segundo turno abierto haría ambiguo el auto-attach de
//     saleService.createSale, del cual depende todo el cierre a ciegas.
//
//  2. Una sola sesión OPEN por SUCURSAL, aunque sea otro usuario. Es la
//     lectura literal del requerimiento (un cajero, un cajón, una sucursal a
//     la vez): el esquema no modela el concepto de terminal/caja registradora,
//     así que no hay forma de enrutar una venta al cajón correcto si hubiera
//     dos abiertos en la misma sucursal. Si algún día se agrega ese concepto,
//     esta regla (no la 1) es la que habría que revisar.
//
// A propósito no hay un índice único parcial en la base de datos respaldando
// esto (Prisma no puede expresar UNIQUE (user_id) WHERE status = 'OPEN').
// En su lugar se usa pg_advisory_xact_lock (misma técnica que
// inventoryService.applyMovement) sobre userId y branchId antes de cada
// verificación: sin el lock, dos aperturas concurrentes para el mismo
// usuario o sucursal podrían leer "no hay sesión abierta" antes de que
// cualquiera confirme, produciendo dos sesiones OPEN simultáneas que
// mezclarían las ventas de dos cajeros de forma no determinista.
export async function openSession(branchId: string, userId: string, openingFloat: number) {
  if (openingFloat < 0) throw new AppError(400, "El fondo de apertura no puede ser negativo");

  const session = await prisma.$transaction(async (tx) => {
    await assertBranchAccess(tx, userId, branchId);

    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new AppError(404, "Sucursal no encontrada");
    if (branch.status === "INACTIVE") throw new AppError(400, `La sucursal "${branch.name}" está inactiva`);

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKeyFor("cash-session-user", userId)})`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKeyFor("cash-session-branch", branchId)})`;

    const ownOpen = await cashSessionRepo.findOpenCashSession({ userId }, tx);
    if (ownOpen) throw new AppError(400, "Ya tienes una caja abierta. Debes cerrarla antes de abrir otra.");

    const branchOpen = await cashSessionRepo.findOpenCashSession({ branchId }, tx);
    if (branchOpen) throw new AppError(400, `Ya hay una caja abierta en "${branch.name}" por otro cajero`);

    return cashSessionRepo.createCashSession(
      { branchId, userId, openingFloat: round2(openingFloat), status: "OPEN" },
      tx
    );
  });

  await logAudit({
    userId,
    action: "cash.open",
    module: "cash",
    entityType: "cash_session",
    entityId: session.id,
    branchId: session.branchId,
    details: { openingFloat: session.openingFloat.toNumber() },
  });

  return mapSession(session);
}

// "¿Ya tengo un turno abierto en esta sucursal?" — la pregunta que hace el
// POS al arrancar. Devuelve solo la sesión propia del que llama, nunca la de
// otro cajero, y (vía mapSession) nunca un total del sistema.
export async function getOpenSession(branchId: string, userId: string) {
  await assertBranchAccess(prisma, userId, branchId);
  const session = await cashSessionRepo.findOpenCashSession({ branchId, userId });
  return session ? mapSession(session) : null;
}

// ---------------------------------------------------------------------------
// Cierre a ciegas
// ---------------------------------------------------------------------------

// Revalida el desglose capturado a mano, independiente de la capa Zod, para
// que la regla se cumpla también para cualquier llamador que no sea HTTP, y
// devuelve la suma.
function totalFromBreakdown(breakdown: CashBreakdownLine[]): number {
  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    throw new AppError(400, "El conteo de efectivo debe tener al menos una línea");
  }
  let total = 0;
  for (const line of breakdown) {
    if (typeof line?.denomination !== "number" || !Number.isFinite(line.denomination) || line.denomination <= 0) {
      throw new AppError(400, "Cada denominación debe ser un número mayor a cero");
    }
    if (typeof line?.count !== "number" || !Number.isInteger(line.count) || line.count < 0) {
      throw new AppError(400, "Cada conteo debe ser un número entero no negativo");
    }
    total = round2(total + line.denomination * line.count);
  }
  return total;
}

// La revelación: el cajero declara lo que contó físicamente y solo entonces
// el servidor calcula lo esperado y devuelve ambos lados más la diferencia
// firmada. Es la única respuesta del módulo donde aparecen por primera vez
// systemCashTotal/systemCardTotal/cashDifference/cardDifference.
//
// Alcance de la conciliación: solo PaymentMethod.CASH -> systemCashTotal y
// PaymentMethod.CARD -> systemCardTotal. TRANSFER y OTHER no cuentan en
// ningún total a propósito: no corresponden a nada físico en el cajón, así
// que no hay un conteo ciego posible para ellos, y sumarlos generaría un
// faltante fantasma permanente.
//
// systemCashTotal NO incluye el openingFloat: es solo lo vendido en efectivo
// durante el turno, tal como se declara.
export async function closeSessionBlind(sessionId: string, actorId: string, input: CloseCashSessionInput) {
  const declaredCashTotal = totalFromBreakdown(input.cashBreakdown);
  if (typeof input.cardTotal !== "number" || !Number.isFinite(input.cardTotal) || input.cardTotal < 0) {
    throw new AppError(400, "El total de tarjeta no puede ser negativo");
  }
  const declaredCardTotal = round2(input.cardTotal);

  const { session, wasOverride } = await prisma.$transaction(async (tx) => {
    const existing = await cashSessionRepo.findCashSessionById(sessionId, tx);
    if (!existing) throw new AppError(404, "Caja no encontrada");
    if (existing.status !== "OPEN") throw new AppError(400, "La caja ya fue cerrada");

    await assertBranchAccess(tx, actorId, existing.branchId);

    // Quién puede cerrar: el cajero dueño siempre (camino normal, con
    // cash.manage en la ruta). Además, quien tenga cash.audit puede cerrar
    // CUALQUIER sesión abierta: es una anulación intencional del gerente
    // para el barrido de fin de día cuando un cajero se fue sin cortar su
    // caja. Por eso se registra distinto en el audit log (closedByOwner:
    // false) en vez de verse igual que un autocierre.
    const isOwner = existing.userId === actorId;
    if (!isOwner) {
      const canAudit = await hasPermissionByUser(tx, actorId, "cash.audit");
      if (!canAudit) throw new AppError(403, "Solo el cajero propietario puede cerrar esta caja");
    } else {
      const canManage = await hasPermissionByUser(tx, actorId, "cash.manage");
      const canAudit = await hasPermissionByUser(tx, actorId, "cash.audit");
      if (!canManage && !canAudit) throw new AppError(403, "Permiso insuficiente");
    }

    // Solo ahora, con la declaración ya en mano, se calcula la verdad. Las
    // ventas CANCELLED quedan excluidas por la consulta del repositorio, así
    // que una venta anulada durante el turno nunca cuenta en este total.
    const sums = await cashSessionRepo.sumSessionPaymentsByMethod(sessionId, tx);
    let systemCashTotal = 0;
    let systemCardTotal = 0;
    for (const row of sums) {
      const amount = row._sum?.amount ? round2(Number(row._sum.amount)) : 0;
      if (row.method === "CASH") systemCashTotal = amount;
      else if (row.method === "CARD") systemCardTotal = amount;
    }

    // Con signo: positivo = sobrante, negativo = faltante.
    const cashDifference = round2(declaredCashTotal - systemCashTotal);
    const cardDifference = round2(declaredCardTotal - systemCardTotal);
    const status = cashDifference === 0 && cardDifference === 0 ? "CLOSED" : "CLOSED_WITH_DISCREPANCY";

    const closed = await cashSessionRepo.closeCashSession(
      sessionId,
      {
        status,
        declaredCashBreakdown: input.cashBreakdown as unknown as Prisma.InputJsonValue,
        declaredCashTotal,
        declaredCardTotal,
        systemCashTotal,
        systemCardTotal,
        cashDifference,
        cardDifference,
        closedAt: new Date(),
      },
      tx
    );

    return { session: closed, wasOverride: !isOwner };
  });

  await logAudit({
    userId: actorId,
    action: "cash.close",
    module: "cash",
    entityType: "cash_session",
    entityId: session.id,
    branchId: session.branchId,
    details: {
      status: session.status,
      closedByOwner: !wasOverride,
      ownerUserId: session.userId,
      declaredCashTotal,
      declaredCardTotal,
      systemCashTotal: session.systemCashTotal?.toNumber() ?? 0,
      systemCardTotal: session.systemCardTotal?.toNumber() ?? 0,
      cashDifference: session.cashDifference?.toNumber() ?? 0,
      cardDifference: session.cardDifference?.toNumber() ?? 0,
    },
  });

  return mapSession(session);
}

// ---------------------------------------------------------------------------
// Lectura / auditoría
// ---------------------------------------------------------------------------

export interface ListCashSessionsFilters {
  branchId?: string;
  status?: "OPEN" | "CLOSED" | "CLOSED_WITH_DISCREPANCY";
  from?: Date;
  to?: Date;
}

// Filtrado por sucursal igual que saleService.listSales / listTransfers:
// allBranches ve todo (opcionalmente acotado por branchId), el resto solo
// sus sucursales asignadas, y un branchId fuera de ese conjunto es 403 en
// vez de una lista vacía silenciosa. Protegido con cash.audit en la ruta.
//
// mapSession se aplica por fila también aquí, así que una sesión OPEN en el
// listado de un auditor tampoco muestra sus totales del sistema: esos
// totales simplemente no existen hasta el cierre, y calcularlos al vuelo
// aquí crearía una vía de lectura del total en vivo, justo lo que este
// control busca ocultar.
export async function listSessions(actorId: string, filters: ListCashSessionsFilters) {
  const accessible = await getAccessibleBranchIds(actorId);
  if (accessible !== "ALL" && filters.branchId && !accessible.includes(filters.branchId)) {
    throw new AppError(403, "Sin acceso a esta sucursal");
  }

  const sessions = await cashSessionRepo.listCashSessions({
    branchId: filters.branchId,
    branchIds: accessible === "ALL" ? undefined : accessible,
    status: filters.status,
    from: filters.from,
    to: filters.to,
  });

  return sessions.map((s: unknown) => mapSession(s));
}

export async function getSession(id: string, actorId: string) {
  const session = await cashSessionRepo.findCashSessionById(id);
  if (!session) throw new AppError(404, "Caja no encontrada");

  await assertBranchAccess(prisma, actorId, session.branchId);

  // Un cajero puede leer su propio corte (su declaración y, una vez
  // cerrada, su diferencia revelada). Leer la caja de OTRO es supervisión
  // de gerente y requiere cash.audit; sin esta línea, cualquier cajero con
  // el id de sesión de un colega podría ver un turno del que no responde.
  if (session.userId !== actorId) {
    const canAudit = await hasPermissionByUser(prisma, actorId, "cash.audit");
    if (!canAudit) throw new AppError(403, "Sin permiso para ver la caja de otro cajero");
  }

  return mapSession(session);
}
