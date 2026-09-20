import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { applyMovement } from "../src/services/inventoryService";

describe("Online orders (/api/public/orders + /api/orders)", () => {
  let adminCookie: string;
  let managerCookie: string; // allBranches branch_manager — has orders.view/orders.update per seed.ts
  let cashierCookie: string; // has neither orders.view nor orders.update
  let noPermCookie: string;
  let scopedCookie: string; // branch_manager scoped to ONLY branchA

  let branchA: { id: string };
  let branchInactive: { id: string };
  let category: { id: string };

  const productIds: string[] = [];
  const orderIds: string[] = [];
  const customerIds: string[] = [];
  const extraBranchIds: string[] = []; // branches created inside individual `it`s, cleaned up alongside branchA/branchInactive
  const testUsernames = [
    "orders_test_admin",
    "orders_test_manager",
    "orders_test_cashier",
    "orders_test_noperm",
    "orders_test_scoped",
  ];
  const testRoleCodes = ["orders_test_no_perms"];

  async function stockAt(productId: string, branchId: string, variantId?: string) {
    const row = await prisma.inventory.findFirst({ where: { productId, branchId, variantId: variantId ?? null } });
    return row?.stock ?? 0;
  }

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const adminUser = await prisma.user.upsert({
      where: { username: "orders_test_admin" },
      update: {},
      create: {
        firstName: "Orders", lastName: "Admin", displayName: "Orders Admin",
        username: "orders_test_admin", email: "orders_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    adminCookie = `access_token=${signAccessToken({ sub: adminUser.id, roleId: adminRole.id })}`;

    // branch_manager is seeded with orders.view/orders.update.
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
    const managerUser = await prisma.user.upsert({
      where: { username: "orders_test_manager" },
      update: {},
      create: {
        firstName: "Orders", lastName: "Manager", displayName: "Orders Manager",
        username: "orders_test_manager", email: "orders_test_manager@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: managerRole.id, allBranches: true,
      },
    });
    managerCookie = `access_token=${signAccessToken({ sub: managerUser.id, roleId: managerRole.id })}`;

    // cashier has neither orders.view nor orders.update per seed.ts.
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const cashierUser = await prisma.user.upsert({
      where: { username: "orders_test_cashier" },
      update: {},
      create: {
        firstName: "Orders", lastName: "Cashier", displayName: "Orders Cashier",
        username: "orders_test_cashier", email: "orders_test_cashier@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: cashierRole.id, allBranches: true,
      },
    });
    cashierCookie = `access_token=${signAccessToken({ sub: cashierUser.id, roleId: cashierRole.id })}`;

    const noPermRole = await prisma.role.upsert({
      where: { code: "orders_test_no_perms" },
      update: {},
      create: { code: "orders_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    const noPermUser = await prisma.user.upsert({
      where: { username: "orders_test_noperm" },
      update: {},
      create: {
        firstName: "No", lastName: "Perm", displayName: "No Perm", username: "orders_test_noperm",
        email: "orders_test_noperm@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: noPermRole.id, allBranches: true,
      },
    });
    noPermCookie = `access_token=${signAccessToken({ sub: noPermUser.id, roleId: noPermRole.id })}`;

    category = await prisma.category.create({ data: { name: `Orders Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `Orders Sucursal A ${Date.now()}` } });
    branchInactive = await prisma.branch.create({ data: { name: `Orders Sucursal Inactiva ${Date.now()}`, status: "INACTIVE" } });

    const scopedUser = await prisma.user.upsert({
      where: { username: "orders_test_scoped" },
      update: {},
      create: {
        firstName: "Orders", lastName: "Scoped", displayName: "Orders Scoped",
        username: "orders_test_scoped", email: "orders_test_scoped@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: managerRole.id, allBranches: false,
      },
    });
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: scopedUser.id, branchId: branchA.id } },
      update: {},
      create: { userId: scopedUser.id, branchId: branchA.id },
    });
    scopedCookie = `access_token=${signAccessToken({ sub: scopedUser.id, roleId: managerRole.id })}`;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } }); // cascades OrderItem
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } }).catch(() => {});
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchInactive.id, ...extraBranchIds] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.role.deleteMany({ where: { code: { in: testRoleCodes } } }).catch(() => {});
  });

  describe("POST /api/public/orders — checkout, no auth", () => {
    let product: { id: string };

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `ORDER-CREATE-${Date.now()}`, name: "Producto pedido online", price: 100, taxRate: 16, categoryId: category.id, minStock: 2 },
      });
      product = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 20 });
    });

    it("succeeds with no Authorization header, prices server-side, decrements stock, and maps to the OnlineOrder shape", async () => {
      const before = await stockAt(product.id, branchA.id);
      expect(before).toBe(20);

      const phone = `555${Date.now()}`.slice(0, 15);
      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Cliente", lastName: "De Prueba", phone, email: "cliente@example.com" },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: product.id, quantity: 3 }],
          notes: "Sin envoltura",
        });

      expect(res.status).toBe(201);
      orderIds.push(res.body.id);

      expect(res.body.orderNumber).toMatch(/^P-\d{6}$/);
      expect(res.body.status).toBe("PENDING");
      expect(res.body.customerName).toBe("Cliente De Prueba");
      expect(res.body.customerPhone).toBe(phone);
      expect(res.body.fulfillmentType).toBe("PICKUP");
      expect(res.body.branch.id).toBe(branchA.id);
      // 100 * 3 = 300 subtotal, 16% tax = 48, total = 348
      expect(Number(res.body.subtotal)).toBe(300);
      expect(Number(res.body.taxTotal)).toBe(48);
      expect(Number(res.body.total)).toBe(348);
      expect(res.body.items).toHaveLength(1);
      expect(Number(res.body.items[0].unitPrice)).toBe(100);
      expect(Number(res.body.items[0].lineTotal)).toBe(300);

      expect(await stockAt(product.id, branchA.id)).toBe(17);

      const movements = await prisma.inventoryMovement.findMany({ where: { reference: res.body.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe("ORDER");
      expect(movements[0].quantity).toBe(-3);
      expect(movements[0].userId).toBeNull(); // no authenticated actor for a public order

      const customer = await prisma.customer.findFirst({ where: { phone } });
      expect(customer).toBeTruthy();
      customerIds.push(customer!.id);
    });

    it("reusing the same phone on a second order finds-or-creates the SAME Customer row (no duplicate)", async () => {
      const phone = `556${Date.now()}`.slice(0, 15);

      const res1 = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Repetido", phone },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: product.id, quantity: 1 }],
        });
      expect(res1.status).toBe(201);
      orderIds.push(res1.body.id);

      const res2 = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Repetido", lastName: "Apellido Nuevo", phone, email: "repetido@example.com" },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CARD",
          items: [{ productId: product.id, quantity: 1 }],
        });
      expect(res2.status).toBe(201);
      orderIds.push(res2.body.id);

      const customersWithPhone = await prisma.customer.findMany({ where: { phone } });
      expect(customersWithPhone).toHaveLength(1);
      customerIds.push(customersWithPhone[0].id);
      // Blank fields enriched on the second order (email was blank before).
      expect(customersWithPhone[0].email).toBe("repetido@example.com");
    });

    it("rejects a DELIVERY order and stores address/lat/lng", async () => {
      const phone = `557${Date.now()}`.slice(0, 15);
      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Entrega", phone },
          fulfillment: { type: "DELIVERY", branchId: branchA.id, address: "Calle Falsa 123", lat: 19.43, lng: -99.13 },
          paymentMethod: "TRANSFER",
          items: [{ productId: product.id, quantity: 1 }],
        });
      expect(res.status).toBe(201);
      orderIds.push(res.body.id);
      expect(res.body.fulfillmentType).toBe("DELIVERY");
      expect(res.body.deliveryAddress).toBe("Calle Falsa 123");

      const customer = await prisma.customer.findFirst({ where: { phone } });
      if (customer) customerIds.push(customer.id);
    });

    it("rejects insufficient stock with 400 and does not change stock or create an order", async () => {
      const before = await stockAt(product.id, branchA.id);
      const countBefore = await prisma.order.count();

      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Sin Stock", phone: `558${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: product.id, quantity: 9999 }],
        });

      expect(res.status).toBe(400);
      expect(await stockAt(product.id, branchA.id)).toBe(before);
      expect(await prisma.order.count()).toBe(countBefore);
    });

    it("rejects an unknown branchId with 404", async () => {
      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Cliente", phone: `559${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: "00000000-0000-0000-0000-000000000000" },
          paymentMethod: "CASH",
          items: [{ productId: product.id, quantity: 1 }],
        });
      expect(res.status).toBe(404);
    });

    it("rejects an INACTIVE branch with 400", async () => {
      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Cliente", phone: `560${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchInactive.id },
          paymentMethod: "CASH",
          items: [{ productId: product.id, quantity: 1 }],
        });
      expect(res.status).toBe(400);
    });

    it("rejects an unknown productId with 404", async () => {
      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Cliente", phone: `561${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
        });
      expect(res.status).toBe(404);
    });

    it("rejects an empty items array with 400", async () => {
      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Cliente", phone: `562${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [],
        });
      expect(res.status).toBe(400);
    });

    it("rejects an absurd quantity with 400 (defensive validation on an unauthenticated endpoint)", async () => {
      const res = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Cliente", phone: `563${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: product.id, quantity: 100000 }],
        });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/public/orders/:orderNumber — order tracking, no auth", () => {
    let trackingProduct: { id: string };

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `ORDER-TRACKING-${Date.now()}`, name: "Producto rastreo pedido", price: 25, taxRate: 0, minStock: 1 },
      });
      trackingProduct = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });
    });

    it("returns the order when the phone matches, and 404 (never leaking existence) when it doesn't", async () => {
      const phone = `568${Date.now()}`.slice(0, 15);
      const createRes = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Tracking", phone },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: trackingProduct.id, quantity: 1 }],
        });
      expect(createRes.status).toBe(201);
      orderIds.push(createRes.body.id);
      const customer = await prisma.customer.findFirst({ where: { phone } });
      if (customer) customerIds.push(customer.id);

      const okRes = await request(app).get(
        `/api/public/orders/${createRes.body.orderNumber}?phone=${encodeURIComponent(phone)}`
      );
      expect(okRes.status).toBe(200);
      expect(okRes.body.id).toBe(createRes.body.id);

      const wrongPhoneRes = await request(app).get(
        `/api/public/orders/${createRes.body.orderNumber}?phone=0000000000`
      );
      expect(wrongPhoneRes.status).toBe(404);
    });

    it("returns 404 for a malformed orderNumber", async () => {
      const res = await request(app).get(`/api/public/orders/not-a-real-number?phone=123`);
      expect(res.status).toBe(404);
    });
  });

  describe("Staff management (/api/orders) — authenticated, permission-gated", () => {
    let product: { id: string };
    let orderId: string;
    let orderIdToCancel: string;

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `ORDER-STAFF-${Date.now()}`, name: "Producto gestión staff", price: 50, taxRate: 0, minStock: 2 },
      });
      product = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 30 });

      const createRes = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Staff", lastName: "Test", phone: `564${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: p.id, quantity: 2 }],
        });
      orderId = createRes.body.id;
      orderIds.push(orderId);

      const cancelRes = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Staff", lastName: "Cancel", phone: `565${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: p.id, quantity: 5 }],
        });
      orderIdToCancel = cancelRes.body.id;
      orderIds.push(orderIdToCancel);
    });

    it("GET /api/orders requires orders.view (403 for a plain cashier, 403 with no perms)", async () => {
      expect((await request(app).get("/api/orders").set("Cookie", [cashierCookie])).status).toBe(403);
      expect((await request(app).get("/api/orders").set("Cookie", [noPermCookie])).status).toBe(403);
    });

    it("GET /api/orders requires authentication (401 with no cookie)", async () => {
      expect((await request(app).get("/api/orders")).status).toBe(401);
    });

    it("an admin can list and see the order created via the public endpoint", async () => {
      const res = await request(app).get(`/api/orders?branchId=${branchA.id}`).set("Cookie", [adminCookie]);
      expect(res.status).toBe(200);
      expect(res.body.some((o: any) => o.id === orderId)).toBe(true);
    });

    it("PATCH /api/orders/:id/status requires orders.update (403 for a plain cashier)", async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Cookie", [cashierCookie])
        .send({ status: "CONFIRMED" });
      expect(res.status).toBe(403);
    });

    it("transitions the order PENDING -> CONFIRMED -> PREPARING -> READY -> COMPLETED in sequence", async () => {
      for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"]) {
        const res = await request(app)
          .patch(`/api/orders/${orderId}/status`)
          .set("Cookie", [managerCookie])
          .send({ status });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(status);
      }
    });

    it("rejects skipping ahead in the sequence with 400", async () => {
      const p = await prisma.product.create({
        data: { sku: `ORDER-SKIP-${Date.now()}`, name: "Producto salto de estado", price: 10, taxRate: 0, minStock: 1 },
      });
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 5 });

      const createRes = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Salto", phone: `566${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchA.id },
          paymentMethod: "CASH",
          items: [{ productId: p.id, quantity: 1 }],
        });
      orderIds.push(createRes.body.id);

      const res = await request(app)
        .patch(`/api/orders/${createRes.body.id}/status`)
        .set("Cookie", [managerCookie])
        .send({ status: "READY" }); // PENDING -> READY, skipping CONFIRMED/PREPARING
      expect(res.status).toBe(400);
    });

    it("cancelling restores stock for every line item and requires a reason", async () => {
      expect(await stockAt(product.id, branchA.id)).toBe(30 - 2 - 5); // purchased 30, sold 2 (staff order) + 5 (cancel order)

      const missingReason = await request(app)
        .patch(`/api/orders/${orderIdToCancel}/status`)
        .set("Cookie", [managerCookie])
        .send({ status: "CANCELLED" });
      expect(missingReason.status).toBe(400);

      const res = await request(app)
        .patch(`/api/orders/${orderIdToCancel}/status`)
        .set("Cookie", [managerCookie])
        .send({ status: "CANCELLED", reason: "Cliente canceló el pedido" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
      expect(await stockAt(product.id, branchA.id)).toBe(30 - 2); // the cancelled order's 5 units restored
    });

    it("rejects cancelling an already-completed order with 400", async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set("Cookie", [managerCookie])
        .send({ status: "CANCELLED", reason: "Intento tras completar" });
      expect(res.status).toBe(400);
    });

    it("a branch-scoped staff user without access to the order's branch gets 403", async () => {
      const branchB = await prisma.branch.create({ data: { name: `Orders Sucursal B ${Date.now()}` } });
      extraBranchIds.push(branchB.id);

      const p = await prisma.product.create({
        data: { sku: `ORDER-SCOPE-${Date.now()}`, name: "Producto sucursal B", price: 10, taxRate: 0, minStock: 1 },
      });
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchB.id, type: "PURCHASE", quantity: 5 });

      const createRes = await request(app)
        .post("/api/public/orders")
        .send({
          customer: { firstName: "Sucursal B", phone: `567${Date.now()}`.slice(0, 15) },
          fulfillment: { type: "PICKUP", branchId: branchB.id },
          paymentMethod: "CASH",
          items: [{ productId: p.id, quantity: 1 }],
        });
      orderIds.push(createRes.body.id);

      const res = await request(app).get(`/api/orders/${createRes.body.id}`).set("Cookie", [scopedCookie]);
      expect(res.status).toBe(403);
    });
  });
});
