import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { applyMovement } from "../src/services/inventoryService";

describe("Transfers / inter-branch stock transfers", () => {
  let adminCookie: string;
  let managerCookie: string; // allBranches branch_manager (has transfers.create/receive/cancel/view)
  let cashierCookie: string; // has none of the transfers.* permissions
  let noPermCookie: string;
  let scopedCookie: string; // only assigned to branchA, used for cross-branch 403 tests

  let branchA: { id: string };
  let branchB: { id: string };
  let branchC: { id: string }; // unrelated third branch, used for scope tests
  let category: { id: string };

  const productIds: string[] = [];
  const transferIds: string[] = [];
  const testUsernames = [
    "transfers_test_admin",
    "transfers_test_manager",
    "transfers_test_cashier",
    "transfers_test_noperm",
    "transfers_test_scoped",
  ];
  const testRoleCodes = ["transfers_test_no_perms"];

  async function stockAt(productId: string, branchId: string, variantId?: string) {
    const row = await prisma.inventory.findFirst({ where: { productId, branchId, variantId: variantId ?? null } });
    return row?.stock ?? 0;
  }

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const adminUser = await prisma.user.upsert({
      where: { username: "transfers_test_admin" },
      update: {},
      create: {
        firstName: "Transfers", lastName: "Admin", displayName: "Transfers Admin",
        username: "transfers_test_admin", email: "transfers_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    adminCookie = `access_token=${signAccessToken({ sub: adminUser.id, roleId: adminRole.id })}`;

    // branch_manager is seeded with transfers.view/create/receive/cancel.
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
    const managerUser = await prisma.user.upsert({
      where: { username: "transfers_test_manager" },
      update: {},
      create: {
        firstName: "Transfers", lastName: "Manager", displayName: "Transfers Manager",
        username: "transfers_test_manager", email: "transfers_test_manager@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: managerRole.id, allBranches: true,
      },
    });
    managerCookie = `access_token=${signAccessToken({ sub: managerUser.id, roleId: managerRole.id })}`;

    // cashier has no transfers.* permissions per seed.ts.
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const cashierUser = await prisma.user.upsert({
      where: { username: "transfers_test_cashier" },
      update: {},
      create: {
        firstName: "Transfers", lastName: "Cashier", displayName: "Transfers Cashier",
        username: "transfers_test_cashier", email: "transfers_test_cashier@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: cashierRole.id, allBranches: true,
      },
    });
    cashierCookie = `access_token=${signAccessToken({ sub: cashierUser.id, roleId: cashierRole.id })}`;

    // Zero-permission role, mirrors tests/sales.test.ts's own pattern.
    const noPermRole = await prisma.role.upsert({
      where: { code: "transfers_test_no_perms" },
      update: {},
      create: { code: "transfers_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    const noPermUser = await prisma.user.upsert({
      where: { username: "transfers_test_noperm" },
      update: {},
      create: {
        firstName: "No", lastName: "Perm", displayName: "No Perm", username: "transfers_test_noperm",
        email: "transfers_test_noperm@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: noPermRole.id, allBranches: true,
      },
    });
    noPermCookie = `access_token=${signAccessToken({ sub: noPermUser.id, roleId: noPermRole.id })}`;

    category = await prisma.category.create({ data: { name: `Transfers Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `Transfers Sucursal A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Transfers Sucursal B ${Date.now()}` } });
    branchC = await prisma.branch.create({ data: { name: `Transfers Sucursal C ${Date.now()}` } });

    // branch_manager role, but scoped to ONLY branchA via an explicit
    // UserBranch row (allBranches: false) — used for branch-scope 403 tests.
    const scopedUser = await prisma.user.upsert({
      where: { username: "transfers_test_scoped" },
      update: {},
      create: {
        firstName: "Transfers", lastName: "Scoped", displayName: "Transfers Scoped",
        username: "transfers_test_scoped", email: "transfers_test_scoped@bellamakeup.demo",
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
    await prisma.transfer.deleteMany({ where: { id: { in: transferIds } } }); // cascades TransferItem
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id, branchC.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.role.deleteMany({ where: { code: { in: testRoleCodes } } }).catch(() => {});
  });

  describe("POST /api/transfers — create (dispatch)", () => {
    let product: { id: string };

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `TRANSFER-CREATE-${Date.now()}`, name: "Producto transferible", price: 50, taxRate: 0, categoryId: category.id, minStock: 2 },
      });
      product = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 20 });
    });

    it("succeeds, decrements source stock immediately, and creates the transfer as IN_TRANSIT", async () => {
      const before = await stockAt(product.id, branchA.id);
      expect(before).toBe(20);

      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [managerCookie])
        .send({
          sourceBranchId: branchA.id,
          destinationBranchId: branchB.id,
          items: [{ productId: product.id, quantity: 5 }],
        });

      expect(res.status).toBe(201);
      transferIds.push(res.body.id);
      expect(res.body.status).toBe("IN_TRANSIT");
      expect(res.body.transferNumber).toMatch(/^T-\d{6}$/);
      expect(res.body.sourceBranchId).toBe(branchA.id);
      expect(res.body.destinationBranchId).toBe(branchB.id);
      expect(res.body.items).toHaveLength(1);

      expect(await stockAt(product.id, branchA.id)).toBe(15);
      // destination stock untouched until received
      expect(await stockAt(product.id, branchB.id)).toBe(0);

      const movements = await prisma.inventoryMovement.findMany({ where: { reference: res.body.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe("TRANSFER_OUT");
      expect(movements[0].quantity).toBe(-5);
    });

    it("rejects when requested quantity exceeds available source stock, with 400, and does not create anything", async () => {
      const before = await stockAt(product.id, branchA.id);
      const countBefore = await prisma.transfer.count();

      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [managerCookie])
        .send({
          sourceBranchId: branchA.id,
          destinationBranchId: branchB.id,
          items: [{ productId: product.id, quantity: 9999 }],
        });

      expect(res.status).toBe(400);
      expect(await stockAt(product.id, branchA.id)).toBe(before);
      expect(await prisma.transfer.count()).toBe(countBefore);
    });

    it("rejects when source and destination branches are the same, with 400", async () => {
      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [managerCookie])
        .send({
          sourceBranchId: branchA.id,
          destinationBranchId: branchA.id,
          items: [{ productId: product.id, quantity: 1 }],
        });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/transfers/:id/receive", () => {
    let product: { id: string };
    let transferId: string;

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `TRANSFER-RECEIVE-${Date.now()}`, name: "Producto a recibir", price: 30, taxRate: 0, minStock: 2 },
      });
      product = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });

      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [managerCookie])
        .send({
          sourceBranchId: branchA.id,
          destinationBranchId: branchB.id,
          items: [{ productId: product.id, quantity: 4 }],
        });
      transferId = res.body.id;
      transferIds.push(transferId);
    });

    it("succeeds, increments destination stock, and moves status to COMPLETED", async () => {
      expect(await stockAt(product.id, branchB.id)).toBe(0);

      const res = await request(app)
        .post(`/api/transfers/${transferId}/receive`)
        .set("Cookie", [managerCookie]);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.receivedBy).toBeTruthy();
      expect(res.body.completedAt).toBeTruthy();

      expect(await stockAt(product.id, branchB.id)).toBe(4);

      const movements = await prisma.inventoryMovement.findMany({ where: { reference: transferId, type: "TRANSFER_IN" } });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantity).toBe(4);
      expect(movements[0].branchId).toBe(branchB.id);
    });

    it("rejects receiving an already-completed transfer with 400", async () => {
      const res = await request(app)
        .post(`/api/transfers/${transferId}/receive`)
        .set("Cookie", [managerCookie]);
      expect(res.status).toBe(400);
    });

    it("rejects receiving a cancelled transfer with 400", async () => {
      const p = await prisma.product.create({
        data: { sku: `TRANSFER-RECEIVE-CANCELLED-${Date.now()}`, name: "Producto cancelado antes de recibir", price: 10, taxRate: 0, minStock: 2 },
      });
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });

      const createRes = await request(app)
        .post("/api/transfers")
        .set("Cookie", [managerCookie])
        .send({ sourceBranchId: branchA.id, destinationBranchId: branchB.id, items: [{ productId: p.id, quantity: 2 }] });
      transferIds.push(createRes.body.id);

      await request(app)
        .post(`/api/transfers/${createRes.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Cancelada antes de recibir" });

      const res = await request(app)
        .post(`/api/transfers/${createRes.body.id}/receive`)
        .set("Cookie", [managerCookie]);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/transfers/:id/cancel", () => {
    let product: { id: string };
    let transferId: string;

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `TRANSFER-CANCEL-${Date.now()}`, name: "Producto a cancelar", price: 15, taxRate: 0, minStock: 2 },
      });
      product = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });

      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [managerCookie])
        .send({ sourceBranchId: branchA.id, destinationBranchId: branchB.id, items: [{ productId: product.id, quantity: 6 }] });
      transferId = res.body.id;
      transferIds.push(transferId);
    });

    it("restores source stock and moves status to CANCELLED", async () => {
      expect(await stockAt(product.id, branchA.id)).toBe(4); // 10 - 6

      const res = await request(app)
        .post(`/api/transfers/${transferId}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Ya no se requiere el traslado" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
      expect(await stockAt(product.id, branchA.id)).toBe(10); // restored

      const movements = await prisma.inventoryMovement.findMany({ where: { reference: `cancel:${transferId}` } });
      expect(movements).toHaveLength(1);
      expect(movements[0].type).toBe("TRANSFER_IN");
      expect(movements[0].quantity).toBe(6);
    });

    it("rejects cancelling an already-completed transfer with 400", async () => {
      const p = await prisma.product.create({
        data: { sku: `TRANSFER-CANCEL-COMPLETED-${Date.now()}`, name: "Producto ya recibido", price: 10, taxRate: 0, minStock: 2 },
      });
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchA.id, type: "PURCHASE", quantity: 5 });

      const createRes = await request(app)
        .post("/api/transfers")
        .set("Cookie", [managerCookie])
        .send({ sourceBranchId: branchA.id, destinationBranchId: branchB.id, items: [{ productId: p.id, quantity: 2 }] });
      transferIds.push(createRes.body.id);

      await request(app).post(`/api/transfers/${createRes.body.id}/receive`).set("Cookie", [managerCookie]);

      const res = await request(app)
        .post(`/api/transfers/${createRes.body.id}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Intento de cancelar una ya recibida" });
      expect(res.status).toBe(400);
    });

    it("rejects cancelling an already-cancelled transfer with 400", async () => {
      const res = await request(app)
        .post(`/api/transfers/${transferId}/cancel`)
        .set("Cookie", [managerCookie])
        .send({ reason: "Segundo intento de cancelación" });
      expect(res.status).toBe(400);
    });
  });

  describe("Branch-scope enforcement", () => {
    let product: { id: string };

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: { sku: `TRANSFER-SCOPE-${Date.now()}`, name: "Producto sucursal B/C", price: 10, taxRate: 0, minStock: 2 },
      });
      product = { id: p.id };
      productIds.push(p.id);
      await applyMovement({ productId: p.id, branchId: branchB.id, type: "PURCHASE", quantity: 10 });
      await applyMovement({ productId: p.id, branchId: branchC.id, type: "PURCHASE", quantity: 10 });
    });

    it("a branch-scoped user cannot create a transfer FROM a branch they don't have access to (403)", async () => {
      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [scopedCookie]) // only assigned to branchA
        .send({
          sourceBranchId: branchB.id,
          destinationBranchId: branchC.id,
          items: [{ productId: product.id, quantity: 1 }],
        });
      expect(res.status).toBe(403);
    });

    it("a branch-scoped user cannot receive a transfer whose destination they don't have access to (403)", async () => {
      const createRes = await request(app)
        .post("/api/transfers")
        .set("Cookie", [adminCookie]) // admin has allBranches, can dispatch B -> C
        .send({
          sourceBranchId: branchB.id,
          destinationBranchId: branchC.id,
          items: [{ productId: product.id, quantity: 1 }],
        });
      transferIds.push(createRes.body.id);

      const res = await request(app)
        .post(`/api/transfers/${createRes.body.id}/receive`)
        .set("Cookie", [scopedCookie]); // only assigned to branchA, not C
      expect(res.status).toBe(403);
    });

    it("a user without access to either branch gets 403 on GET /api/transfers/:id", async () => {
      const createRes = await request(app)
        .post("/api/transfers")
        .set("Cookie", [adminCookie])
        .send({
          sourceBranchId: branchB.id,
          destinationBranchId: branchC.id,
          items: [{ productId: product.id, quantity: 1 }],
        });
      transferIds.push(createRes.body.id);

      const res = await request(app).get(`/api/transfers/${createRes.body.id}`).set("Cookie", [scopedCookie]);
      expect(res.status).toBe(403);
    });
  });

  describe("Permission gates", () => {
    it("POST /api/transfers requires transfers.create (403 without it)", async () => {
      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [noPermCookie])
        .send({
          sourceBranchId: branchA.id,
          destinationBranchId: branchB.id,
          items: [{ productId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
        });
      expect(res.status).toBe(403);
    });

    it("a plain cashier (no transfers.* permissions) gets 403 creating a transfer", async () => {
      const res = await request(app)
        .post("/api/transfers")
        .set("Cookie", [cashierCookie])
        .send({
          sourceBranchId: branchA.id,
          destinationBranchId: branchB.id,
          items: [{ productId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
        });
      expect(res.status).toBe(403);
    });

    it("GET /api/transfers requires transfers.view (403 without it)", async () => {
      const res = await request(app).get("/api/transfers").set("Cookie", [noPermCookie]);
      expect(res.status).toBe(403);
    });

    it("GET /api/transfers/:id requires transfers.view (403 without it)", async () => {
      const res = await request(app).get(`/api/transfers/${transferIds[0]}`).set("Cookie", [noPermCookie]);
      expect(res.status).toBe(403);
    });

    it("POST /api/transfers/:id/receive requires transfers.receive (403 without it)", async () => {
      const res = await request(app).post(`/api/transfers/${transferIds[0]}/receive`).set("Cookie", [noPermCookie]);
      expect(res.status).toBe(403);
    });

    it("POST /api/transfers/:id/cancel requires transfers.cancel (403 without it)", async () => {
      const res = await request(app)
        .post(`/api/transfers/${transferIds[0]}/cancel`)
        .set("Cookie", [noPermCookie])
        .send({ reason: "Sin permiso de cancelación" });
      expect(res.status).toBe(403);
    });

    it("requires authentication on every route", async () => {
      expect((await request(app).get("/api/transfers")).status).toBe(401);
      expect((await request(app).get(`/api/transfers/${transferIds[0]}`)).status).toBe(401);
      expect((await request(app).post("/api/transfers").send({})).status).toBe(401);
      expect((await request(app).post(`/api/transfers/${transferIds[0]}/receive`).send({})).status).toBe(401);
      expect((await request(app).post(`/api/transfers/${transferIds[0]}/cancel`).send({})).status).toBe(401);
    });
  });

  describe("GET /api/transfers — listing", () => {
    it("lists transfers touching the caller's accessible branches (either direction), newest first, with transferNumber/itemCount", async () => {
      const res = await request(app).get(`/api/transfers?branchId=${branchA.id}`).set("Cookie", [adminCookie]);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((t: any) => t.sourceBranchId === branchA.id || t.destinationBranchId === branchA.id)).toBe(true);
      expect(res.body[0].transferNumber).toMatch(/^T-\d{6}$/);
      expect(typeof res.body[0].itemCount).toBe("number");

      const createdAts = res.body.map((t: any) => new Date(t.createdAt).getTime());
      const sorted = [...createdAts].sort((a, b) => b - a);
      expect(createdAts).toEqual(sorted);
    });

    it("a branch-scoped user only sees transfers touching branches they're assigned to", async () => {
      const res = await request(app).get("/api/transfers").set("Cookie", [scopedCookie]);
      expect(res.status).toBe(200);
      expect(res.body.every((t: any) => t.sourceBranchId === branchA.id || t.destinationBranchId === branchA.id)).toBe(true);
    });
  });
});
