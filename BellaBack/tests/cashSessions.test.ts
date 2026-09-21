import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { applyMovement } from "../src/services/inventoryService";

// Caja / cash-drawer sessions with a BLIND close.
//
// The invariant every test here ultimately protects: a cashier can never
// learn what the system expects in the drawer until after they have
// committed to a physical count. So alongside the happy paths there are
// explicit assertions that the system-total fields are ABSENT (not merely
// null) from every pre-close read path, and present exactly once — in the
// close response itself.
describe("Caja / cash sessions (blind close)", () => {
  let adminCookie: string;
  let managerCookie: string; // branch_manager: cash.audit, NO cash.manage
  let noPermCookie: string;
  let scopedMgrCookie: string; // branch_manager scoped to branchA only

  let adminUserId: string;

  let branchA: { id: string };
  let category: { id: string };

  const testUsernames: string[] = [];
  const testRoleCodes = ["cash_test_no_perms"];
  const branchIds: string[] = [];
  const productIds: string[] = [];
  const saleIds: string[] = [];
  const sessionIds: string[] = [];

  let cashierRoleId: string;

  async function mkUser(username: string, roleId: string, allBranches = true) {
    const u = await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        firstName: "Caja",
        lastName: username,
        displayName: `Caja ${username}`,
        username,
        email: `${username}@bellamakeup.demo`,
        passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed",
        roleId,
        allBranches,
      },
    });
    if (!testUsernames.includes(username)) testUsernames.push(username);
    return { user: u, cookie: `access_token=${signAccessToken({ sub: u.id, roleId })}` };
  }

  // Each scenario gets its own brand-new branch: openSession enforces one
  // OPEN drawer per branch, so sharing branches across scenarios would make
  // the tests order-dependent on each other's closes.
  async function makeBranch(label: string) {
    const b = await prisma.branch.create({ data: { name: `Caja ${label} ${Date.now()}` } });
    branchIds.push(b.id);
    return b;
  }

  // ...and its own cashier, for the same reason at the user level.
  async function makeCashier(label: string) {
    return mkUser(`cash_test_${label}`, cashierRoleId, true);
  }

  async function makeStockedProduct(sku: string, branchId: string, price: number, stock = 100) {
    const p = await prisma.product.create({
      data: { sku: `${sku}-${Date.now()}`, name: `Producto ${sku}`, price, taxRate: 0, categoryId: category.id, minStock: 0 },
    });
    productIds.push(p.id);
    await applyMovement({ productId: p.id, branchId, type: "PURCHASE", quantity: stock });
    return p;
  }

  async function openSession(cookie: string, branchId: string, openingFloat: number) {
    const res = await request(app).post("/api/cash-sessions").set("Cookie", [cookie]).send({ branchId, openingFloat });
    if (res.body?.id) sessionIds.push(res.body.id);
    return res;
  }

  // Rings up a real POS sale through the real /api/sales route — the same
  // path the POS frontend uses, so the cash-session auto-attach is exercised
  // exactly as it will be in production rather than being stubbed.
  async function sell(
    cookie: string,
    branchId: string,
    productId: string,
    quantity: number,
    payments: Array<{ method: string; amount: number }>
  ) {
    const res = await request(app)
      .post("/api/sales")
      .set("Cookie", [cookie])
      .send({ branchId, items: [{ productId, quantity }], payments });
    if (res.body?.id) saleIds.push(res.body.id);
    return res;
  }

  function closeSession(cookie: string, sessionId: string, body: Record<string, unknown>) {
    return request(app).post(`/api/cash-sessions/${sessionId}/close`).set("Cookie", [cookie]).send(body);
  }

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    cashierRoleId = cashierRole.id;

    const admin = await mkUser("cash_test_admin", adminRole.id, true);
    adminCookie = admin.cookie;
    adminUserId = admin.user.id;

    managerCookie = (await mkUser("cash_test_manager", managerRole.id, true)).cookie;

    const noPermRole = await prisma.role.upsert({
      where: { code: "cash_test_no_perms" },
      update: {},
      create: { code: "cash_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    noPermCookie = (await mkUser("cash_test_noperm", noPermRole.id, true)).cookie;

    category = await prisma.category.create({ data: { name: `Caja Cat ${Date.now()}` } });
    branchA = await makeBranch("A");

    const scopedMgr = await mkUser("cash_test_scoped_mgr", managerRole.id, false);
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: scopedMgr.user.id, branchId: branchA.id } },
      update: {},
      create: { userId: scopedMgr.user.id, branchId: branchA.id },
    });
    scopedMgrCookie = scopedMgr.cookie;
  });

  afterAll(async () => {
    // Sales carry an FK to cash_sessions with no cascade, so they must go
    // first or the session delete fails.
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } }); // cascades SaleItem/SalePayment
    await prisma.cashSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: branchIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.role.deleteMany({ where: { code: { in: testRoleCodes } } }).catch(() => {});
  });

  // -------------------------------------------------------------------------
  describe("POST /api/cash-sessions — apertura", () => {
    let cashier: { user: { id: string }; cookie: string };
    let otherCashier: { user: { id: string }; cookie: string };
    let branchB: { id: string };

    beforeAll(async () => {
      cashier = await makeCashier("open_primary");
      otherCashier = await makeCashier("open_other");
      branchB = await makeBranch("B");
    });

    it("opens a session with a valid float, as OPEN, and reveals no system totals", async () => {
      const res = await openSession(cashier.cookie, branchA.id, 1000);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("OPEN");
      expect(res.body.branchId).toBe(branchA.id);
      expect(res.body.userId).toBe(cashier.user.id);
      expect(Number(res.body.openingFloat)).toBe(1000);
      expect(res.body.openedAt).toBeTruthy();
      expect(res.body.closedAt).toBeNull();
      // Nothing declared yet.
      expect(res.body.declaredCashTotal).toBeNull();
      expect(res.body.declaredCardTotal).toBeNull();
      expect(res.body.declaredCashBreakdown).toBeNull();
      // The blind property: not null, ABSENT.
      expect(res.body.systemCashTotal).toBeUndefined();
      expect(res.body.systemCardTotal).toBeUndefined();
      expect(res.body.cashDifference).toBeUndefined();
      expect(res.body.cardDifference).toBeUndefined();
      // Display-safe user subset only.
      expect(res.body.user.displayName).toBeTruthy();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.pinHash).toBeUndefined();
      expect(res.body.branch).toEqual({ id: branchA.id, name: expect.any(String) });
    });

    it("rejects a negative opening float with 400", async () => {
      const res = await openSession(otherCashier.cookie, branchB.id, -50);
      expect(res.status).toBe(400);
    });

    it("rejects a second open session for the same user, even at a different branch", async () => {
      const res = await openSession(cashier.cookie, branchB.id, 500);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/caja abierta/i);
    });

    it("rejects a second concurrent open session at the same branch for a DIFFERENT user", async () => {
      // otherCashier has no open session of their own, so a 400 here can
      // only come from the one-drawer-per-branch rule.
      const res = await openSession(otherCashier.cookie, branchA.id, 700);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/otro cajero/i);
    });

    it("accepts an opening float of exactly zero (a drawer that genuinely starts empty)", async () => {
      const res = await openSession(otherCashier.cookie, branchB.id, 0);
      expect(res.status).toBe(201);
      expect(Number(res.body.openingFloat)).toBe(0);

      // Close it again so this user/branch pair is free for later scenarios.
      const closed = await closeSession(otherCashier.cookie, res.body.id, {
        cashBreakdown: [{ denomination: 100, count: 0 }],
        cardTotal: 0,
      });
      expect(closed.status).toBe(200);
      expect(closed.body.status).toBe("CLOSED");
    });
  });

  // -------------------------------------------------------------------------
  describe("GET /api/cash-sessions/current", () => {
    it("returns the caller's own open session and NEVER any system total", async () => {
      const res = await request(app)
        .get(`/api/cash-sessions/current?branchId=${branchA.id}`)
        .set("Cookie", [(await makeCashier("open_primary")).cookie]);

      expect(res.status).toBe(200);
      expect(res.body).not.toBeNull();
      expect(res.body.status).toBe("OPEN");
      expect(res.body.branchId).toBe(branchA.id);
      expect(res.body.systemCashTotal).toBeUndefined();
      expect(res.body.systemCardTotal).toBeUndefined();
      expect(res.body.cashDifference).toBeUndefined();
      expect(res.body.cardDifference).toBeUndefined();
      // And no smuggled running total under any other name: the response
      // keys are an exact, reviewed set.
      expect(Object.keys(res.body).sort()).toEqual(
        [
          "branch",
          "branchId",
          "closedAt",
          "declaredCardTotal",
          "declaredCashBreakdown",
          "declaredCashTotal",
          "id",
          "openedAt",
          "openingFloat",
          "status",
          "user",
          "userId",
        ].sort()
      );
    });

    it("returns null at a branch where the caller has no open session", async () => {
      const branch = await makeBranch("current_empty");
      const cashier = await makeCashier("current_empty");
      const res = await request(app)
        .get(`/api/cash-sessions/current?branchId=${branch.id}`)
        .set("Cookie", [cashier.cookie]);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it("never surfaces another cashier's open session as 'current'", async () => {
      const other = await makeCashier("current_other");
      const res = await request(app)
        .get(`/api/cash-sessions/current?branchId=${branchA.id}`) // open, but owned by open_primary
        .set("Cookie", [other.cookie]);
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("POS sale attachment (saleService auto-attach)", () => {
    it("attaches a POS sale rung up during an open session to that session", async () => {
      const cashier = await makeCashier("open_primary"); // owns the open session at branchA
      const product = await makeStockedProduct("CAJA-ATTACH", branchA.id, 100);

      const res = await sell(cashier.cookie, branchA.id, product.id, 1, [{ method: "CASH", amount: 100 }]);
      expect(res.status).toBe(201);

      const stored = await prisma.sale.findUniqueOrThrow({ where: { id: res.body.id } });
      const session = await prisma.cashSession.findFirstOrThrow({
        where: { branchId: branchA.id, userId: cashier.user.id, status: "OPEN" },
      });
      expect(stored.cashSessionId).toBe(session.id);
    });

    it("leaves cashSessionId null for a sale rung up by someone with no open session", async () => {
      const product = await makeStockedProduct("CAJA-NOSESSION", branchA.id, 100);
      // admin has allBranches and no open drawer of their own.
      const res = await sell(adminCookie, branchA.id, product.id, 1, [{ method: "CASH", amount: 100 }]);
      expect(res.status).toBe(201);

      const stored = await prisma.sale.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.userId).toBe(adminUserId);
      expect(stored.cashSessionId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("POST /api/cash-sessions/:id/close — cierre a ciegas", () => {
    it("an exact blind count closes as CLOSED with both differences exactly zero", async () => {
      const branch = await makeBranch("exact");
      const cashier = await makeCashier("exact");
      const product = await makeStockedProduct("CAJA-EXACT", branch.id, 100);

      const opened = await openSession(cashier.cookie, branch.id, 500);
      expect(opened.status).toBe(201);

      // 2 x 100 in cash, 1 x 100 on card => system: cash 200, card 100.
      expect((await sell(cashier.cookie, branch.id, product.id, 2, [{ method: "CASH", amount: 200 }])).status).toBe(201);
      expect((await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "CARD", amount: 100 }])).status).toBe(201);

      const res = await closeSession(cashier.cookie, opened.body.id, {
        cashBreakdown: [
          { denomination: 100, count: 1 },
          { denomination: 50, count: 2 },
        ],
        cardTotal: 100,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CLOSED");
      expect(Number(res.body.declaredCashTotal)).toBe(200);
      expect(Number(res.body.declaredCardTotal)).toBe(100);
      // The reveal — present for the first time, and correct.
      expect(Number(res.body.systemCashTotal)).toBe(200);
      expect(Number(res.body.systemCardTotal)).toBe(100);
      expect(Number(res.body.cashDifference)).toBe(0);
      expect(Number(res.body.cardDifference)).toBe(0);
      expect(res.body.closedAt).toBeTruthy();
      expect(res.body.declaredCashBreakdown).toEqual([
        { denomination: 100, count: 1 },
        { denomination: 50, count: 2 },
      ]);
    });

    it("a SHORT cash count closes as CLOSED_WITH_DISCREPANCY with a negative cashDifference", async () => {
      const branch = await makeBranch("short");
      const cashier = await makeCashier("short");
      const product = await makeStockedProduct("CAJA-SHORT", branch.id, 100);

      const opened = await openSession(cashier.cookie, branch.id, 0);
      expect((await sell(cashier.cookie, branch.id, product.id, 3, [{ method: "CASH", amount: 300 }])).status).toBe(201);

      // Counted only 200 of the 300 the system took.
      const res = await closeSession(cashier.cookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 2 }],
        cardTotal: 0,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CLOSED_WITH_DISCREPANCY");
      expect(Number(res.body.systemCashTotal)).toBe(300);
      expect(Number(res.body.declaredCashTotal)).toBe(200);
      expect(Number(res.body.cashDifference)).toBe(-100); // signed: short
      expect(Number(res.body.cardDifference)).toBe(0);
    });

    it("an OVER card count closes as CLOSED_WITH_DISCREPANCY with a positive cardDifference", async () => {
      const branch = await makeBranch("over");
      const cashier = await makeCashier("over");
      const product = await makeStockedProduct("CAJA-OVER", branch.id, 100);

      const opened = await openSession(cashier.cookie, branch.id, 0);
      expect((await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "CARD", amount: 100 }])).status).toBe(201);

      const res = await closeSession(cashier.cookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 0 }],
        cardTotal: 150,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CLOSED_WITH_DISCREPANCY");
      expect(Number(res.body.systemCardTotal)).toBe(100);
      expect(Number(res.body.declaredCardTotal)).toBe(150);
      expect(Number(res.body.cardDifference)).toBe(50); // signed: over
      expect(Number(res.body.cashDifference)).toBe(0);
    });

    it("TRANSFER and OTHER payments count toward neither declared bucket", async () => {
      const branch = await makeBranch("transfer");
      const cashier = await makeCashier("transfer");
      const product = await makeStockedProduct("CAJA-TRANSFER", branch.id, 100);

      const opened = await openSession(cashier.cookie, branch.id, 0);
      expect((await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "CASH", amount: 100 }])).status).toBe(201);
      expect((await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "TRANSFER", amount: 100 }])).status).toBe(201);
      expect((await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "OTHER", amount: 100 }])).status).toBe(201);

      const res = await closeSession(cashier.cookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 1 }],
        cardTotal: 0,
      });

      expect(res.status).toBe(200);
      // The 200 taken by transfer/other is in neither bucket, so a drawer
      // holding only the 100 cash still cuadra.
      expect(Number(res.body.systemCashTotal)).toBe(100);
      expect(Number(res.body.systemCardTotal)).toBe(0);
      expect(res.body.status).toBe("CLOSED");
    });

    it("a sale CANCELLED during the shift does not count toward the close-time system total", async () => {
      const branch = await makeBranch("cancel");
      const cashier = await makeCashier("cancel");
      const product = await makeStockedProduct("CAJA-CANCEL", branch.id, 100);

      const opened = await openSession(cashier.cookie, branch.id, 0);

      const kept = await sell(cashier.cookie, branch.id, product.id, 2, [{ method: "CASH", amount: 200 }]);
      expect(kept.status).toBe(201);
      const voided = await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "CASH", amount: 150 }]);
      expect(voided.status).toBe(201);

      // Cancelled by an admin (the seeded Vendedor/Cajero has no
      // sales.cancel), mid-shift, exactly as a real void would happen.
      const cancelRes = await request(app)
        .patch(`/api/sales/${voided.body.id}/cancel`)
        .set("Cookie", [adminCookie])
        .send({ reason: "Cobro duplicado en caja" });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe("CANCELLED");

      // The cancelled sale keeps its cashSessionId — it is simply excluded
      // from the aggregate by its status, which is the point.
      const storedVoid = await prisma.sale.findUniqueOrThrow({ where: { id: voided.body.id } });
      expect(storedVoid.cashSessionId).toBe(opened.body.id);

      const res = await closeSession(cashier.cookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 2 }],
        cardTotal: 0,
      });

      expect(res.status).toBe(200);
      expect(Number(res.body.systemCashTotal)).toBe(200); // 200 kept, NOT 350
      expect(Number(res.body.cashDifference)).toBe(0);
      expect(res.body.status).toBe("CLOSED");
    });

    it("rejects closing an already-CLOSED session with 400", async () => {
      const branch = await makeBranch("reclose");
      const cashier = await makeCashier("reclose");
      const opened = await openSession(cashier.cookie, branch.id, 100);

      const first = await closeSession(cashier.cookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 0 }],
        cardTotal: 0,
      });
      expect(first.status).toBe(200);

      const second = await closeSession(cashier.cookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 0 }],
        cardTotal: 0,
      });
      expect(second.status).toBe(400);
      expect(second.body.message).toMatch(/ya fue cerrada/i);
    });

    it("rejects garbage in the hand-typed breakdown (fractional counts, non-positive denominations, negative card)", async () => {
      const branch = await makeBranch("garbage");
      const cashier = await makeCashier("garbage");
      const opened = await openSession(cashier.cookie, branch.id, 0);
      const id = opened.body.id;

      expect((await closeSession(cashier.cookie, id, { cashBreakdown: [{ denomination: 50, count: 2.5 }], cardTotal: 0 })).status).toBe(400);
      expect((await closeSession(cashier.cookie, id, { cashBreakdown: [{ denomination: 50, count: -1 }], cardTotal: 0 })).status).toBe(400);
      expect((await closeSession(cashier.cookie, id, { cashBreakdown: [{ denomination: 0, count: 3 }], cardTotal: 0 })).status).toBe(400);
      expect((await closeSession(cashier.cookie, id, { cashBreakdown: [{ denomination: -20, count: 3 }], cardTotal: 0 })).status).toBe(400);
      expect((await closeSession(cashier.cookie, id, { cashBreakdown: [], cardTotal: 0 })).status).toBe(400);
      expect((await closeSession(cashier.cookie, id, { cashBreakdown: [{ denomination: 50, count: 1 }], cardTotal: -5 })).status).toBe(400);

      // None of that touched the session.
      const still = await prisma.cashSession.findUniqueOrThrow({ where: { id } });
      expect(still.status).toBe("OPEN");
      expect(still.declaredCashTotal).toBeNull();
    });

    it("a cashier cannot close ANOTHER cashier's session (403)", async () => {
      const branch = await makeBranch("foreign_close");
      const owner = await makeCashier("foreign_owner");
      const intruder = await makeCashier("foreign_intruder");
      const opened = await openSession(owner.cookie, branch.id, 0);

      const res = await closeSession(intruder.cookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 1 }],
        cardTotal: 0,
      });
      expect(res.status).toBe(403);
    });

    it("a cash.audit holder CAN close a forgotten session on the cashier's behalf (documented manager override)", async () => {
      const branch = await makeBranch("override");
      const cashier = await makeCashier("override");
      const product = await makeStockedProduct("CAJA-OVERRIDE", branch.id, 100);
      const opened = await openSession(cashier.cookie, branch.id, 0);
      expect((await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "CASH", amount: 100 }])).status).toBe(201);

      // managerCookie is a branch_manager: cash.audit, NO cash.manage.
      const res = await closeSession(managerCookie, opened.body.id, {
        cashBreakdown: [{ denomination: 100, count: 1 }],
        cardTotal: 0,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CLOSED");
      expect(Number(res.body.systemCashTotal)).toBe(100);
      // The session still belongs to the cashier, not the manager.
      expect(res.body.userId).toBe(cashier.user.id);

      // The override is recorded distinctly, not as a self-close.
      const log = await prisma.auditLog.findFirst({
        where: { action: "cash.close", entityId: opened.body.id },
        orderBy: { createdAt: "desc" },
      });
      expect((log?.details as Record<string, unknown>)?.closedByOwner).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("GET /api/cash-sessions and GET /api/cash-sessions/:id", () => {
    it("an OPEN session still withholds its system totals when read through the audit list", async () => {
      const res = await request(app).get(`/api/cash-sessions?branchId=${branchA.id}`).set("Cookie", [adminCookie]);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const open = res.body.find((s: Record<string, unknown>) => s.status === "OPEN");
      expect(open).toBeTruthy();
      expect(open.systemCashTotal).toBeUndefined();
      expect(open.cashDifference).toBeUndefined();
    });

    it("a CLOSED session reveals its totals through the audit list and detail endpoints", async () => {
      const branch = await makeBranch("listclosed");
      const cashier = await makeCashier("listclosed");
      const product = await makeStockedProduct("CAJA-LISTCLOSED", branch.id, 100);
      const opened = await openSession(cashier.cookie, branch.id, 0);
      await sell(cashier.cookie, branch.id, product.id, 1, [{ method: "CASH", amount: 100 }]);
      await closeSession(cashier.cookie, opened.body.id, { cashBreakdown: [{ denomination: 50, count: 1 }], cardTotal: 0 });

      const listRes = await request(app).get(`/api/cash-sessions?branchId=${branch.id}`).set("Cookie", [adminCookie]);
      expect(listRes.status).toBe(200);
      const row = listRes.body.find((s: Record<string, string>) => s.id === opened.body.id);
      expect(Number(row.systemCashTotal)).toBe(100);
      expect(Number(row.cashDifference)).toBe(-50);

      const detailRes = await request(app).get(`/api/cash-sessions/${opened.body.id}`).set("Cookie", [managerCookie]);
      expect(detailRes.status).toBe(200);
      expect(Number(detailRes.body.systemCashTotal)).toBe(100);
      expect(detailRes.body.status).toBe("CLOSED_WITH_DISCREPANCY");
    });

    it("filters by status and branch", async () => {
      const res = await request(app)
        .get(`/api/cash-sessions?branchId=${branchA.id}&status=OPEN`)
        .set("Cookie", [adminCookie]);
      expect(res.status).toBe(200);
      expect(res.body.every((s: Record<string, string>) => s.status === "OPEN" && s.branchId === branchA.id)).toBe(true);
    });

    it("a cashier CAN read their own session by id", async () => {
      const branch = await makeBranch("ownread");
      const cashier = await makeCashier("ownread");
      const opened = await openSession(cashier.cookie, branch.id, 250);

      const res = await request(app).get(`/api/cash-sessions/${opened.body.id}`).set("Cookie", [cashier.cookie]);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(opened.body.id);
      expect(res.body.systemCashTotal).toBeUndefined();
    });

    it("a branch-scoped auditor is restricted to their assigned branches", async () => {
      const otherBranch = await makeBranch("scoped_denied");
      const denied = await request(app)
        .get(`/api/cash-sessions?branchId=${otherBranch.id}`)
        .set("Cookie", [scopedMgrCookie]);
      expect(denied.status).toBe(403);

      const allowed = await request(app).get("/api/cash-sessions").set("Cookie", [scopedMgrCookie]);
      expect(allowed.status).toBe(200);
      expect(allowed.body.every((s: Record<string, string>) => s.branchId === branchA.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("Permission gates", () => {
    let foreignSessionId: string;
    let outsiderCookie: string;

    beforeAll(async () => {
      const branch = await makeBranch("perm");
      const owner = await makeCashier("perm_owner");
      const opened = await openSession(owner.cookie, branch.id, 0);
      foreignSessionId = opened.body.id;
      outsiderCookie = (await makeCashier("perm_outsider")).cookie;
    });

    it("POST /api/cash-sessions requires cash.manage (403 without it)", async () => {
      const res = await request(app)
        .post("/api/cash-sessions")
        .set("Cookie", [noPermCookie])
        .send({ branchId: branchA.id, openingFloat: 100 });
      expect(res.status).toBe(403);
    });

    it("a branch_manager (cash.audit but no cash.manage) cannot open a drawer of their own (403)", async () => {
      const branch = await makeBranch("mgr_open");
      const res = await request(app)
        .post("/api/cash-sessions")
        .set("Cookie", [managerCookie])
        .send({ branchId: branch.id, openingFloat: 100 });
      expect(res.status).toBe(403);
    });

    it("POST /:id/close requires cash.manage or cash.audit (403 with neither)", async () => {
      const res = await closeSession(noPermCookie, foreignSessionId, {
        cashBreakdown: [{ denomination: 100, count: 1 }],
        cardTotal: 0,
      });
      expect(res.status).toBe(403);
    });

    it("GET /api/cash-sessions (broad listing) requires cash.audit — a cashier gets 403", async () => {
      const res = await request(app).get("/api/cash-sessions").set("Cookie", [outsiderCookie]);
      expect(res.status).toBe(403);
    });

    it("GET /api/cash-sessions/:id on ANOTHER cashier's session requires cash.audit — 403 without it", async () => {
      const res = await request(app).get(`/api/cash-sessions/${foreignSessionId}`).set("Cookie", [outsiderCookie]);
      expect(res.status).toBe(403);
    });

    it("GET /api/cash-sessions/current requires cash.manage — a cash.audit-only manager gets 403", async () => {
      const res = await request(app)
        .get(`/api/cash-sessions/current?branchId=${branchA.id}`)
        .set("Cookie", [managerCookie]);
      expect(res.status).toBe(403);
    });

    it("requires authentication on every route", async () => {
      expect((await request(app).get("/api/cash-sessions")).status).toBe(401);
      expect((await request(app).get(`/api/cash-sessions/current?branchId=${branchA.id}`)).status).toBe(401);
      expect((await request(app).get(`/api/cash-sessions/${foreignSessionId}`)).status).toBe(401);
      expect((await request(app).post("/api/cash-sessions").send({})).status).toBe(401);
      expect((await request(app).post(`/api/cash-sessions/${foreignSessionId}/close`).send({})).status).toBe(401);
    });
  });
});
