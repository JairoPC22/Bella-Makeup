import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";
import * as cashSessionRepo from "../repositories/cashSessionRepository";

export interface CashBreakdownLine {
  denomination: number;
  count: number;
}

export interface CloseCashSessionInput {
  cashBreakdown: CashBreakdownLine[];
  cardTotal: number;
}

// Money is handled as plain JS numbers here for readability of the
// arithmetic, rounded to 2 decimals after every operation that could
// introduce floating-point drift — the exact convention saleService.ts
// already uses. Prisma accepts a plain number for a Decimal column on
// write, so nothing needs converting back.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Mirrors saleService.ts / transferService.ts's assertBranchAccess exactly
// (same rationale: no currently-live shared helper for a body-supplied
// branchId, since requireBranchScope middleware only reads req.params).
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

// Mirrors saleService.ts's own hasPermission helper (same per-service
// duplication convention as assertBranchAccess above), resolving the role
// from the user id since these service entry points only ever receive an
// actor id, never the JWT's roleId claim.
async function hasPermission(client: Prisma.TransactionClient, userId: string, code: string): Promise<boolean> {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, "Usuario no encontrado");
  const count = await client.rolePermission.count({ where: { roleId: user.roleId, permission: { code } } });
  return count > 0;
}

// THE load-bearing function of this whole module.
//
// A CashSession row carries two very different classes of field: what the
// cashier declared (theirs, always safe to echo back) and what the system
// knows (systemCashTotal/systemCardTotal/cashDifference/cardDifference).
// The second class must never reach a cashier who has not yet submitted
// their blind count, because a cashier who can see the expected total first
// can retrofit their "physical count" to match it — which is exactly the
// fraud this control exists to catch.
//
// So this is a strict allowlist that REBUILDS the response object field by
// field rather than spreading the Prisma row and deleting things. That
// direction matters: with a spread, adding a column to the model silently
// adds it to every response, and the next person to add e.g. a
// runningCashTotal column would breach the blind property without noticing.
// Here a new column is invisible until someone deliberately lists it, and
// the system-total block is physically unreachable unless the session has
// already been closed.
//
// For an OPEN session the four system fields are OMITTED ENTIRELY (absent
// keys, not nulls). Absent is the stronger signal: a client cannot render
// "expected: —" from a key that is not there, and a test can assert
// toBeUndefined() rather than the weaker toBeNull().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSession(session: any) {
  const base: Record<string, unknown> = {
    id: session.id,
    branchId: session.branchId,
    userId: session.userId,
    openingFloat: session.openingFloat,
    status: session.status,
    // The cashier's own declaration — null while OPEN, theirs either way.
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

// Two exclusivity rules, both enforced inside the transaction that creates
// the row so a double-submit cannot race past them:
//
//  1. One OPEN session per USER, anywhere. A cashier has one pair of hands
//     and one drawer; a second open shift would make "this shift's sales"
//     ambiguous for the auto-attach in saleService.createSale, which is the
//     single lookup the entire blind close depends on being deterministic.
//
//  2. One OPEN session per BRANCH, even for a different user. This is the
//     spec-literal reading of the boss's description (one cashier, one
//     drawer, one branch at a time) and is the safer default: this app has
//     no POS-terminal/register concept anywhere in the schema, so there is
//     nothing to tie a second simultaneous drawer to and no way to route a
//     sale to the right one of two open drawers at the same branch. If a
//     register concept is ever added, THIS is the rule to revisit (rule 1
//     would still hold); until then, allowing two would silently pool two
//     cashiers' takings into whichever session the auto-attach happened to
//     find first.
//
// There is deliberately no DB-level partial unique index backing these —
// Prisma cannot express UNIQUE (user_id) WHERE status = 'OPEN' in the
// schema, and hand-writing one into the migration would show up as schema
// drift on the next prisma migrate dev. The transactional check is the
// enforcement point.
export async function openSession(branchId: string, userId: string, openingFloat: number) {
  if (openingFloat < 0) throw new AppError(400, "El fondo de apertura no puede ser negativo");

  const session = await prisma.$transaction(async (tx) => {
    await assertBranchAccess(tx, userId, branchId);

    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new AppError(404, "Sucursal no encontrada");
    if (branch.status === "INACTIVE") throw new AppError(400, `La sucursal "${branch.name}" está inactiva`);

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

// "Is a shift already open for me at this branch?" — the POS frontend's
// boot-time question. Returns the caller's OWN open session only, never
// another cashier's, and (via mapSession) never a system total: there is
// nothing to hide yet since totals are not computed until close, but the
// response shape is deliberate so that stays true after any later refactor.
export async function getOpenSession(branchId: string, userId: string) {
  await assertBranchAccess(prisma, userId, branchId);
  const session = await cashSessionRepo.findOpenCashSession({ branchId, userId });
  return session ? mapSession(session) : null;
}

// ---------------------------------------------------------------------------
// Cierre a ciegas
// ---------------------------------------------------------------------------

// Re-validates the hand-typed breakdown independently of the Zod layer, so
// the rule holds for any non-HTTP caller too, and sums it.
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

// The reveal. The cashier submits what they physically counted; only then
// does the server compute what it expected and hand back both sides plus
// the signed difference. This is the ONE response in the module where
// systemCashTotal/systemCardTotal/cashDifference/cardDifference appear for
// the first time.
//
// Scope of the reconciliation: PaymentMethod.CASH -> systemCashTotal and
// PaymentMethod.CARD -> systemCardTotal, and nothing else. TRANSFER and
// OTHER count toward NEITHER total, deliberately: they correspond to no
// physical thing in a drawer, so there is no blind count a cashier could
// make of them, and folding them into either bucket would manufacture a
// permanent phantom shortfall on every shift that took one. The boss's spec
// only ever describes efectivo and tarjeta, and those are exactly the two
// fields the cashier declares — this reconciliation covers those two, and
// is documented as covering only those two.
//
// Note also what systemCashTotal is NOT: it does not include openingFloat.
// It is purely this shift's cash takings, per spec. The declared count is
// therefore expected to be the takings too — i.e. the opening float is set
// aside before counting, not counted into the drawer total.
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

    // Who may close: the owning cashier always (the normal path, gated on
    // cash.manage at the route). Additionally, a cash.audit holder may close
    // ANY open session — an intentional manager override for the end-of-day
    // sweep when a cashier walked out without cutting their drawer. It is a
    // real judgment call, since it means a manager can submit a count on a
    // cashier's behalf, so the override is recorded distinctly in the audit
    // log below (closedByOwner: false) rather than being indistinguishable
    // from a self-close.
    const isOwner = existing.userId === actorId;
    if (!isOwner) {
      const canAudit = await hasPermission(tx, actorId, "cash.audit");
      if (!canAudit) throw new AppError(403, "Solo el cajero propietario puede cerrar esta caja");
    } else {
      const canManage = await hasPermission(tx, actorId, "cash.manage");
      const canAudit = await hasPermission(tx, actorId, "cash.audit");
      if (!canManage && !canAudit) throw new AppError(403, "Permiso insuficiente");
    }

    // Only now, with the declaration already in hand, is the truth computed.
    // CANCELLED sales are excluded by the repository query, so a sale voided
    // mid-shift simply never counted toward this total.
    const sums = await cashSessionRepo.sumSessionPaymentsByMethod(sessionId, tx);
    let systemCashTotal = 0;
    let systemCardTotal = 0;
    for (const row of sums) {
      const amount = row._sum?.amount ? round2(Number(row._sum.amount)) : 0;
      if (row.method === "CASH") systemCashTotal = amount;
      else if (row.method === "CARD") systemCardTotal = amount;
    }

    // Signed: positive = sobrante (over), negative = faltante (short).
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

// Branch-scoped exactly like saleService.listSales / transferService's
// listTransfers: allBranches sees everything (optionally narrowed by the
// branchId query param), everyone else only their assigned branches, and an
// explicit branchId outside that set is a 403 rather than a silent empty
// list. Gated on cash.audit at the route — broad listing is manager
// oversight, not something a cashier does.
//
// mapSession still applies per row, so an OPEN session appearing in an
// auditor's list ALSO withholds its system totals. That is not an oversight:
// those totals genuinely do not exist until close (nothing has been computed
// or stored), and computing them on the fly here would create a live
// running-total read path — one shoulder-surf away from the cashier it is
// meant to be hidden from. A session reveals its numbers when it is cut,
// through any endpoint, or not at all.
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

  // A cashier may read their own cut (their own declaration, and once
  // closed, their own revealed difference). Reading SOMEONE ELSE'S drawer is
  // manager-grade oversight and needs cash.audit — without this line, any
  // cashier holding a colleague's session id could watch a shift they are
  // not accountable for.
  if (session.userId !== actorId) {
    const canAudit = await hasPermission(prisma, actorId, "cash.audit");
    if (!canAudit) throw new AppError(403, "Sin permiso para ver la caja de otro cajero");
  }

  return mapSession(session);
}
