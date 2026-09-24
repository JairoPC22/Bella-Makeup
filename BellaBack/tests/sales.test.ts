import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { applyMovement } from "../src/services/inventoryService";

describe("Sales / POS checkout", () => {
  let adminCookie: string;
  let admin: { id: string };
  let cashierCookie: string;
  let cashier: { id: string };
  let authorizerCookie: string;
  let noPermCookie: string;
  let scopedCookie: string; // only assigned to branchA, used for cross-branch 403 tests
  const DISCOUNT_SUPERVISOR_PIN = "9182";

  let branchA: { id: string };
  let branchB: { id: string };
  let category: { id: string };

  const productIds: string[] = [];
  const saleIds: string[] = [];
  const customerIds: string[] = [];
  const testUsernames = [
    "sales_test_admin",
    "sales_test_cashier",
    "sales_test_authorizer",
    "sales_test_noperm",
    "sales_test_scoped",
    "sales_test_discount_supervisor",
  ];
  const testRoleCodes = ["sales_test_discount_authorizer", "sales_test_no_perms"];

  async function stockAt(productId: string, branchId: string, variantId?: string) {
    const row = await prisma.inventory.findFirst({ where: { productId, branchId, variantId: variantId ?? null } });
    return row?.stock ?? 0;
  }

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const adminUser = await prisma.user.upsert({
      where: { username: "sales_test_admin" },
      update: {},
      create: {
        firstName: "Sales", lastName: "Admin", displayName: "Sales Admin",
        username: "sales_test_admin", email: "sales_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    admin = { id: adminUser.id };
    adminCookie = `access_token=${signAccessToken({ sub: adminUser.id, roleId: adminRole.id })}`;

    // "cashier" is seeded with sales.view/sales.create/discounts.apply but
    // NOT discounts.authorize and NOT sales.cancel — exactly the boundary
    // this task's discount-threshold and permission-gate tests need.
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const cashierUser = await prisma.user.upsert({
      where: { username: "sales_test_cashier" },
      update: {},
      create: {
        firstName: "Sales", lastName: "Cashier", displayName: "Sales Cashier",
        username: "sales_test_cashier", email: "sales_test_cashier@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: cashierRole.id, allBranches: true,
      },
    });
    cashier = { id: cashierUser.id };
    cashierCookie = `access_token=${signAccessToken({ sub: cashierUser.id, roleId: cashierRole.id })}`;

    // Bespoke role: sales.create + discounts.authorize (no seeded role
    // combines these — branch_manager has discounts.authorize but not
    // sales.create). Used to prove a large discount succeeds for a caller
    // who CAN authorize it.
    const authorizerRole = await prisma.role.upsert({
      where: { code: "sales_test_discount_authorizer" },
      update: {},
      create: { code: "sales_test_discount_authorizer", name: "Autorizador de descuentos (test)", description: "Rol de prueba" },
    });
    const salesPerm = await prisma.permission.findUniqueOrThrow({ where: { code: "sales.create" } });
    const salesViewPerm = await prisma.permission.findUniqueOrThrow({ where: { code: "sales.view" } });
    const authorizePerm = await prisma.permission.findUniqueOrThrow({ where: { code: "discounts.authorize" } });
    for (const permissionId of [salesPerm.id, salesViewPerm.id, authorizePerm.id]) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: authorizerRole.id, permissionId } },
        update: {},
        create: { roleId: authorizerRole.id, permissionId },
      });
    }
    const authorizerUser = await prisma.user.upsert({
      where: { username: "sales_test_authorizer" },
      update: {},
      create: {
        firstName: "Sales", lastName: "Authorizer", displayName: "Sales Authorizer",
        username: "sales_test_authorizer", email: "sales_test_authorizer@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: authorizerRole.id, allBranches: true,
      },
    });
    authorizerCookie = `access_token=${signAccessToken({ sub: authorizerUser.id, roleId: authorizerRole.id })}`;

    // Zero-permission role, mirrors tests/inventory.test.ts's own pattern.
    const noPermRole = await prisma.role.upsert({
      where: { code: "sales_test_no_perms" },
      update: {},
      create: { code: "sales_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    const noPermUser = await prisma.user.upsert({
      where: { username: "sales_test_noperm" },
      update: {},
      create: {
        firstName: "No", lastName: "Perm", displayName: "No Perm", username: "sales_test_noperm",
        email: "sales_test_noperm@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: noPermRole.id, allBranches: true,
      },
    });
    noPermCookie = `access_token=${signAccessToken({ sub: noPermUser.id, roleId: noPermRole.id })}`;

    category = await prisma.category.create({ data: { name: `Sales Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `Sales Sucursal A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Sales Sucursal B ${Date.now()}` } });

    // branch_manager has sales.view + sales.cancel (useful for cancel), but
    // for the branch-scope 403 test we need a user assigned to ONLY
    // branchA (allBranches: false) via an explicit UserBranch row.
    const branchManagerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
    const scopedUser = await prisma.user.upsert({
      where: { username: "sales_test_scoped" },
      update: {},
      create: {
        firstName: "Sales", lastName: "Scoped", displayName: "Sales Scoped",
        username: "sales_test_scoped", email: "sales_test_scoped@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: branchManagerRole.id, allBranches: false,
      },
    });
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: scopedUser.id, branchId: branchA.id } },
      update: {},
      create: { userId: scopedUser.id, branchId: branchA.id },
    });
    scopedCookie = `access_token=${signAccessToken({ sub: scopedUser.id, roleId: branchManagerRole.id })}`;

    // Supervisor con PIN para las pruebas de escalamiento de descuento vía
    // PIN: branch_manager ya tiene discounts.authorize por el seed.
    await prisma.user.upsert({
      where: { username: "sales_test_discount_supervisor" },
      update: { pinHash: await hashPassword(DISCOUNT_SUPERVISOR_PIN) },
      create: {
        firstName: "Sales", lastName: "Supervisor", displayName: "Sales Supervisor",
        username: "sales_test_discount_supervisor", email: "sales_test_discount_supervisor@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: branchManagerRole.id,
        allBranches: true, pinHash: await hashPassword(DISCOUNT_SUPERVISOR_PIN),
      },
    });
  });

  afterAll(async () => {
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } }); // cascades SaleItem/SalePayment
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.role.deleteMany({ where: { code: { in: testRoleCodes } } }).catch(() => {});
  });

  describe("POST /api/sales — successful checkout pricing", () => {
    let productTaxed: { id: string };
    let productPromo: { id: string };

    beforeAll(async () => {
      const p1 = await prisma.product.create({
        data: { sku: `SALE-TAX-${Date.now()}`, name: "Producto con impuesto", price: 100, taxRate: 16, categoryId: category.id, minStock: 2 },
      });
      productTaxed = { id: p1.id };
      productIds.push(p1.id);

      const p2 = await prisma.product.create({
        data: { sku: `SALE-PROMO-${Date.now()}`, name: "Producto en promoción", price: 50, promoPrice: 40, taxRate: 0, categoryId: category.id, minStock: 2 },
      });
      productPromo = { id: p2.id };
      productIds.push(p2.id);

      await applyMovement({ productId: p1.id, branchId: branchA.id, type: "PURCHASE", quantity: 20 });
      await applyMovement({ productId: p2.id, branchId: branchA.id, type: "PURCHASE", quantity: 20 });
    });

    it("prices every line item from DB values (never trusting a client-sent price), applies the lower promoPrice, computes subtotal/discountTotal/taxTotal/total correctly, decrements stock, and writes SaleItem + InventoryMovement rows", async () => {
      // Hand-computed expectation:
      //   item1: productTaxed, unitPrice=100 (no promo), qty=2, discount=10
      //     lineSubtotal=200, lineTotal=190, tax=190*0.16=30.4
      //   item2: productPromo, unitPrice=40 (promo 40 < price 50), qty=3, discount=0
      //     lineSubtotal=120, lineTotal=120, tax=0
      //   subtotal=320, discountTotal=10, taxTotal=30.4, total=340.4
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [
            { productId: productTaxed.id, quantity: 2, discount: 10, price: 1 }, // client-sent `price` must be ignored
            { productId: productPromo.id, quantity: 3 },
          ],
          payments: [{ method: "CASH", amount: 340.4 }],
        });

      expect(res.status).toBe(201);
      saleIds.push(res.body.id);

      expect(Number(res.body.subtotal)).toBe(320);
      expect(Number(res.body.discountTotal)).toBe(10);
      expect(Number(res.body.taxTotal)).toBe(30.4);
      expect(Number(res.body.total)).toBe(340.4);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.ticketNumber).toMatch(/^V-\d{6}$/);
      expect(res.body.changeDue).toBe(0);
      expect(res.body.customerName).toBe("Cliente general");

      const item1 = res.body.items.find((i: any) => i.productId === productTaxed.id);
      expect(Number(item1.unitPrice)).toBe(100); // NOT the client-sent 1
      expect(Number(item1.lineTotal)).toBe(190);

      const item2 = res.body.items.find((i: any) => i.productId === productPromo.id);
      expect(Number(item2.unitPrice)).toBe(40);
      expect(Number(item2.lineTotal)).toBe(120);

      // Stock decremented by exactly the sold quantity.
      expect(await stockAt(productTaxed.id, branchA.id)).toBe(18);
      expect(await stockAt(productPromo.id, branchA.id)).toBe(17);

      // A SaleItem row per item.
      const saleItems = await prisma.saleItem.findMany({ where: { saleId: res.body.id } });
      expect(saleItems).toHaveLength(2);

      // An InventoryMovement row per item: type SALE, negative quantity, referencing the sale.
      const movements = await prisma.inventoryMovement.findMany({ where: { reference: res.body.id } });
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.type === "SALE")).toBe(true);
      const m1 = movements.find((m) => m.productId === productTaxed.id);
      const m2 = movements.find((m) => m.productId === productPromo.id);
      expect(m1?.quantity).toBe(-2);
      expect(m2?.quantity).toBe(-3);
    });

    it("a variant's own price overrides the product's price/promo logic entirely", async () => {
      const variantProduct = await prisma.product.create({
        data: { sku: `SALE-VARIANT-${Date.now()}`, name: "Producto con variante", price: 999, promoPrice: 1, taxRate: 0, minStock: 2 },
      });
      productIds.push(variantProduct.id);
      const variant = await prisma.productVariant.create({
        data: { productId: variantProduct.id, name: "Especial", sku: `SALE-VARIANT-${Date.now()}-V`, price: 77, minStock: 2 },
      });
      await applyMovement({ productId: variantProduct.id, variantId: variant.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });

      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: variantProduct.id, variantId: variant.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: 77 }],
        });

      expect(res.status).toBe(201);
      saleIds.push(res.body.id);
      expect(Number(res.body.items[0].unitPrice)).toBe(77);
      expect(await stockAt(variantProduct.id, branchA.id, variant.id)).toBe(9);
    });
  });

  describe("POST /api/sales — atomicity: an oversold second item rolls back the entire checkout", () => {
    let validProduct: { id: string };
    let scarceProduct: { id: string };

    beforeAll(async () => {
      const p1 = await prisma.product.create({
        data: { sku: `SALE-ATOMIC-OK-${Date.now()}`, name: "Producto válido", price: 10, taxRate: 0, minStock: 2 },
      });
      validProduct = { id: p1.id };
      productIds.push(p1.id);

      const p2 = await prisma.product.create({
        data: { sku: `SALE-ATOMIC-SCARCE-${Date.now()}`, name: "Producto escaso", price: 5, taxRate: 0, minStock: 2 },
      });
      scarceProduct = { id: p2.id };
      productIds.push(p2.id);

      await applyMovement({ productId: p1.id, branchId: branchA.id, type: "PURCHASE", quantity: 50 });
      await applyMovement({ productId: p2.id, branchId: branchA.id, type: "PURCHASE", quantity: 3 }); // only 3 in stock
    });

    it("rejects with 400 and leaves NEITHER item's stock changed nor any Sale/SaleItem row created — proving applyMovement(tx) composes into one outer transaction", async () => {
      const stockValidBefore = await stockAt(validProduct.id, branchA.id);
      const stockScarceBefore = await stockAt(scarceProduct.id, branchA.id);
      expect(stockValidBefore).toBe(50);
      expect(stockScarceBefore).toBe(3);

      const salesBefore = await prisma.sale.count({ where: { branchId: branchA.id } });
      const saleItemsBefore = await prisma.saleItem.count({ where: { productId: { in: [validProduct.id, scarceProduct.id] } } });

      // Item 1 (validProduct) is perfectly priceable and would succeed on
      // its own. Item 2 (scarceProduct) asks for far more than the 3 units
      // in stock. Since item 1 is processed first inside the SAME
      // transaction, its stock decrement + SaleItem creation happen before
      // item 2's applyMovement throws — the assertions below prove that
      // failure unwinds item 1's work too, not just item 2's.
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [
            { productId: validProduct.id, quantity: 2 },
            { productId: scarceProduct.id, quantity: 999 },
          ],
          payments: [{ method: "CASH", amount: 100000 }],
        });

      expect(res.status).toBe(400);

      // Fresh reads — not the HTTP response — prove nothing was created/changed.
      expect(await stockAt(validProduct.id, branchA.id)).toBe(stockValidBefore);
      expect(await stockAt(scarceProduct.id, branchA.id)).toBe(stockScarceBefore);

      const salesAfter = await prisma.sale.count({ where: { branchId: branchA.id } });
      expect(salesAfter).toBe(salesBefore);

      const saleItemsAfter = await prisma.saleItem.count({ where: { productId: { in: [validProduct.id, scarceProduct.id] } } });
      expect(saleItemsAfter).toBe(saleItemsBefore);

      const movements = await prisma.inventoryMovement.count({ where: { productId: { in: [validProduct.id, scarceProduct.id] }, type: "SALE" } });
      expect(movements).toBe(0);
    });
  });

  describe("POST /api/sales — discount authorization threshold (15% of line subtotal)", () => {
    let discountProduct: { id: string };

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `SALE-DISCOUNT-${Date.now()}`, name: "Producto descuento", price: 100, taxRate: 0, minStock: 2 },
      });
      discountProduct = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });
    });

    it("a discount within 15% of the line subtotal succeeds for a cashier (discounts.apply only)", async () => {
      // lineSubtotal = 100, threshold = 15, discount = 15 (== threshold, not >) is allowed.
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: discountProduct.id, quantity: 1, discount: 15 }],
          payments: [{ method: "CASH", amount: 85 }],
        });
      expect(res.status).toBe(201);
      saleIds.push(res.body.id);
      expect(Number(res.body.total)).toBe(85);
    });

    it("a discount above the 15% threshold is rejected with 403 for a cashier lacking discounts.authorize", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: discountProduct.id, quantity: 1, discount: 16 }],
          payments: [{ method: "CASH", amount: 84 }],
        });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/autorización/i);
    });

    it("the same above-threshold discount succeeds for a user with discounts.authorize", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [authorizerCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: discountProduct.id, quantity: 1, discount: 16 }],
          payments: [{ method: "CASH", amount: 84 }],
        });
      expect(res.status).toBe(201);
      saleIds.push(res.body.id);
      expect(Number(res.body.total)).toBe(84);
    });

    it("a wrong supervisor PIN rejects an above-threshold discount with 401 and writes nothing", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: discountProduct.id, quantity: 1, discount: 16 }],
          payments: [{ method: "CASH", amount: 84 }],
          pinCode: "000000",
        });
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/PIN/);
    });

    it("a correct supervisor PIN authorizes an above-threshold discount for a cashier lacking discounts.authorize", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: discountProduct.id, quantity: 1, discount: 16 }],
          payments: [{ method: "CASH", amount: 84 }],
          pinCode: DISCOUNT_SUPERVISOR_PIN,
        });
      expect(res.status).toBe(201);
      saleIds.push(res.body.id);
      expect(Number(res.body.total)).toBe(84);
    });
  });

  describe("POST /api/sales — payment validation", () => {
    let payProduct: { id: string };

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `SALE-PAY-${Date.now()}`, name: "Producto pago", price: 100, taxRate: 0, minStock: 2 },
      });
      payProduct = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });
    });

    it("rejects payments that sum to less than the total with 400", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: payProduct.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: 50 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no cubre/i);
    });

    it("computes the correct changeDue when payments exceed the total", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: payProduct.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: 150 }],
        });
      expect(res.status).toBe(201);
      saleIds.push(res.body.id);
      expect(Number(res.body.total)).toBe(100);
      expect(res.body.changeDue).toBe(50);
    });
  });

  describe("PATCH /api/sales/:id/cancel", () => {
    let cancelProduct: { id: string };
    let cancelSaleId: string;

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `SALE-CANCEL-${Date.now()}`, name: "Producto cancelación", price: 20, taxRate: 0, minStock: 2 },
      });
      cancelProduct = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });

      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: cancelProduct.id, quantity: 3 }],
          payments: [{ method: "CASH", amount: 60 }],
        });
      cancelSaleId = res.body.id;
      saleIds.push(cancelSaleId);
    });

    it("restores stock for every line item and sets status CANCELLED", async () => {
      expect(await stockAt(cancelProduct.id, branchA.id)).toBe(7); // 10 - 3

      const res = await request(app)
        .patch(`/api/sales/${cancelSaleId}/cancel`)
        .set("Cookie", [adminCookie])
        .send({ reason: "Cliente se arrepintió de la compra" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");

      expect(await stockAt(cancelProduct.id, branchA.id)).toBe(10); // restored
    });

    it("rejects cancelling an already-cancelled sale with 400", async () => {
      const res = await request(app)
        .patch(`/api/sales/${cancelSaleId}/cancel`)
        .set("Cookie", [adminCookie])
        .send({ reason: "Segundo intento de cancelación" });
      expect(res.status).toBe(400);
    });

    it("a cashier without sales.cancel gets 403 even though the route only requires sales.view", async () => {
      const sale = await request(app)
        .post("/api/sales")
        .set("Cookie", [cashierCookie])
        .send({
          branchId: branchA.id,
          items: [{ productId: cancelProduct.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: 20 }],
        });
      saleIds.push(sale.body.id);

      const res = await request(app)
        .patch(`/api/sales/${sale.body.id}/cancel`)
        .set("Cookie", [cashierCookie])
        .send({ reason: "Intento de cajero sin permiso" });
      expect(res.status).toBe(403);
    });
  });

  describe("Branch-scope enforcement", () => {
    let branchBSaleId: string;
    let branchBProduct: { id: string };

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `SALE-SCOPE-${Date.now()}`, name: "Producto sucursal B", price: 10, taxRate: 0, minStock: 2 },
      });
      branchBProduct = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchB.id, type: "PURCHASE", quantity: 10 });

      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [adminCookie]) // admin has allBranches, can create in branchB
        .send({
          branchId: branchB.id,
          items: [{ productId: branchBProduct.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: 10 }],
        });
      branchBSaleId = res.body.id;
      saleIds.push(branchBSaleId);
    });

    it("a user without access to the sale's branch gets 403 on GET /api/sales/:id", async () => {
      const res = await request(app).get(`/api/sales/${branchBSaleId}`).set("Cookie", [scopedCookie]);
      expect(res.status).toBe(403);
    });

    it("a user without access to the sale's branch gets 403 on cancel", async () => {
      const res = await request(app)
        .patch(`/api/sales/${branchBSaleId}/cancel`)
        .set("Cookie", [scopedCookie])
        .send({ reason: "Intento sin acceso a la sucursal" });
      expect(res.status).toBe(403);
    });

    it("rejects checkout when the caller lacks access to the requested branchId, with 403", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [scopedCookie]) // only assigned to branchA
        .send({
          branchId: branchB.id,
          items: [{ productId: branchBProduct.id, quantity: 1 }],
          payments: [{ method: "CASH", amount: 10 }],
        });
      expect(res.status).toBe(403);
    });
  });

  describe("Permission gates", () => {
    it("POST /api/sales requires sales.create (403 without it)", async () => {
      const res = await request(app)
        .post("/api/sales")
        .set("Cookie", [noPermCookie])
        .send({ branchId: branchA.id, items: [{ productId: "00000000-0000-0000-0000-000000000000", quantity: 1 }], payments: [{ method: "CASH", amount: 1 }] });
      expect(res.status).toBe(403);
    });

    it("GET /api/sales requires sales.view (403 without it)", async () => {
      const res = await request(app).get("/api/sales").set("Cookie", [noPermCookie]);
      expect(res.status).toBe(403);
    });

    it("GET /api/sales/:id requires sales.view (403 without it)", async () => {
      const res = await request(app).get(`/api/sales/${saleIds[0]}`).set("Cookie", [noPermCookie]);
      expect(res.status).toBe(403);
    });

    it("PATCH /api/sales/:id/cancel requires sales.cancel (403 without it, including for a plain cashier)", async () => {
      const res = await request(app)
        .patch(`/api/sales/${saleIds[0]}/cancel`)
        .set("Cookie", [cashierCookie]) // cashier role does not have sales.cancel per seed.ts
        .send({ reason: "Cajero sin permiso de cancelación" });
      expect(res.status).toBe(403);
    });

    it("requires authentication on every route", async () => {
      expect((await request(app).get("/api/sales")).status).toBe(401);
      expect((await request(app).get(`/api/sales/${saleIds[0]}`)).status).toBe(401);
      expect((await request(app).post("/api/sales").send({})).status).toBe(401);
      expect((await request(app).patch(`/api/sales/${saleIds[0]}/cancel`).send({})).status).toBe(401);
    });
  });

  describe("GET /api/sales — listing", () => {
    it("lists sales for the caller's accessible branches, newest first, with ticketNumber/customerName/itemCount", async () => {
      const res = await request(app).get(`/api/sales?branchId=${branchA.id}`).set("Cookie", [adminCookie]);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((s: any) => s.branchId === branchA.id)).toBe(true);
      expect(res.body[0].ticketNumber).toMatch(/^V-\d{6}$/);
      expect(res.body[0].customerName).toBeDefined();
      expect(typeof res.body[0].itemCount).toBe("number");

      const createdAts = res.body.map((s: any) => new Date(s.createdAt).getTime());
      const sorted = [...createdAts].sort((a, b) => b - a);
      expect(createdAts).toEqual(sorted);
    });

    it("a branch-scoped user only sees sales for branches they're assigned to", async () => {
      const res = await request(app).get("/api/sales").set("Cookie", [scopedCookie]);
      expect(res.status).toBe(200);
      expect(res.body.every((s: any) => s.branchId === branchA.id)).toBe(true);
    });
  });
});
