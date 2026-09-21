import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Compras / purchases (supplier receiving)", () => {
  let adminCookie: string;
  let managerCookie: string; // allBranches branch_manager: purchases.view/create/receive/cancel
  let purchasingCookie: string; // "Compras" role: view/create/receive + suppliers.manage, NO cancel
  let cashierCookie: string; // no purchases.* at all
  let noPermCookie: string;
  let scopedCookie: string; // branch_manager scoped to branchA only

  let branchA: { id: string };
  let branchB: { id: string };
  let supplier: { id: string };
  let category: { id: string };

  const productIds: string[] = [];
  const purchaseIds: string[] = [];
  const supplierIds: string[] = [];
  const testUsernames = [
    "purchases_test_admin",
    "purchases_test_manager",
    "purchases_test_purchasing",
    "purchases_test_cashier",
    "purchases_test_noperm",
    "purchases_test_scoped",
  ];
  const testRoleCodes = ["purchases_test_no_perms"];

  async function stockAt(productId: string, branchId: string, variantId?: string) {
    const row = await prisma.inventory.findFirst({ where: { productId, branchId, variantId: variantId ?? null } });
    return row?.stock ?? 0;
  }

  async function makeProduct(sku: string, cost = 0) {
    const p = await prisma.product.create({
      data: { sku: `${sku}-${Date.now()}`, name: `Producto ${sku}`, price: 100, cost, taxRate: 0, categoryId: category.id, minStock: 2 },
    });
    productIds.push(p.id);
    return p;
  }

  // Creates a PENDING purchase through the real API and remembers it for cleanup.
  async function createPurchase(body: Record<string, unknown>, cookie = managerCookie) {
    const res = await request(app).post("/api/purchases").set("Cookie", [cookie]).send(body);
    if (res.body?.id) purchaseIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
    const purchasingRole = await prisma.role.findUniqueOrThrow({ where: { code: "purchasing" } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });

    const mk = async (username: string, roleId: string, allBranches: boolean) => {
      const u = await prisma.user.upsert({
        where: { username },
        update: {},
        create: {
          firstName: "Purchases", lastName: username, displayName: `Purchases ${username}`,
          username, email: `${username}@bellamakeup.demo`,
          passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId, allBranches,
        },
      });
      return { user: u, cookie: `access_token=${signAccessToken({ sub: u.id, roleId })}` };
    };

    adminCookie = (await mk("purchases_test_admin", adminRole.id, true)).cookie;
    managerCookie = (await mk("purchases_test_manager", managerRole.id, true)).cookie;
    purchasingCookie = (await mk("purchases_test_purchasing", purchasingRole.id, true)).cookie;
    cashierCookie = (await mk("purchases_test_cashier", cashierRole.id, true)).cookie;

    const noPermRole = await prisma.role.upsert({
      where: { code: "purchases_test_no_perms" },
      update: {},
      create: { code: "purchases_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    noPermCookie = (await mk("purchases_test_noperm", noPermRole.id, true)).cookie;

    category = await prisma.category.create({ data: { name: `Purchases Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `Purchases Sucursal A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Purchases Sucursal B ${Date.now()}` } });

    const scoped = await mk("purchases_test_scoped", managerRole.id, false);
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: scoped.user.id, branchId: branchA.id } },
      update: {},
      create: { userId: scoped.user.id, branchId: branchA.id },
    });
    scopedCookie = scoped.cookie;

    supplier = await prisma.supplier.create({ data: { name: `Proveedor Test ${Date.now()}`, contactName: "Ana", phone: "555-1234" } });
    supplierIds.push(supplier.id);
  });

  afterAll(async () => {
    await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } }); // cascades PurchaseItem
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } }).catch(() => {});
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.role.deleteMany({ where: { code: { in: testRoleCodes } } }).catch(() => {});
  });

  describe("POST /api/purchases — create (order placed, nothing received yet)", () => {
    it("creates a PENDING purchase and moves NO stock", async () => {
      const product = await makeProduct("PUR-CREATE");
      const before = await stockAt(product.id, branchA.id);
      expect(before).toBe(0);

      const res = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        reference: "FAC-8812",
        items: [{ productId: product.id, expectedQuantity: 10, unitCost: 45.5 }],
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.purchaseNumber).toMatch(/^C-\d{6}$/);
      expect(res.body.branchId).toBe(branchA.id);
      expect(res.body.supplierId).toBe(supplier.id);
      expect(res.body.reference).toBe("FAC-8812");
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].expectedQuantity).toBe(10);
      // Nothing counted yet — explicitly null, not 0.
      expect(res.body.items[0].receivedQuantity).toBeNull();
      expect(res.body.receivedAt).toBeNull();
      expect(res.body.itemCount).toBe(1);
      expect(res.body.discrepancyCount).toBe(0);

      // The whole point: an order is intent, not inventory.
      expect(await stockAt(product.id, branchA.id)).toBe(0);
      expect(await prisma.inventoryMovement.count({ where: { reference: res.body.id } })).toBe(0);
    });

    it("never leaks credential hashes in the purchase payload", async () => {
      const product = await makeProduct("PUR-LEAK");
      const res = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 1, unitCost: 1 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBeTruthy();
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("passwordHash");
      expect(body).not.toContain("pinHash");
    });

    it("rejects an unknown supplier with 404", async () => {
      const product = await makeProduct("PUR-NOSUP");
      const res = await createPurchase({
        supplierId: "00000000-0000-0000-0000-0000000000ff",
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 1, unitCost: 1 }],
      });
      expect(res.status).toBe(404);
    });

    it("rejects an inactive supplier with 400", async () => {
      const inactive = await prisma.supplier.create({ data: { name: `Proveedor Inactivo ${Date.now()}`, status: "INACTIVE" } });
      supplierIds.push(inactive.id);
      const product = await makeProduct("PUR-INACTSUP");

      const res = await createPurchase({
        supplierId: inactive.id,
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 1, unitCost: 1 }],
      });
      expect(res.status).toBe(400);
    });

    it("rejects a non-positive expected quantity with 400", async () => {
      const product = await makeProduct("PUR-ZEROQTY");
      const res = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 0, unitCost: 10 }],
      });
      expect(res.status).toBe(400);
    });

    it("rejects an empty item list with 400", async () => {
      const res = await createPurchase({ supplierId: supplier.id, branchId: branchA.id, items: [] });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/purchases/:id/receive — exact delivery", () => {
    it("increments stock by the received quantity and marks COMPLETED", async () => {
      const product = await makeProduct("PUR-EXACT");
      const created = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 12, unitCost: 33 }],
      });
      expect(created.status).toBe(201);
      expect(await stockAt(product.id, branchA.id)).toBe(0);

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 12 }] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.discrepancyCount).toBe(0);
      expect(res.body.receivedBy).toBeTruthy();
      expect(res.body.receivedAt).toBeTruthy();
      expect(res.body.items[0].receivedQuantity).toBe(12);

      expect(await stockAt(product.id, branchA.id)).toBe(12);

      const movements = await prisma.inventoryMovement.findMany({ where: { reference: created.body.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe("PURCHASE");
      expect(movements[0].quantity).toBe(12);
      expect(movements[0].stockBefore).toBe(0);
      expect(movements[0].stockAfter).toBe(12);
      expect(movements[0].branchId).toBe(branchA.id);
    });

    it("refreshes Product.cost to the unit cost actually paid", async () => {
      const product = await makeProduct("PUR-COST", 80);
      expect(Number(product.cost)).toBe(80);

      const created = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 5, unitCost: 97.25 }],
      });
      await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 5 }] });

      const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(Number(after.cost)).toBe(97.25);
    });

    it("does NOT update Product.cost for a line where nothing arrived", async () => {
      const product = await makeProduct("PUR-COST-NONE", 60);
      const created = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 5, unitCost: 999 }],
      });
      await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 0 }] });

      const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      // A line that never showed up says nothing about current cost.
      expect(Number(after.cost)).toBe(60);
    });
  });

  describe("POST /api/purchases/:id/receive — shortfall (discrepancy)", () => {
    it("adds only what actually arrived and marks RECEIVED_WITH_DISCREPANCIES", async () => {
      const shortProduct = await makeProduct("PUR-SHORT");
      const fullProduct = await makeProduct("PUR-FULL");

      const created = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        reference: "REM-5521",
        items: [
          { productId: shortProduct.id, expectedQuantity: 20, unitCost: 10 },
          { productId: fullProduct.id, expectedQuantity: 8, unitCost: 25 },
        ],
      });
      expect(created.status).toBe(201);

      const shortLine = created.body.items.find((i: any) => i.productId === shortProduct.id);
      const fullLine = created.body.items.find((i: any) => i.productId === fullProduct.id);

      expect(await stockAt(shortProduct.id, branchA.id)).toBe(0);
      expect(await stockAt(fullProduct.id, branchA.id)).toBe(0);

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({
          items: [
            { purchaseItemId: shortLine.id, receivedQuantity: 15 }, // 5 short
            { purchaseItemId: fullLine.id, receivedQuantity: 8 }, // exact
          ],
        });

      expect(res.status).toBe(200);
      // A short delivery is real life, not an error: it still succeeds.
      expect(res.body.status).toBe("RECEIVED_WITH_DISCREPANCIES");
      expect(res.body.discrepancyCount).toBe(1);

      // Stock reflects what physically arrived, never what was ordered.
      expect(await stockAt(shortProduct.id, branchA.id)).toBe(15);
      expect(await stockAt(fullProduct.id, branchA.id)).toBe(8);

      const resShortLine = res.body.items.find((i: any) => i.productId === shortProduct.id);
      expect(resShortLine.expectedQuantity).toBe(20);
      expect(resShortLine.receivedQuantity).toBe(15);

      const movements = await prisma.inventoryMovement.findMany({ where: { reference: created.body.id } });
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.type === "PURCHASE")).toBe(true);
      expect(movements.find((m) => m.productId === shortProduct.id)!.quantity).toBe(15);
    });

    it("records a zero-quantity line without creating a stock movement for it", async () => {
      const arrived = await makeProduct("PUR-ARRIVED");
      const missing = await makeProduct("PUR-MISSING");

      const created = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [
          { productId: arrived.id, expectedQuantity: 4, unitCost: 10 },
          { productId: missing.id, expectedQuantity: 6, unitCost: 10 },
        ],
      });
      const arrivedLine = created.body.items.find((i: any) => i.productId === arrived.id);
      const missingLine = created.body.items.find((i: any) => i.productId === missing.id);

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({
          items: [
            { purchaseItemId: arrivedLine.id, receivedQuantity: 4 },
            { purchaseItemId: missingLine.id, receivedQuantity: 0 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("RECEIVED_WITH_DISCREPANCIES");
      expect(await stockAt(arrived.id, branchA.id)).toBe(4);
      expect(await stockAt(missing.id, branchA.id)).toBe(0);
      // No zero-quantity kardex noise for the line that never showed up.
      const movements = await prisma.inventoryMovement.findMany({ where: { reference: created.body.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0].productId).toBe(arrived.id);
    });

    it("treats a line omitted from the payload as received 0", async () => {
      const a = await makeProduct("PUR-OMIT-A");
      const b = await makeProduct("PUR-OMIT-B");
      const created = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [
          { productId: a.id, expectedQuantity: 3, unitCost: 10 },
          { productId: b.id, expectedQuantity: 7, unitCost: 10 },
        ],
      });
      const lineA = created.body.items.find((i: any) => i.productId === a.id);

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: lineA.id, receivedQuantity: 3 }] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("RECEIVED_WITH_DISCREPANCIES");
      // No line is left as "not yet counted" once a delivery is closed out.
      expect(res.body.items.every((i: any) => i.receivedQuantity !== null)).toBe(true);
      expect(res.body.items.find((i: any) => i.productId === b.id).receivedQuantity).toBe(0);
      expect(await stockAt(b.id, branchA.id)).toBe(0);
    });

    it("accepts an over-delivery as a discrepancy rather than rejecting it", async () => {
      const product = await makeProduct("PUR-OVER");
      const created = await createPurchase({
        supplierId: supplier.id,
        branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 5, unitCost: 10 }],
      });

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 7 }] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("RECEIVED_WITH_DISCREPANCIES");
      expect(await stockAt(product.id, branchA.id)).toBe(7);
    });

    it("rejects a line id belonging to a different purchase with 400 and changes no stock", async () => {
      const p1 = await makeProduct("PUR-XLINE-1");
      const p2 = await makeProduct("PUR-XLINE-2");
      const first = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: p1.id, expectedQuantity: 2, unitCost: 10 }],
      });
      const second = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: p2.id, expectedQuantity: 2, unitCost: 10 }],
      });

      const res = await request(app)
        .post(`/api/purchases/${second.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: first.body.items[0].id, receivedQuantity: 2 }] });

      expect(res.status).toBe(400);
      expect(await stockAt(p1.id, branchA.id)).toBe(0);
      expect(await stockAt(p2.id, branchA.id)).toBe(0);
      const still = await prisma.purchase.findUniqueOrThrow({ where: { id: second.body.id } });
      expect(still.status).toBe("PENDING");
    });
  });

  describe("POST /api/purchases/:id/receive — invalid states", () => {
    it("rejects receiving an already-received purchase with 400 and does not double-count stock", async () => {
      const product = await makeProduct("PUR-TWICE");
      const created = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 6, unitCost: 10 }],
      });
      const line = created.body.items[0];

      const first = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: line.id, receivedQuantity: 6 }] });
      expect(first.status).toBe(200);
      expect(await stockAt(product.id, branchA.id)).toBe(6);

      const second = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: line.id, receivedQuantity: 6 }] });
      expect(second.status).toBe(400);
      // Critically: stock is unchanged by the rejected second receipt.
      expect(await stockAt(product.id, branchA.id)).toBe(6);
    });

    it("rejects receiving a purchase that was received WITH discrepancies", async () => {
      const product = await makeProduct("PUR-DISC-TWICE");
      const created = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 6, unitCost: 10 }],
      });
      await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 2 }] });

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 4 }] });
      expect(res.status).toBe(400);
      expect(await stockAt(product.id, branchA.id)).toBe(2);
    });

    it("rejects receiving a cancelled purchase with 400", async () => {
      const product = await makeProduct("PUR-RECV-CANCELLED");
      const created = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 3, unitCost: 10 }],
      });
      await request(app)
        .post(`/api/purchases/${created.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Pedido cancelado con el proveedor" });

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 3 }] });
      expect(res.status).toBe(400);
      expect(await stockAt(product.id, branchA.id)).toBe(0);
    });

    it("returns 404 for an unknown purchase", async () => {
      const res = await request(app)
        .post("/api/purchases/00000000-0000-0000-0000-0000000000aa/receive")
        .set("Cookie", [managerCookie])
        .send({ items: [] });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/purchases/:id/cancel", () => {
    it("cancels a PENDING purchase without touching stock", async () => {
      const product = await makeProduct("PUR-CANCEL");
      const created = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 9, unitCost: 10 }],
      });

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "El proveedor canceló el surtido" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
      expect(res.body.cancelReason).toBe("El proveedor canceló el surtido");
      expect(res.body.cancelledAt).toBeTruthy();
      // Nothing was ever received, so there is nothing to reverse.
      expect(await stockAt(product.id, branchA.id)).toBe(0);
      expect(await prisma.inventoryMovement.count({ where: { reference: created.body.id } })).toBe(0);
    });

    it("rejects cancelling an already-cancelled purchase with 400", async () => {
      const product = await makeProduct("PUR-CANCEL-TWICE");
      const created = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 1, unitCost: 10 }],
      });
      await request(app).post(`/api/purchases/${created.body.id}/cancel`).set("Cookie", [managerCookie]).send({ reason: "Primera cancelación" });

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Segunda cancelación" });
      expect(res.status).toBe(400);
    });

    it("rejects cancelling an already-received purchase with 400", async () => {
      const product = await makeProduct("PUR-CANCEL-RECEIVED");
      const created = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 4, unitCost: 10 }],
      });
      await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [managerCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 4 }] });

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Intento de cancelar una ya recibida" });
      expect(res.status).toBe(400);
      // The goods are on the shelf; cancelling must not silently remove them.
      expect(await stockAt(product.id, branchA.id)).toBe(4);
    });

    it("requires a reason of at least 3 characters", async () => {
      const product = await makeProduct("PUR-CANCEL-NOREASON");
      const created = await createPurchase({
        supplierId: supplier.id, branchId: branchA.id,
        items: [{ productId: product.id, expectedQuantity: 1, unitCost: 10 }],
      });
      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "x" });
      expect(res.status).toBe(400);
    });
  });

  describe("Branch-scope enforcement", () => {
    it("a branch-scoped user cannot create a purchase for a branch they lack access to (403)", async () => {
      const product = await makeProduct("PUR-SCOPE-CREATE");
      const res = await request(app)
        .post("/api/purchases")
        .set("Cookie", [scopedCookie]) // assigned to branchA only
        .send({
          supplierId: supplier.id,
          branchId: branchB.id,
          items: [{ productId: product.id, expectedQuantity: 1, unitCost: 10 }],
        });
      expect(res.status).toBe(403);
    });

    it("a branch-scoped user cannot receive a purchase for another branch (403)", async () => {
      const product = await makeProduct("PUR-SCOPE-RECEIVE");
      const created = await createPurchase(
        { supplierId: supplier.id, branchId: branchB.id, items: [{ productId: product.id, expectedQuantity: 2, unitCost: 10 }] },
        adminCookie
      );

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [scopedCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 2 }] });
      expect(res.status).toBe(403);
      expect(await stockAt(product.id, branchB.id)).toBe(0);
    });

    it("a branch-scoped user gets 403 on GET /api/purchases/:id for another branch", async () => {
      const product = await makeProduct("PUR-SCOPE-GET");
      const created = await createPurchase(
        { supplierId: supplier.id, branchId: branchB.id, items: [{ productId: product.id, expectedQuantity: 1, unitCost: 10 }] },
        adminCookie
      );
      const res = await request(app).get(`/api/purchases/${created.body.id}`).set("Cookie", [scopedCookie]);
      expect(res.status).toBe(403);
    });

    it("a branch-scoped user only lists purchases from their own branches", async () => {
      const res = await request(app).get("/api/purchases").set("Cookie", [scopedCookie]);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((p: any) => p.branchId === branchA.id)).toBe(true);
    });

    it("rejects an explicit branchId filter outside the caller's scope with 403", async () => {
      const res = await request(app).get(`/api/purchases?branchId=${branchB.id}`).set("Cookie", [scopedCookie]);
      expect(res.status).toBe(403);
    });
  });

  describe("Permission gates", () => {
    const dummyItem = { productId: "00000000-0000-0000-0000-000000000000", expectedQuantity: 1, unitCost: 1 };

    it("POST /api/purchases requires purchases.create (403 without it)", async () => {
      const res = await request(app)
        .post("/api/purchases")
        .set("Cookie", [noPermCookie])
        .send({ supplierId: supplier.id, branchId: branchA.id, items: [dummyItem] });
      expect(res.status).toBe(403);
    });

    it("a plain cashier gets 403 creating a purchase — purchasing is not a cashier's job", async () => {
      const res = await request(app)
        .post("/api/purchases")
        .set("Cookie", [cashierCookie])
        .send({ supplierId: supplier.id, branchId: branchA.id, items: [dummyItem] });
      expect(res.status).toBe(403);
    });

    it("a plain cashier gets 403 listing purchases", async () => {
      expect((await request(app).get("/api/purchases").set("Cookie", [cashierCookie])).status).toBe(403);
    });

    it("POST /api/purchases/:id/receive requires purchases.receive (403 without it)", async () => {
      const res = await request(app)
        .post(`/api/purchases/${purchaseIds[0]}/receive`)
        .set("Cookie", [noPermCookie])
        .send({ items: [] });
      expect(res.status).toBe(403);
    });

    it("POST /api/purchases/:id/cancel requires purchases.cancel — the Compras role does NOT have it", async () => {
      // Matches the transfers precedent: the role that raises an order is not
      // the role trusted to unwind it.
      const res = await request(app)
        .post(`/api/purchases/${purchaseIds[0]}/cancel`)
        .set("Cookie", [purchasingCookie])
        .send({ reason: "Sin permiso de cancelación" });
      expect(res.status).toBe(403);
    });

    it("the Compras role CAN create and receive", async () => {
      const product = await makeProduct("PUR-ROLE-COMPRAS");
      const created = await createPurchase(
        { supplierId: supplier.id, branchId: branchA.id, items: [{ productId: product.id, expectedQuantity: 3, unitCost: 12 }] },
        purchasingCookie
      );
      expect(created.status).toBe(201);

      const res = await request(app)
        .post(`/api/purchases/${created.body.id}/receive`)
        .set("Cookie", [purchasingCookie])
        .send({ items: [{ purchaseItemId: created.body.items[0].id, receivedQuantity: 3 }] });
      expect(res.status).toBe(200);
      expect(await stockAt(product.id, branchA.id)).toBe(3);
    });

    it("GET /api/purchases requires purchases.view (403 without it)", async () => {
      expect((await request(app).get("/api/purchases").set("Cookie", [noPermCookie])).status).toBe(403);
      expect((await request(app).get(`/api/purchases/${purchaseIds[0]}`).set("Cookie", [noPermCookie])).status).toBe(403);
    });

    it("requires authentication on every route", async () => {
      expect((await request(app).get("/api/purchases")).status).toBe(401);
      expect((await request(app).get(`/api/purchases/${purchaseIds[0]}`)).status).toBe(401);
      expect((await request(app).post("/api/purchases").send({})).status).toBe(401);
      expect((await request(app).post(`/api/purchases/${purchaseIds[0]}/receive`).send({})).status).toBe(401);
      expect((await request(app).post(`/api/purchases/${purchaseIds[0]}/cancel`).send({})).status).toBe(401);
    });
  });

  describe("GET /api/purchases — listing and filters", () => {
    it("lists newest first with purchaseNumber, itemCount and discrepancyCount", async () => {
      const res = await request(app).get(`/api/purchases?branchId=${branchA.id}`).set("Cookie", [adminCookie]);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((p: any) => p.branchId === branchA.id)).toBe(true);
      expect(res.body[0].purchaseNumber).toMatch(/^C-\d{6}$/);
      expect(typeof res.body[0].itemCount).toBe("number");
      expect(typeof res.body[0].discrepancyCount).toBe("number");

      const createdAts = res.body.map((p: any) => new Date(p.createdAt).getTime());
      expect(createdAts).toEqual([...createdAts].sort((a, b) => b - a));
    });

    it("filters by status and by supplier", async () => {
      const byStatus = await request(app)
        .get(`/api/purchases?branchId=${branchA.id}&status=RECEIVED_WITH_DISCREPANCIES`)
        .set("Cookie", [adminCookie]);
      expect(byStatus.status).toBe(200);
      expect(byStatus.body.length).toBeGreaterThan(0);
      expect(byStatus.body.every((p: any) => p.status === "RECEIVED_WITH_DISCREPANCIES")).toBe(true);

      const bySupplier = await request(app)
        .get(`/api/purchases?supplierId=${supplier.id}`)
        .set("Cookie", [adminCookie]);
      expect(bySupplier.status).toBe(200);
      expect(bySupplier.body.every((p: any) => p.supplierId === supplier.id)).toBe(true);
    });

    it("returns the full detail payload including supplier and item product names", async () => {
      const res = await request(app).get(`/api/purchases/${purchaseIds[0]}`).set("Cookie", [adminCookie]);
      expect(res.status).toBe(200);
      expect(res.body.supplier.name).toBe(supplier.name);
      expect(res.body.branch.name).toBeTruthy();
      expect(res.body.items[0].product.sku).toBeTruthy();
      expect(res.body.createdBy.displayName).toBeTruthy();
    });
  });

  describe("Suppliers CRUD", () => {
    it("creates, lists and updates a supplier with suppliers.manage", async () => {
      const created = await request(app)
        .post("/api/suppliers")
        .set("Cookie", [purchasingCookie])
        .send({ name: `Proveedor CRUD ${Date.now()}`, contactName: "Luis", phone: "555-9999", email: "luis@proveedor.demo" });
      expect(created.status).toBe(201);
      supplierIds.push(created.body.id);
      expect(created.body.status).toBe("ACTIVE");

      const list = await request(app).get("/api/suppliers").set("Cookie", [purchasingCookie]);
      expect(list.status).toBe(200);
      expect(list.body.some((s: any) => s.id === created.body.id)).toBe(true);

      const updated = await request(app)
        .put(`/api/suppliers/${created.body.id}`)
        .set("Cookie", [purchasingCookie])
        .send({ contactName: "Luis Hernández", status: "INACTIVE" });
      expect(updated.status).toBe(200);
      expect(updated.body.contactName).toBe("Luis Hernández");
      expect(updated.body.status).toBe("INACTIVE");

      const activeOnly = await request(app).get("/api/suppliers?status=ACTIVE").set("Cookie", [purchasingCookie]);
      expect(activeOnly.body.some((s: any) => s.id === created.body.id)).toBe(false);
    });

    it("requires suppliers.manage to write but only purchases.view to read", async () => {
      // branch_manager has purchases.view but NOT suppliers.manage.
      expect((await request(app).get("/api/suppliers").set("Cookie", [managerCookie])).status).toBe(200);
      const res = await request(app)
        .post("/api/suppliers")
        .set("Cookie", [managerCookie])
        .send({ name: "Proveedor no autorizado" });
      expect(res.status).toBe(403);
    });

    it("returns 404 updating an unknown supplier", async () => {
      const res = await request(app)
        .put("/api/suppliers/00000000-0000-0000-0000-0000000000bb")
        .set("Cookie", [purchasingCookie])
        .send({ name: "No existe" });
      expect(res.status).toBe(404);
    });

    it("requires authentication", async () => {
      expect((await request(app).get("/api/suppliers")).status).toBe(401);
      expect((await request(app).post("/api/suppliers").send({ name: "x" })).status).toBe(401);
    });
  });
});
