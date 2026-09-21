import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { PIN_GENERIC_ERROR } from "../src/services/pinAuthService";

// Mermas (shrinkage write-offs).
//
// Same rate-limit constraint as returns.test.ts: POST /api/mermas carries a
// PIN attempt limiter of 5 FAILED PIN authorizations per 15 minutes keyed on
// the acting user. Only 401s consume it, so the deliberate 400s below are
// free — but the wrong-PIN block uses a dedicated actor regardless.
describe("Mermas (shrinkage write-offs)", () => {
  const PASSWORD = "Password#123";
  const SUPERVISOR_PIN = "7531"; // branch_manager => holds shrinkage.authorize
  const WRONG_PIN = "0000";
  const WAREHOUSE_OWN_PIN = "1470"; // valid PIN, owner cannot authorize

  let cashierCookie: string;
  let cashierId: string;
  let warehouseCookie: string;
  let pinFailCookie: string;
  let managerCookie: string; // shrinkage.view + authorize, NO shrinkage.create
  let noPermCookie: string;
  let scopedCookie: string; // cashier scoped to branchB only
  let supervisorId: string;

  let branchA: { id: string };
  let branchB: { id: string };
  let category: { id: string };

  const productIds: string[] = [];
  const mermaIds: string[] = [];
  const testUsernames = [
    "mermas_test_cashier",
    "mermas_test_warehouse",
    "mermas_test_warehouse_pin",
    "mermas_test_pinfail",
    "mermas_test_manager",
    "mermas_test_noperm",
    "mermas_test_scoped",
  ];
  const testRoleCodes = ["mermas_test_no_perms"];

  async function stockAt(productId: string, branchId: string, variantId?: string) {
    const row = await prisma.inventory.findFirst({ where: { productId, branchId, variantId: variantId ?? null } });
    return row?.stock ?? 0;
  }

  async function makeProduct(sku: string, opts: { price: number; cost: number; promoPrice?: number }) {
    const p = await prisma.product.create({
      data: {
        sku: `${sku}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Producto ${sku}`,
        price: opts.price,
        cost: opts.cost,
        promoPrice: opts.promoPrice,
        taxRate: 0,
        categoryId: category.id,
        minStock: 1,
      },
    });
    productIds.push(p.id);
    return p;
  }

  async function giveStock(productId: string, branchId: string, qty: number, variantId?: string) {
    await prisma.inventory.create({ data: { productId, variantId, branchId, stock: qty } });
  }

  async function postMerma(body: Record<string, unknown>, cookie = cashierCookie) {
    const res = await request(app).post("/api/mermas").set("Cookie", [cookie]).send(body);
    if (res.body?.id) mermaIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const warehouseRole = await prisma.role.findUniqueOrThrow({ where: { code: "warehouse" } });
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });

    category = await prisma.category.create({ data: { name: `Mermas Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `Mermas Sucursal A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Mermas Sucursal B ${Date.now()}` } });

    const mk = async (username: string, roleId: string, allBranches: boolean, pin?: string, branchId?: string) => {
      const u = await prisma.user.upsert({
        where: { username },
        update: {},
        create: {
          firstName: "Mermas",
          lastName: username,
          displayName: `Mermas ${username}`,
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

    const cashier = await mk("mermas_test_cashier", cashierRole.id, true);
    cashierCookie = cashier.cookie;
    cashierId = cashier.user.id;

    warehouseCookie = (await mk("mermas_test_warehouse", warehouseRole.id, true)).cookie;
    // An Almacenista WITH a PIN — again proving it is the permission, not
    // the PIN's existence, that authorizes.
    await mk("mermas_test_warehouse_pin", warehouseRole.id, true, WAREHOUSE_OWN_PIN);
    pinFailCookie = (await mk("mermas_test_pinfail", cashierRole.id, true)).cookie;

    const manager = await mk("mermas_test_manager", managerRole.id, true, SUPERVISOR_PIN);
    managerCookie = manager.cookie;
    supervisorId = manager.user.id;

    const noPermRole = await prisma.role.upsert({
      where: { code: "mermas_test_no_perms" },
      update: {},
      create: { code: "mermas_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    noPermCookie = (await mk("mermas_test_noperm", noPermRole.id, true)).cookie;

    scopedCookie = (await mk("mermas_test_scoped", cashierRole.id, false, undefined, branchB.id)).cookie;
  });

  afterAll(async () => {
    await prisma.merma.deleteMany({ where: { id: { in: mermaIds } } }); // cascades MermaItem
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.role.deleteMany({ where: { code: { in: testRoleCodes } } }).catch(() => {});
  });

  describe("POST /api/mermas — registering a write-off", () => {
    it("decrements stock and records BOTH the cost and the retail impact", async () => {
      // cost 90, price 199 — the two numbers must not be confused with each
      // other, which is exactly why both are asserted on the same document.
      const product = await makeProduct("MER-BASIC", { price: 199, cost: 90 });
      await giveStock(product.id, branchA.id, 10);

      const res = await postMerma({
        branchId: branchA.id,
        type: "TESTER_EXHIBICION",
        comments: "Tester abierto en el mostrador para demostración",
        items: [{ productId: product.id, quantity: 3 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(res.body.mermaNumber).toMatch(/^M-\d{6}$/);
      expect(res.body.type).toBe("TESTER_EXHIBICION");
      // 3 * 90 cost, 3 * 199 retail.
      expect(Number(res.body.totalCostImpact)).toBe(270);
      expect(Number(res.body.totalRetailImpact)).toBe(597);
      expect(res.body.requestedByUserId).toBe(cashierId);
      expect(res.body.authorizedByUserId).toBe(supervisorId);
      expect(res.body.itemCount).toBe(1);
      expect(res.body.totalUnits).toBe(3);
      expect(Number(res.body.items[0].unitCost)).toBe(90);
      expect(Number(res.body.items[0].unitRetail)).toBe(199);

      expect(await stockAt(product.id, branchA.id)).toBe(7);

      const movements = await prisma.inventoryMovement.findMany({ where: { reference: res.body.id } });
      expect(movements).toHaveLength(1);
      // A merma IS an adjustment with an audited reason — it reuses
      // MovementType.ADJUSTMENT rather than inventing a type.
      expect(movements[0].type).toBe("ADJUSTMENT");
      expect(movements[0].quantity).toBe(-3);
      expect(movements[0].stockBefore).toBe(10);
      expect(movements[0].stockAfter).toBe(7);
    });

    it("sums cost and retail impact across multiple lines", async () => {
      const a = await makeProduct("MER-MULTI-A", { price: 100, cost: 40 });
      const b = await makeProduct("MER-MULTI-B", { price: 250, cost: 125 });
      await giveStock(a.id, branchA.id, 10);
      await giveStock(b.id, branchA.id, 10);

      const res = await postMerma({
        branchId: branchA.id,
        type: "DANO_EN_TIENDA",
        comments: "Caja de producto cayó del anaquel y se rompió",
        items: [
          { productId: a.id, quantity: 2 }, // cost 80, retail 200
          { productId: b.id, quantity: 4 }, // cost 500, retail 1000
        ],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(Number(res.body.totalCostImpact)).toBe(580);
      expect(Number(res.body.totalRetailImpact)).toBe(1200);
      expect(res.body.totalUnits).toBe(6);
      expect(await stockAt(a.id, branchA.id)).toBe(8);
      expect(await stockAt(b.id, branchA.id)).toBe(6);
    });

    it("snapshots the promo price as retail impact when one is active", async () => {
      // The retail impact answers "what would this have sold for today",
      // which is resolveUnitPrice's answer — the promo, not the list price.
      const product = await makeProduct("MER-PROMO", { price: 300, cost: 100, promoPrice: 210 });
      await giveStock(product.id, branchA.id, 5);

      const res = await postMerma({
        branchId: branchA.id,
        type: "CADUCIDAD_VENCIDO",
        comments: "Lote vencido retirado del anaquel",
        items: [{ productId: product.id, quantity: 2 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(Number(res.body.totalCostImpact)).toBe(200);
      expect(Number(res.body.totalRetailImpact)).toBe(420); // 2 * 210, not 2 * 300
    });

    it("writes off a specific variant without touching the product's other variants", async () => {
      const product = await makeProduct("MER-VARIANT", { price: 129, cost: 80 });
      const nude = await prisma.productVariant.create({
        data: { productId: product.id, name: "Nude", sku: `MER-VAR-NUDE-${Date.now()}` },
      });
      const rojo = await prisma.productVariant.create({
        data: { productId: product.id, name: "Rojo", sku: `MER-VAR-ROJO-${Date.now()}` },
      });
      await giveStock(product.id, branchA.id, 6, nude.id);
      await giveStock(product.id, branchA.id, 6, rojo.id);

      const res = await postMerma({
        branchId: branchA.id,
        type: "MUESTRA_REGALO_CLIENTE",
        comments: "Muestra obsequiada a clienta frecuente",
        items: [{ productId: product.id, variantId: nude.id, quantity: 2 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(201);
      expect(await stockAt(product.id, branchA.id, nude.id)).toBe(4);
      expect(await stockAt(product.id, branchA.id, rojo.id)).toBe(6); // untouched
    });

    it("accepts every MermaType value", async () => {
      const types = [
        "TESTER_EXHIBICION",
        "DANO_EN_TIENDA",
        "CADUCIDAD_VENCIDO",
        "MUESTRA_REGALO_CLIENTE",
        "DEFECTO_PROVEEDOR",
      ];

      for (const type of types) {
        const product = await makeProduct(`MER-TYPE-${type}`, { price: 100, cost: 50 });
        await giveStock(product.id, branchA.id, 4);

        const res = await postMerma({
          branchId: branchA.id,
          type,
          comments: `Registro de merma por ${type}`,
          items: [{ productId: product.id, quantity: 1 }],
          pinCode: SUPERVISOR_PIN,
        });

        expect(res.status).toBe(201);
        expect(res.body.type).toBe(type);
        expect(await stockAt(product.id, branchA.id)).toBe(3);
      }
    });

    it("rejects an unknown MermaType with 400", async () => {
      const product = await makeProduct("MER-BADTYPE", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 4);

      const res = await postMerma({
        branchId: branchA.id,
        type: "ROBO_HORMIGA",
        comments: "Categoría inexistente",
        items: [{ productId: product.id, quantity: 1 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(await stockAt(product.id, branchA.id)).toBe(4);
    });

    it("lets an Almacenista register a merma too", async () => {
      const product = await makeProduct("MER-WAREHOUSE", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 5);

      const res = await postMerma(
        {
          branchId: branchA.id,
          type: "DEFECTO_PROVEEDOR",
          comments: "Unidades llegaron con el sello roto desde el proveedor",
          items: [{ productId: product.id, quantity: 2 }],
          pinCode: SUPERVISOR_PIN,
        },
        warehouseCookie
      );

      expect(res.status).toBe(201);
      expect(await stockAt(product.id, branchA.id)).toBe(3);
    });
  });

  describe("Mandatory comments", () => {
    it("rejects a missing comments field with 400", async () => {
      const product = await makeProduct("MER-NOCOMMENT", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 5);

      const res = await postMerma({
        branchId: branchA.id,
        type: "DANO_EN_TIENDA",
        items: [{ productId: product.id, quantity: 1 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(await stockAt(product.id, branchA.id)).toBe(5);
    });

    it("rejects an empty or whitespace-only comment with 400", async () => {
      const product = await makeProduct("MER-BLANKCOMMENT", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 5);

      for (const comments of ["", "   "]) {
        const res = await postMerma({
          branchId: branchA.id,
          type: "DANO_EN_TIENDA",
          comments,
          items: [{ productId: product.id, quantity: 1 }],
          pinCode: SUPERVISOR_PIN,
        });
        expect(res.status).toBe(400);
      }

      expect(await stockAt(product.id, branchA.id)).toBe(5);
    });
  });

  describe("Stock limits", () => {
    it("refuses to write off more than the branch actually has, with zero side effects", async () => {
      const product = await makeProduct("MER-OVER", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 3);

      const res = await postMerma({
        branchId: branchA.id,
        type: "DANO_EN_TIENDA",
        comments: "Intento de dar de baja más de lo que hay",
        items: [{ productId: product.id, quantity: 4 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/[Ss]tock insuficiente/);
      expect(await stockAt(product.id, branchA.id)).toBe(3);
      expect(await prisma.merma.count({ where: { branchId: branchA.id, comments: "Intento de dar de baja más de lo que hay" } })).toBe(0);
    });

    it("rolls back the whole document when a later line exceeds stock", async () => {
      const ok = await makeProduct("MER-ATOMIC-OK", { price: 100, cost: 50 });
      const bad = await makeProduct("MER-ATOMIC-BAD", { price: 100, cost: 50 });
      await giveStock(ok.id, branchA.id, 10);
      await giveStock(bad.id, branchA.id, 1);

      const res = await postMerma({
        branchId: branchA.id,
        type: "CADUCIDAD_VENCIDO",
        comments: "Primera línea válida, segunda excede existencias",
        items: [
          { productId: ok.id, quantity: 2 },
          { productId: bad.id, quantity: 5 },
        ],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
      // The valid first line must NOT have been applied.
      expect(await stockAt(ok.id, branchA.id)).toBe(10);
      expect(await stockAt(bad.id, branchA.id)).toBe(1);
    });

    it("rejects a non-positive quantity with 400", async () => {
      const product = await makeProduct("MER-ZEROQTY", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 5);

      const res = await postMerma({
        branchId: branchA.id,
        type: "DANO_EN_TIENDA",
        comments: "Cantidad inválida",
        items: [{ productId: product.id, quantity: 0 }],
        pinCode: SUPERVISOR_PIN,
      });

      expect(res.status).toBe(400);
    });

    it("rejects an empty item list with 400", async () => {
      const res = await postMerma({
        branchId: branchA.id,
        type: "DANO_EN_TIENDA",
        comments: "Sin artículos",
        items: [],
        pinCode: SUPERVISOR_PIN,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Supervisor PIN authorization", () => {
    it("rejects a wrong PIN with the exact generic message and writes NOTHING", async () => {
      const product = await makeProduct("MER-BADPIN", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 8);

      const stockBefore = await stockAt(product.id, branchA.id);
      const mermasBefore = await prisma.merma.count();
      const mermaItemsBefore = await prisma.mermaItem.count();
      const movementsBefore = await prisma.inventoryMovement.count({ where: { productId: product.id } });

      const res = await request(app)
        .post("/api/mermas")
        .set("Cookie", [pinFailCookie])
        .send({
          branchId: branchA.id,
          type: "DANO_EN_TIENDA",
          comments: "Intento con PIN incorrecto",
          items: [{ productId: product.id, quantity: 2 }],
          pinCode: WRONG_PIN,
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(PIN_GENERIC_ERROR);

      expect(await stockAt(product.id, branchA.id)).toBe(stockBefore);
      expect(await prisma.merma.count()).toBe(mermasBefore);
      expect(await prisma.mermaItem.count()).toBe(mermaItemsBefore);
      expect(await prisma.inventoryMovement.count({ where: { productId: product.id } })).toBe(movementsBefore);
    });

    it("rejects a valid PIN whose owner lacks shrinkage.authorize, with the same generic message", async () => {
      const product = await makeProduct("MER-WHPIN", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 5);

      const res = await request(app)
        .post("/api/mermas")
        .set("Cookie", [pinFailCookie])
        .send({
          branchId: branchA.id,
          type: "DANO_EN_TIENDA",
          comments: "PIN válido pero sin permiso de autorización",
          items: [{ productId: product.id, quantity: 1 }],
          pinCode: WAREHOUSE_OWN_PIN,
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(PIN_GENERIC_ERROR);
      expect(await stockAt(product.id, branchA.id)).toBe(5);
    });

    it("never leaks the supervisor's PIN or any credential hash", async () => {
      const product = await makeProduct("MER-NOLEAK", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 5);

      const res = await postMerma({
        branchId: branchA.id,
        type: "TESTER_EXHIBICION",
        comments: "Verificación de fuga de credenciales",
        items: [{ productId: product.id, quantity: 1 }],
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
      const res = await request(app).post("/api/mermas").set("Cookie", [noPermCookie]).send({});
      expect(res.status).toBe(403);
    });

    it("rejects an unauthenticated caller with 401", async () => {
      const res = await request(app).post("/api/mermas").send({});
      expect(res.status).toBe(401);
    });

    it("rejects a branch manager (no shrinkage.create) from registering one", async () => {
      // The manager authorizes write-offs; they do not request them.
      const res = await request(app).post("/api/mermas").set("Cookie", [managerCookie]).send({});
      expect(res.status).toBe(403);
    });

    it("rejects a user scoped to another branch with 403", async () => {
      const product = await makeProduct("MER-SCOPE", { price: 100, cost: 50 });
      await giveStock(product.id, branchA.id, 5);

      const res = await request(app)
        .post("/api/mermas")
        .set("Cookie", [scopedCookie])
        .send({
          branchId: branchA.id,
          type: "DANO_EN_TIENDA",
          comments: "Sucursal fuera de alcance",
          items: [{ productId: product.id, quantity: 1 }],
          pinCode: SUPERVISOR_PIN,
        });

      expect(res.status).toBe(403);
      expect(await stockAt(product.id, branchA.id)).toBe(5);
    });

    it("lists and fetches mermas, filters by type, and scopes by branch", async () => {
      const list = await request(app).get("/api/mermas").set("Cookie", [cashierCookie]);
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(list.body.length).toBeGreaterThan(0);
      expect(list.body[0].mermaNumber).toMatch(/^M-\d{6}$/);

      const filtered = await request(app)
        .get("/api/mermas?type=TESTER_EXHIBICION")
        .set("Cookie", [cashierCookie]);
      expect(filtered.status).toBe(200);
      expect(filtered.body.length).toBeGreaterThan(0);
      expect(filtered.body.every((m: { type: string }) => m.type === "TESTER_EXHIBICION")).toBe(true);

      const one = await request(app).get(`/api/mermas/${mermaIds[0]}`).set("Cookie", [cashierCookie]);
      expect(one.status).toBe(200);
      expect(one.body.id).toBe(mermaIds[0]);

      // A user scoped to branchB cannot read a branchA merma.
      const denied = await request(app).get(`/api/mermas/${mermaIds[0]}`).set("Cookie", [scopedCookie]);
      expect(denied.status).toBe(403);

      const noPerm = await request(app).get("/api/mermas").set("Cookie", [noPermCookie]);
      expect(noPerm.status).toBe(403);
    });

    it("a manager can READ mermas even though they cannot create them", async () => {
      const res = await request(app).get("/api/mermas").set("Cookie", [managerCookie]);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("passwordHash");
      expect(body).not.toContain("pinHash");
    });
  });
});
