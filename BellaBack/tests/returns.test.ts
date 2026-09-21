import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { PIN_GENERIC_ERROR } from "../src/services/pinAuthService";

// Devoluciones y cambios.
//
// Rate-limit note that shapes this whole file (same constraint documented in
// pinAuth.test.ts): POST /api/returns carries a PIN attempt limiter of 5
// FAILED PIN authorizations per 15 minutes keyed on the ACTING user's id.
// Only 401s consume that budget (see middleware/pinAttemptLimiter.ts), so
// the many deliberate 400s below are free — but the wrong-PIN tests use
// their own dedicated actor so they can never exhaust the main cashier's
// budget and turn an unrelated assertion into a misleading 429.
describe("Devoluciones y cambios (returns / exchanges)", () => {
  const PASSWORD = "Password#123";
  const SUPERVISOR_PIN = "8642"; // branch_manager => holds returns.authorize
  const WRONG_PIN = "1111";
  const CASHIER_OWN_PIN = "2468"; // a valid PIN whose owner CANNOT authorize

  let cashierCookie: string; // sales.create + returns.create/view
  let cashierId: string;
  let pinFailCookie: string; // dedicated actor for wrong-PIN attempts
  let managerCookie: string; // returns.view + returns.authorize, no returns.create
  let noPermCookie: string;
  let scopedCashierCookie: string; // cashier scoped to branchB only
  let supervisorId: string;

  let branchA: { id: string };
  let branchB: { id: string };
  let category: { id: string };

  const productIds: string[] = [];
  const saleIds: string[] = [];
  const returnIds: string[] = [];
  const testUsernames = [
    "returns_test_cashier",
    "returns_test_pinfail",
    "returns_test_manager",
    "returns_test_noperm",
    "returns_test_scoped",
    "returns_test_cashier_pin",
  ];
  const testRoleCodes = ["returns_test_no_perms"];

  async function stockAt(productId: string, branchId: string, variantId?: string) {
    const row = await prisma.inventory.findFirst({ where: { productId, branchId, variantId: variantId ?? null } });
    return row?.stock ?? 0;
  }

  async function makeProduct(sku: string, price: number, cost = 10) {
    const p = await prisma.product.create({
      data: {
        sku: `${sku}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Producto ${sku}`,
        price,
        cost,
        taxRate: 0,
        categoryId: category.id,
        minStock: 1,
      },
    });
    productIds.push(p.id);
    return p;
  }

  // Puts real stock on the shelf the only way this app allows: through
  // applyMovement, via a real purchase-style adjustment. Uses prisma
  // directly for setup speed, mirroring how transfers/purchases tests seed
  // their fixtures.
  async function giveStock(productId: string, branchId: string, qty: number) {
    await prisma.inventory.create({ data: { productId, branchId, stock: qty } });
  }

  // Rings up a REAL sale through the POS endpoint, so every return below is
  // tested against a genuine Sale/SaleItem graph rather than hand-built rows.
  async function ringUpSale(items: Array<{ productId: string; quantity: number; discount?: number }>, branchId: string) {
    const res = await request(app)
      .post("/api/sales")
      .set("Cookie", [cashierCookie])
      .send({
        branchId,
        items,
        // Deliberately generous so payment never gates the fixture.
        payments: [{ method: "CASH", amount: 100000 }],
      });
    if (res.body?.id) saleIds.push(res.body.id);
    return res;
  }

  async function postReturn(body: Record<string, unknown>, cookie = cashierCookie) {
    const res = await request(app).post("/api/returns").set("Cookie", [cookie]).send(body);
    if (res.body?.id) returnIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });

    category = await prisma.category.create({ data: { name: `Returns Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `Returns Sucursal A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Returns Sucursal B ${Date.now()}` } });

    const mk = async (username: string, roleId: string, allBranches: boolean, pin?: string, branchId?: string) => {
      const u = await prisma.user.upsert({
        where: { username },
        update: {},
        create: {
          firstName: "Returns",
          lastName: username,
          displayName: `Returns ${username}`,
          username,
          email: `${username}@bellamakeup.demo`,
          passwordHash: await hashPassword(PASSWORD),
          avatarSeed: "seed",
          roleId,
          allBranches,
          pinHash: pin ? await hashPassword(pin) : null,
        },
      });
      if (branchId) {
        await prisma.userBranch.upsert({
          where: { userId_branchId: { userId: u.id, branchId } },
          update: {},
          create: { userId: u.id, branchId },
        });
      }
      return { user: u, cookie: `access_token=${signAccessToken({ sub: u.id, roleId })}` };
    };

    const cashier = await mk("returns_test_cashier", cashierRole.id, true);
    cashierCookie = cashier.cookie;
    cashierId = cashier.user.id;

    pinFailCookie = (await mk("returns_test_pinfail", cashierRole.id, true)).cookie;

    // The supervisor: branch_manager holds returns.authorize per the seed.
    const manager = await mk("returns_test_manager", managerRole.id, true, SUPERVISOR_PIN);
    managerCookie = manager.cookie;
    supervisorId = manager.user.id;

    // A cashier WITH a PIN set — proves the permission filter, not the mere
    // existence of a PIN, is what authorizes a return.
    await mk("returns_test_cashier_pin", cashierRole.id, true, CASHIER_OWN_PIN);

    const noPermRole = await prisma.role.upsert({
      where: { code: "returns_test_no_perms" },
      update: {},
      create: { code: "returns_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    noPermCookie = (await mk("returns_test_noperm", noPermRole.id, true)).cookie;

    scopedCashierCookie = (await mk("returns_test_scoped", cashierRole.id, false, undefined, branchB.id)).cookie;
  });

  afterAll(async () => {
    await prisma.return.deleteMany({ where: { id: { in: returnIds } } }); // cascades ReturnItem
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } }); // cascades SaleItem/SalePayment
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.role.deleteMany({ where: { code: { in: testRoleCodes } } }).catch(() => {});
  });

  describe("Pure refund (no new items)", () => {
    it("credits what the customer actually paid, nets a negative balance and resolves REFUND_OWED", async () => {
      const product = await makeProduct("RET-REFUND", 250);
      await giveStock(product.id, branchA.id, 10);

      const sale = await ringUpSale([{ productId: product.id, quantity: 2 }], branchA.id);
      expect(sale.status).toBe(201);
      expect(await stockAt(product.id, branchA.id)).toBe(8);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 2, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(Number(res.body.returnedTotal)).toBe(500);
      expect(Number(res.body.newItemsTotal)).toBe(0);
      expect(Number(res.body.balance)).toBe(-500);
      expect(res.body.resolution).toBe("REFUND_OWED");
      expect(res.body.returnNumber).toMatch(/^D-\d{6}$/);
      expect(res.body.originalTicketNumber).toBe(sale.body.ticketNumber);
      // Both parties recorded: the cashier who ran it and the supervisor
      // whose PIN matched.
      expect(res.body.processedByUserId).toBe(cashierId);
      expect(res.body.authorizedByUserId).toBe(supervisorId);
      // Pure refund: no payment method, nothing was collected.
      expect(res.body.paymentMethod).toBeNull();

      expect(await stockAt(product.id, branchA.id)).toBe(10);
    });

    it("credits the ORIGINAL discounted price, not today's list price", async () => {
      const product = await makeProduct("RET-DISCOUNT", 200);
      await giveStock(product.id, branchA.id, 5);

      // 1 unit at 200 with a 20 discount => the customer paid 180 for the
      // line. unitPrice stays 200 on the SaleItem, so the credit is
      // quantity * unitPrice. This test pins the documented rule: the
      // snapshot comes from the original SaleItem, not from Product.price
      // read fresh today.
      const sale = await ringUpSale([{ productId: product.id, quantity: 1, discount: 20 }], branchA.id);
      expect(sale.status).toBe(201);

      // Now the shelf price changes. The credit must NOT follow it.
      await prisma.product.update({ where: { id: product.id }, data: { price: 999 } });

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(Number(res.body.returnedTotal)).toBe(200);
      expect(Number(res.body.items.find((i: { direction: string }) => i.direction === "RETURNED").unitPrice)).toBe(200);
    });
  });

  describe("Exchanges", () => {
    it("an even exchange nets to zero and resolves EXACT_EXCHANGE", async () => {
      const returned = await makeProduct("RET-EVEN-A", 300);
      const taken = await makeProduct("RET-EVEN-B", 300);
      await giveStock(returned.id, branchA.id, 5);
      await giveStock(taken.id, branchA.id, 5);

      const sale = await ringUpSale([{ productId: returned.id, quantity: 1 }], branchA.id);
      expect(sale.status).toBe(201);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        newItems: [{ productId: taken.id, quantity: 1 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(Number(res.body.returnedTotal)).toBe(300);
      expect(Number(res.body.newItemsTotal)).toBe(300);
      expect(Number(res.body.balance)).toBe(0);
      expect(res.body.resolution).toBe("EXACT_EXCHANGE");

      // One item back on the shelf, one off it.
      expect(await stockAt(returned.id, branchA.id)).toBe(5);
      expect(await stockAt(taken.id, branchA.id)).toBe(4);
    });

    it("an upgrade computes a positive balance and resolves CUSTOMER_OWES", async () => {
      const returned = await makeProduct("RET-UP-A", 150);
      const taken = await makeProduct("RET-UP-B", 400);
      await giveStock(returned.id, branchA.id, 5);
      await giveStock(taken.id, branchA.id, 5);

      const sale = await ringUpSale([{ productId: returned.id, quantity: 1 }], branchA.id);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        newItems: [{ productId: taken.id, quantity: 1 }],
        pinCode: SUPERVISOR_PIN,
        paymentMethod: "CARD",
      });

      expect(res.status).toBe(201);
      expect(Number(res.body.returnedTotal)).toBe(150);
      expect(Number(res.body.newItemsTotal)).toBe(400);
      expect(Number(res.body.balance)).toBe(250);
      expect(res.body.resolution).toBe("CUSTOMER_OWES");
      expect(res.body.paymentMethod).toBe("CARD");
    });

    it("requires a payment method when the customer owes the difference", async () => {
      const returned = await makeProduct("RET-NOPAY-A", 100);
      const taken = await makeProduct("RET-NOPAY-B", 500);
      await giveStock(returned.id, branchA.id, 3);
      await giveStock(taken.id, branchA.id, 3);

      const sale = await ringUpSale([{ productId: returned.id, quantity: 1 }], branchA.id);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        newItems: [{ productId: taken.id, quantity: 1 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/método de pago/i);
      // Nothing written, nothing moved.
      expect(await stockAt(taken.id, branchA.id)).toBe(3);
    });

    it("prices the NEW item at CURRENT pricing, not the old ticket's", async () => {
      const returned = await makeProduct("RET-PRICE-A", 100);
      const taken = await makeProduct("RET-PRICE-B", 200);
      await giveStock(returned.id, branchA.id, 3);
      await giveStock(taken.id, branchA.id, 3);

      const sale = await ringUpSale([{ productId: returned.id, quantity: 1 }], branchA.id);

      // A promo lands on the new item between the sale and the exchange.
      await prisma.product.update({ where: { id: taken.id }, data: { promoPrice: 120 } });

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        newItems: [{ productId: taken.id, quantity: 1 }],
        pinCode: SUPERVISOR_PIN,
        paymentMethod: "CASH",
      });

      expect(res.status).toBe(201);
      // 120 (today's promo), not 200.
      expect(Number(res.body.newItemsTotal)).toBe(120);
      expect(Number(res.body.balance)).toBe(20);
      expect(res.body.resolution).toBe("CUSTOMER_OWES");
    });

    it("rejects an exchange for an item the branch does not have enough of, with zero side effects", async () => {
      const returned = await makeProduct("RET-NOSTOCK-A", 100);
      const taken = await makeProduct("RET-NOSTOCK-B", 100);
      await giveStock(returned.id, branchA.id, 3);
      await giveStock(taken.id, branchA.id, 1);

      const sale = await ringUpSale([{ productId: returned.id, quantity: 1 }], branchA.id);
      const returnedStockBefore = await stockAt(returned.id, branchA.id);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        newItems: [{ productId: taken.id, quantity: 5 }],
        pinCode: SUPERVISOR_PIN,
        paymentMethod: "CASH",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/[Ss]tock insuficiente/);
      // The returned line must NOT have been restocked by a half-applied
      // transaction: the whole thing is one atomic unit.
      expect(await stockAt(returned.id, branchA.id)).toBe(returnedStockBefore);
      expect(await stockAt(taken.id, branchA.id)).toBe(1);
      expect(await prisma.return.count({ where: { originalSaleId: sale.body.id } })).toBe(0);
    });
  });

  describe("Restock flag", () => {
    it("a restocked line increments stock and a non-restocked line does NOT, in the same return", async () => {
      const good = await makeProduct("RET-GOOD", 100);
      const damaged = await makeProduct("RET-DAMAGED", 100);
      await giveStock(good.id, branchA.id, 10);
      await giveStock(damaged.id, branchA.id, 10);

      const sale = await ringUpSale(
        [
          { productId: good.id, quantity: 2 },
          { productId: damaged.id, quantity: 2 },
        ],
        branchA.id
      );
      expect(sale.status).toBe(201);
      expect(await stockAt(good.id, branchA.id)).toBe(8);
      expect(await stockAt(damaged.id, branchA.id)).toBe(8);

      const goodLine = sale.body.items.find((i: { productId: string }) => i.productId === good.id);
      const damagedLine = sale.body.items.find((i: { productId: string }) => i.productId === damaged.id);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [
          { saleItemId: goodLine.id, quantity: 2, restock: true },
          { saleItemId: damagedLine.id, quantity: 2, restock: false },
        ],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      // The customer is credited for BOTH lines — damaged goods are still
      // refunded; they just don't go back on the shelf.
      expect(Number(res.body.returnedTotal)).toBe(400);

      expect(await stockAt(good.id, branchA.id)).toBe(10); // 8 + 2 restocked
      expect(await stockAt(damaged.id, branchA.id)).toBe(8); // unchanged

      // Exactly one RETURN movement, for the restocked line only.
      const movements = await prisma.inventoryMovement.findMany({ where: { reference: res.body.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe("RETURN");
      expect(movements[0].productId).toBe(good.id);
      expect(movements[0].quantity).toBe(2);

      // But BOTH lines are recorded for audit, with restocked telling them
      // apart.
      const items = res.body.items.filter((i: { direction: string }) => i.direction === "RETURNED");
      expect(items).toHaveLength(2);
      expect(items.find((i: { productId: string }) => i.productId === good.id).restocked).toBe(true);
      expect(items.find((i: { productId: string }) => i.productId === damaged.id).restocked).toBe(false);
    });
  });

  describe("Over-return limit", () => {
    it("rejects returning more than was purchased on a line in a single attempt", async () => {
      const product = await makeProduct("RET-OVER-ONE", 100);
      await giveStock(product.id, branchA.id, 10);

      const sale = await ringUpSale([{ productId: product.id, quantity: 2 }], branchA.id);
      const stockBefore = await stockAt(product.id, branchA.id);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 3, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no se puede devolver/i);
      expect(await stockAt(product.id, branchA.id)).toBe(stockBefore);
      expect(await prisma.return.count({ where: { originalSaleId: sale.body.id } })).toBe(0);
    });

    // THE case this module is easiest to get subtly wrong on: each partial
    // return is individually legal, but their SUM exceeds what was bought.
    // A check that only looks at the current request would let this through.
    it("rejects a cumulative over-return across multiple prior partial returns", async () => {
      const product = await makeProduct("RET-OVER-CUM", 100);
      await giveStock(product.id, branchA.id, 20);

      const sale = await ringUpSale([{ productId: product.id, quantity: 5 }], branchA.id);
      const saleItemId = sale.body.items[0].id;

      // Return 2 of 5 — fine.
      const first = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId, quantity: 2, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });
      expect(first.status).toBe(201);

      // Return 2 more (4 of 5 total) — still fine.
      const second = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId, quantity: 2, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });
      expect(second.status).toBe(201);

      const stockAfterTwo = await stockAt(product.id, branchA.id);

      // Now try 2 more: that would be 6 of 5. Individually plausible,
      // cumulatively impossible.
      const third = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId, quantity: 2, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(third.status).toBe(400);
      expect(third.body.message).toMatch(/ya se devolvieron 4/);
      expect(third.body.message).toMatch(/quedan 1/);
      expect(await stockAt(product.id, branchA.id)).toBe(stockAfterTwo);

      // The 5th unit is still returnable — the limit is exact, not a blanket
      // lockout after the first partial return.
      const fourth = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId, quantity: 1, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });
      expect(fourth.status).toBe(201);

      // And now the line is fully exhausted.
      const fifth = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId, quantity: 1, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });
      expect(fifth.status).toBe(400);
      expect(fifth.body.message).toMatch(/quedan 0/);

      // Ground truth: 5 bought, 5 returned across 3 successful documents.
      const totalReturned = await prisma.returnItem.aggregate({
        where: { saleItemId, direction: "RETURNED" },
        _sum: { quantity: true },
      });
      expect(totalReturned._sum.quantity).toBe(5);
    });

    it("rejects a line that belongs to a different sale", async () => {
      const product = await makeProduct("RET-FOREIGN", 100);
      await giveStock(product.id, branchA.id, 10);

      const saleOne = await ringUpSale([{ productId: product.id, quantity: 1 }], branchA.id);
      const saleTwo = await ringUpSale([{ productId: product.id, quantity: 1 }], branchA.id);

      const res = await postReturn({
        originalSaleId: saleOne.body.id,
        // A real SaleItem id, but from the OTHER ticket.
        returnedItems: [{ saleItemId: saleTwo.body.items[0].id, quantity: 1, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no pertenece a esta venta/i);
    });

    it("rejects repeated lines in one request", async () => {
      const product = await makeProduct("RET-DUP", 100);
      await giveStock(product.id, branchA.id, 10);
      const sale = await ringUpSale([{ productId: product.id, quantity: 3 }], branchA.id);
      const saleItemId = sale.body.items[0].id;

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [
          { saleItemId, quantity: 2, restock: true },
          { saleItemId, quantity: 2, restock: false },
        ],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/repetidas/i);
    });

    it("refuses to return against an already-cancelled sale", async () => {
      const product = await makeProduct("RET-CANCELLED", 100);
      await giveStock(product.id, branchA.id, 10);
      const sale = await ringUpSale([{ productId: product.id, quantity: 1 }], branchA.id);

      const cancelled = await request(app)
        .patch(`/api/sales/${sale.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Prueba de devolución sobre venta cancelada" });
      expect(cancelled.status).toBe(200);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cancelada/i);
    });

    it("returns 404 for an unknown original sale", async () => {
      const res = await postReturn({
        originalSaleId: "00000000-0000-0000-0000-0000000000ff",
        returnedItems: [{ saleItemId: "00000000-0000-0000-0000-0000000000fe", quantity: 1, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Supervisor PIN authorization", () => {
    // The zero-side-effects guarantee, asserted exhaustively: not just "no
    // stock change", but no Return row, no ReturnItem row and no
    // InventoryMovement anywhere.
    it("rejects a wrong PIN with the exact generic message and writes NOTHING", async () => {
      const product = await makeProduct("RET-BADPIN", 100);
      await giveStock(product.id, branchA.id, 10);
      const sale = await ringUpSale([{ productId: product.id, quantity: 2 }], branchA.id);

      const stockBefore = await stockAt(product.id, branchA.id);
      const returnsBefore = await prisma.return.count();
      const returnItemsBefore = await prisma.returnItem.count();
      const movementsBefore = await prisma.inventoryMovement.count({ where: { productId: product.id } });

      const res = await request(app)
        .post("/api/returns")
        .set("Cookie", [pinFailCookie])
        .send({
          originalSaleId: sale.body.id,
          returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 2, restock: true }],
          pinCode: WRONG_PIN,
        });

      expect(res.status).toBe(401);
      // The EXACT message the primitive exports — not a paraphrase, and not
      // a more specific one.
      expect(res.body.message).toBe(PIN_GENERIC_ERROR);

      expect(await stockAt(product.id, branchA.id)).toBe(stockBefore);
      expect(await prisma.return.count()).toBe(returnsBefore);
      expect(await prisma.returnItem.count()).toBe(returnItemsBefore);
      expect(await prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(movementsBefore);
    });

    it("rejects a valid PIN whose owner lacks returns.authorize, with the same generic message", async () => {
      const product = await makeProduct("RET-CASHIERPIN", 100);
      await giveStock(product.id, branchA.id, 10);
      const sale = await ringUpSale([{ productId: product.id, quantity: 1 }], branchA.id);

      const res = await request(app)
        .post("/api/returns")
        .set("Cookie", [pinFailCookie])
        .send({
          originalSaleId: sale.body.id,
          returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
          // A real, correct PIN — but it belongs to a cashier, and cashiers
          // do not hold returns.authorize. Indistinguishable from a wrong
          // PIN by design.
          pinCode: CASHIER_OWN_PIN,
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(PIN_GENERIC_ERROR);
      expect(await prisma.return.count({ where: { originalSaleId: sale.body.id } })).toBe(0);
    });

    it("records the supervisor, never the PIN or its hash", async () => {
      const product = await makeProduct("RET-NOLEAK", 100);
      await giveStock(product.id, branchA.id, 5);
      const sale = await ringUpSale([{ productId: product.id, quantity: 1 }], branchA.id);

      const res = await postReturn({
        originalSaleId: sale.body.id,
        returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(res.body.authorizedBy.id).toBe(supervisorId);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("pinHash");
      expect(body).not.toContain("passwordHash");
      expect(body).not.toContain(SUPERVISOR_PIN);
    });
  });

  describe("Permissions and branch scope", () => {
    it("rejects a caller with no permissions with 403", async () => {
      const res = await request(app).post("/api/returns").set("Cookie", [noPermCookie]).send({});
      expect(res.status).toBe(403);
    });

    it("rejects an unauthenticated caller with 401", async () => {
      const res = await request(app).post("/api/returns").send({});
      expect(res.status).toBe(401);
    });

    it("rejects a branch manager (no returns.create) from initiating a return", async () => {
      // The manager AUTHORIZES returns; they do not ring them up. This is
      // the two-person control made explicit at the route level.
      const res = await request(app).post("/api/returns").set("Cookie", [managerCookie]).send({});
      expect(res.status).toBe(403);
    });

    it("rejects a cashier scoped to another branch with 403", async () => {
      const product = await makeProduct("RET-SCOPE", 100);
      await giveStock(product.id, branchA.id, 5);
      const sale = await ringUpSale([{ productId: product.id, quantity: 1 }], branchA.id);

      const res = await request(app)
        .post("/api/returns")
        .set("Cookie", [scopedCashierCookie])
        .send({
          originalSaleId: sale.body.id,
          returnedItems: [{ saleItemId: sale.body.items[0].id, quantity: 1, restock: true }],
          pinCode: SUPERVISOR_PIN,
        });

      expect(res.status).toBe(403);
    });

    it("lists and fetches returns, scoped to the caller's branches", async () => {
      const list = await request(app).get("/api/returns").set("Cookie", [cashierCookie]);
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(list.body.length).toBeGreaterThan(0);
      expect(list.body[0].returnNumber).toMatch(/^D-\d{6}$/);

      const one = await request(app).get(`/api/returns/${returnIds[0]}`).set("Cookie", [cashierCookie]);
      expect(one.status).toBe(200);
      expect(one.body.id).toBe(returnIds[0]);

      // A cashier scoped to branchB cannot read a branchA return.
      const denied = await request(app).get(`/api/returns/${returnIds[0]}`).set("Cookie", [scopedCashierCookie]);
      expect(denied.status).toBe(403);

      // Read permission is still required.
      const noPerm = await request(app).get("/api/returns").set("Cookie", [noPermCookie]);
      expect(noPerm.status).toBe(403);
    });

    it("never leaks credential hashes in the returns list", async () => {
      const list = await request(app).get("/api/returns").set("Cookie", [cashierCookie]);
      const body = JSON.stringify(list.body);
      expect(body).not.toContain("passwordHash");
      expect(body).not.toContain("pinHash");
    });
  });
});
