import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { PIN_GENERIC_ERROR } from "../src/services/pinAuthService";

// CompanySettings.requirePinForDiscounts/Returns/Shrinkage: interruptores
// que deciden si sales.create/returns.create/mermas.create exigen un PIN de
// supervisor. CompanySettings es una fila global única (no por sucursal), así
// que cada bloque restaura los tres campos a `true` (su valor por defecto) en
// un afterEach — dejar uno en `false` filtraría hacia otros archivos de test
// que corren en el mismo proceso (vitest.config.ts usa singleFork).
describe("Configuración de PIN por acción (CompanySettings)", () => {
  const PASSWORD = "Password#123";

  const SUPERVISOR_PIN = "3690"; // branch_manager => holds sales.cancel/inventory.adjust también

  let cashierCookie: string; // sales.create/returns.create/shrinkage.create, SIN los *.authorize/.cancel/.adjust
  let branchA: { id: string };
  let category: { id: string };

  const productIds: string[] = [];
  const saleIds: string[] = [];
  const returnIds: string[] = [];
  const mermaIds: string[] = [];
  const adjustmentMovementIds: string[] = [];
  const testUsernames = ["pinpolicy_test_cashier", "pinpolicy_test_supervisor"];

  async function makeProduct(sku: string, price: number) {
    const p = await prisma.product.create({
      data: {
        sku: `${sku}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Producto ${sku}`,
        price,
        cost: 10,
        taxRate: 0,
        categoryId: category.id,
        minStock: 1,
      },
    });
    productIds.push(p.id);
    return p;
  }

  async function giveStock(productId: string, branchId: string, qty: number) {
    await prisma.inventory.create({ data: { productId, branchId, stock: qty } });
  }

  async function setPinPolicy(overrides: Partial<{
    requirePinForDiscounts: boolean;
    requirePinForReturns: boolean;
    requirePinForShrinkage: boolean;
    allowPinForSaleCancel: boolean;
    allowPinForInventoryAdjust: boolean;
  }>) {
    const res = await request(app).put("/api/company-settings").set("Cookie", [cashierAdminCookie]).send(overrides);
    expect(res.status).toBe(200);
    return res.body;
  }

  let cashierAdminCookie: string; // admin, used only to flip CompanySettings

  beforeAll(async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });

    category = await prisma.category.create({ data: { name: `PinPolicy Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `PinPolicy Sucursal ${Date.now()}` } });

    const cashierUser = await prisma.user.upsert({
      where: { username: "pinpolicy_test_cashier" },
      update: {},
      create: {
        firstName: "PinPolicy", lastName: "Cashier", displayName: "PinPolicy Cashier",
        username: "pinpolicy_test_cashier", email: "pinpolicy_test_cashier@bellamakeup.demo",
        passwordHash: await hashPassword(PASSWORD), avatarSeed: "seed", roleId: cashierRole.id, allBranches: true,
      },
    });
    cashierCookie = `access_token=${signAccessToken({ sub: cashierUser.id, roleId: cashierRole.id })}`;

    // branch_manager ya tiene sales.cancel e inventory.adjust por el seed, así
    // que sirve como el mismo "supervisor" para estas dos acciones también.
    await prisma.user.upsert({
      where: { username: "pinpolicy_test_supervisor" },
      update: { pinHash: await hashPassword(SUPERVISOR_PIN) },
      create: {
        firstName: "PinPolicy", lastName: "Supervisor", displayName: "PinPolicy Supervisor",
        username: "pinpolicy_test_supervisor", email: "pinpolicy_test_supervisor@bellamakeup.demo",
        passwordHash: await hashPassword(PASSWORD), avatarSeed: "seed", roleId: managerRole.id,
        allBranches: true, pinHash: await hashPassword(SUPERVISOR_PIN),
      },
    });

    const adminUser = await prisma.user.findFirstOrThrow({ where: { roleId: adminRole.id } });
    cashierAdminCookie = `access_token=${signAccessToken({ sub: adminUser.id, roleId: adminRole.id })}`;
  });

  afterEach(async () => {
    // Restaura el comportamiento histórico (obligatorio/deshabilitado) para
    // no filtrar estado hacia otros archivos de test.
    await setPinPolicy({
      requirePinForDiscounts: true,
      requirePinForReturns: true,
      requirePinForShrinkage: true,
      allowPinForSaleCancel: false,
      allowPinForInventoryAdjust: false,
    });
  });

  afterAll(async () => {
    if (mermaIds.length) await prisma.mermaItem.deleteMany({ where: { mermaId: { in: mermaIds } } });
    if (mermaIds.length) await prisma.merma.deleteMany({ where: { id: { in: mermaIds } } });
    if (returnIds.length) await prisma.returnItem.deleteMany({ where: { returnId: { in: returnIds } } });
    if (returnIds.length) await prisma.return.deleteMany({ where: { id: { in: returnIds } } });
    if (saleIds.length) {
      await prisma.salePayment.deleteMany({ where: { saleId: { in: saleIds } } });
      await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    }
    if (adjustmentMovementIds.length) {
      await prisma.inventoryAdjustment.deleteMany({ where: { movementId: { in: adjustmentMovementIds } } });
    }
    if (productIds.length) {
      await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    await prisma.branch.delete({ where: { id: branchA.id } }).catch(() => {});
    await prisma.category.delete({ where: { id: category.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
  });

  it("GET /api/company-settings expone los cinco interruptores", async () => {
    const res = await request(app).get("/api/company-settings").set("Cookie", [cashierCookie]);
    expect(res.status).toBe(200);
    expect(typeof res.body.requirePinForDiscounts).toBe("boolean");
    expect(typeof res.body.requirePinForReturns).toBe("boolean");
    expect(typeof res.body.requirePinForShrinkage).toBe("boolean");
    expect(typeof res.body.allowPinForSaleCancel).toBe("boolean");
    expect(typeof res.body.allowPinForInventoryAdjust).toBe("boolean");
  });

  describe("Descuentos", () => {
    it("con requirePinForDiscounts=true, un descuento grande sin PIN es rechazado con 403", async () => {
      const p = await makeProduct("PIN-DISC", 100);
      await giveStock(p.id, branchA.id, 10);
      const res = await request(app).post("/api/sales").set("Cookie", [cashierCookie]).send({
        branchId: branchA.id,
        items: [{ productId: p.id, quantity: 1, discount: 50 }],
        payments: [{ method: "CASH", amount: 50 }],
      });
      expect(res.status).toBe(403);
    });

    it("con requirePinForDiscounts=false, el mismo descuento se acepta sin pinCode", async () => {
      await setPinPolicy({ requirePinForDiscounts: false });
      const p = await makeProduct("PIN-DISC-OFF", 100);
      await giveStock(p.id, branchA.id, 10);
      const res = await request(app).post("/api/sales").set("Cookie", [cashierCookie]).send({
        branchId: branchA.id,
        items: [{ productId: p.id, quantity: 1, discount: 50 }],
        payments: [{ method: "CASH", amount: 50 }],
      });
      expect(res.status).toBe(201);
      saleIds.push(res.body.id);
      expect(Number(res.body.discountTotal)).toBe(50);
    });
  });

  describe("Devoluciones", () => {
    async function ringUpSale(productId: string, price: number) {
      const res = await request(app).post("/api/sales").set("Cookie", [cashierCookie]).send({
        branchId: branchA.id,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: price }],
      });
      saleIds.push(res.body.id);
      return res.body;
    }

    it("con requirePinForReturns=true (default) y sin pinCode, la devolución es rechazada con 401", async () => {
      const p = await makeProduct("PIN-RET", 80);
      await giveStock(p.id, branchA.id, 5);
      const sale = await ringUpSale(p.id, 80);
      const res = await request(app).post("/api/returns").set("Cookie", [cashierCookie]).send({
        originalSaleId: sale.id,
        returnedItems: [{ saleItemId: sale.items[0].id, quantity: 1, restock: true }],
      });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe(PIN_GENERIC_ERROR);
    });

    it("con requirePinForReturns=false, la devolución se acepta sin pinCode y se autoatribuye", async () => {
      await setPinPolicy({ requirePinForReturns: false });
      const p = await makeProduct("PIN-RET-OFF", 80);
      await giveStock(p.id, branchA.id, 5);
      const sale = await ringUpSale(p.id, 80);
      const res = await request(app).post("/api/returns").set("Cookie", [cashierCookie]).send({
        originalSaleId: sale.id,
        returnedItems: [{ saleItemId: sale.items[0].id, quantity: 1, restock: true }],
      });
      expect(res.status).toBe(201);
      returnIds.push(res.body.id);

      const stored = await prisma.return.findUniqueOrThrow({ where: { id: res.body.id } });
      const cashier = await prisma.user.findUniqueOrThrow({ where: { username: "pinpolicy_test_cashier" } });
      expect(stored.authorizedByUserId).toBe(cashier.id);
    });
  });

  describe("Mermas", () => {
    it("con requirePinForShrinkage=true (default) y sin pinCode, la merma es rechazada con 401", async () => {
      const p = await makeProduct("PIN-MER", 50);
      await giveStock(p.id, branchA.id, 5);
      const res = await request(app).post("/api/mermas").set("Cookie", [cashierCookie]).send({
        branchId: branchA.id,
        type: "DANO_EN_TIENDA",
        comments: "Prueba sin PIN",
        items: [{ productId: p.id, quantity: 1 }],
      });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe(PIN_GENERIC_ERROR);
    });

    it("con requirePinForShrinkage=false, la merma se acepta sin pinCode y se autoatribuye", async () => {
      await setPinPolicy({ requirePinForShrinkage: false });
      const p = await makeProduct("PIN-MER-OFF", 50);
      await giveStock(p.id, branchA.id, 5);
      const res = await request(app).post("/api/mermas").set("Cookie", [cashierCookie]).send({
        branchId: branchA.id,
        type: "DANO_EN_TIENDA",
        comments: "Prueba sin PIN",
        items: [{ productId: p.id, quantity: 1 }],
      });
      expect(res.status).toBe(201);
      mermaIds.push(res.body.id);

      const stored = await prisma.merma.findUniqueOrThrow({ where: { id: res.body.id } });
      const cashier = await prisma.user.findUniqueOrThrow({ where: { username: "pinpolicy_test_cashier" } });
      expect(stored.authorizedByUserId).toBe(cashier.id);
    });
  });

  describe("Cancelación de ventas", () => {
    async function ringUpSale(productId: string, price: number) {
      const res = await request(app).post("/api/sales").set("Cookie", [cashierCookie]).send({
        branchId: branchA.id,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: price }],
      });
      saleIds.push(res.body.id);
      return res.body;
    }

    it("con allowPinForSaleCancel=false (default), un cajero sin sales.cancel no puede cancelar ni con PIN", async () => {
      const p = await makeProduct("PIN-CANCEL-OFF", 60);
      await giveStock(p.id, branchA.id, 5);
      const sale = await ringUpSale(p.id, 60);
      const res = await request(app)
        .patch(`/api/sales/${sale.id}/cancel`)
        .set("Cookie", [cashierCookie])
        .send({ reason: "Cliente cambió de opinión", pinCode: SUPERVISOR_PIN });
      expect(res.status).toBe(403);
    });

    it("con allowPinForSaleCancel=true, un PIN de supervisor válido permite cancelar", async () => {
      await setPinPolicy({ allowPinForSaleCancel: true });
      const p = await makeProduct("PIN-CANCEL-ON", 60);
      await giveStock(p.id, branchA.id, 5);
      const sale = await ringUpSale(p.id, 60);

      const wrongPin = await request(app)
        .patch(`/api/sales/${sale.id}/cancel`)
        .set("Cookie", [cashierCookie])
        .send({ reason: "Intento con PIN incorrecto", pinCode: "0000" });
      expect(wrongPin.status).toBe(401);
      expect(wrongPin.body.message).toBe(PIN_GENERIC_ERROR);

      const res = await request(app)
        .patch(`/api/sales/${sale.id}/cancel`)
        .set("Cookie", [cashierCookie])
        .send({ reason: "Cliente cambió de opinión", pinCode: SUPERVISOR_PIN });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });
  });

  describe("Ajuste de inventario", () => {
    it("con allowPinForInventoryAdjust=false (default), un cajero sin inventory.adjust no puede ajustar ni con PIN", async () => {
      const p = await makeProduct("PIN-ADJ-OFF", 40);
      await giveStock(p.id, branchA.id, 5);
      const res = await request(app).post("/api/inventory/adjust").set("Cookie", [cashierCookie]).send({
        productId: p.id,
        branchId: branchA.id,
        quantity: 2,
        reason: "Conteo físico encontró más unidades",
        pinCode: SUPERVISOR_PIN,
      });
      expect(res.status).toBe(403);
    });

    it("con allowPinForInventoryAdjust=true, un PIN de supervisor válido permite ajustar y queda como autorizador", async () => {
      await setPinPolicy({ allowPinForInventoryAdjust: true });
      const p = await makeProduct("PIN-ADJ-ON", 40);
      await giveStock(p.id, branchA.id, 5);

      const res = await request(app).post("/api/inventory/adjust").set("Cookie", [cashierCookie]).send({
        productId: p.id,
        branchId: branchA.id,
        quantity: 2,
        reason: "Conteo físico encontró más unidades",
        pinCode: SUPERVISOR_PIN,
      });
      expect(res.status).toBe(201);
      adjustmentMovementIds.push(res.body.id);

      const stored = await prisma.inventoryAdjustment.findUniqueOrThrow({ where: { movementId: res.body.id } });
      const supervisor = await prisma.user.findUniqueOrThrow({ where: { username: "pinpolicy_test_supervisor" } });
      expect(stored.authorizedBy).toBe(supervisor.id);
    });
  });
});
