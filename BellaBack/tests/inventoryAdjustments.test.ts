import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { applyMovement } from "../src/services/inventoryService";

describe("POST /api/inventory/adjust", () => {
  let adminCookie: string;
  let cashierCookie: string;
  let admin: { id: string };
  let branch: { id: string };
  let category: { id: string };
  let product: { id: string };
  const productIds: string[] = [];

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const adminUser = await prisma.user.upsert({
      where: { username: "inv_adjust_test_admin" },
      update: {},
      create: {
        firstName: "Adjust", lastName: "Admin", displayName: "Adjust Admin",
        username: "inv_adjust_test_admin", email: "inv_adjust_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    admin = { id: adminUser.id };
    adminCookie = `access_token=${signAccessToken({ sub: adminUser.id, roleId: adminRole.id })}`;

    // "cashier" is a seeded role that has inventory.view but NOT
    // inventory.adjust, per prisma/seed.ts — used to exercise the 403 path
    // without needing a bespoke permission-less role.
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const cashierUser = await prisma.user.upsert({
      where: { username: "inv_adjust_test_cashier" },
      update: {},
      create: {
        firstName: "Adjust", lastName: "Cashier", displayName: "Adjust Cashier",
        username: "inv_adjust_test_cashier", email: "inv_adjust_test_cashier@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: cashierRole.id, allBranches: true,
      },
    });
    cashierCookie = `access_token=${signAccessToken({ sub: cashierUser.id, roleId: cashierRole.id })}`;

    category = await prisma.category.create({ data: { name: `Adjust Cat ${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: `Adjust Sucursal ${Date.now()}` } });

    const p = await prisma.product.create({
      data: { sku: `ADJ-TEST-${Date.now()}`, name: "Producto ajuste", price: 100, categoryId: category.id, minStock: 5 },
    });
    product = { id: p.id };
    productIds.push(p.id);

    // Seed some stock so the negative-adjustment test has something to overshoot.
    await applyMovement({ productId: product.id, branchId: branch.id, type: "PURCHASE", quantity: 10 });
  });

  afterAll(async () => {
    // InventoryAdjustment.movementId is a plain unique string column, not a
    // Prisma relation (see schema), so it can't be filtered via a nested
    // `movement: {...}` clause — look up movement ids first, then delete by
    // movementId IN (...).
    const movementIds = await prisma.inventoryMovement.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
    await prisma.inventoryAdjustment.deleteMany({ where: { movementId: { in: movementIds.map((m) => m.id) } } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: branch.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: ["inv_adjust_test_admin", "inv_adjust_test_cashier"] } } });
  });

  it("adjusts stock with a reason: creates a movement, a linked InventoryAdjustment row, and an audit log entry", async () => {
    const before = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });
    expect(before?.stock).toBe(10);

    const res = await request(app)
      .post("/api/inventory/adjust")
      .set("Cookie", [adminCookie])
      .send({ productId: product.id, branchId: branch.id, quantity: 5, reason: "Conteo físico encontró unidades adicionales" });

    expect(res.status).toBe(201);
    expect(res.body.stockBefore).toBe(10);
    expect(res.body.stockAfter).toBe(15);
    expect(res.body.type).toBe("ADJUSTMENT");

    const row = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });
    expect(row?.stock).toBe(15);

    const movement = await prisma.inventoryMovement.findUnique({ where: { id: res.body.id } });
    expect(movement).not.toBeNull();
    expect(movement?.stockBefore).toBe(10);
    expect(movement?.stockAfter).toBe(15);

    const adjustment = await prisma.inventoryAdjustment.findUnique({ where: { movementId: res.body.id } });
    expect(adjustment).not.toBeNull();
    expect(adjustment?.reason).toBe("Conteo físico encontró unidades adicionales");
    expect(adjustment?.authorizedBy).toBe(admin.id);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { module: "inventory", action: "inventory.adjust", entityId: product.id },
      orderBy: { createdAt: "desc" },
    });
    expect(auditEntry).not.toBeNull();
    expect((auditEntry?.details as any)?.quantity).toBe(5);
    expect((auditEntry?.details as any)?.reason).toBe("Conteo físico encontró unidades adicionales");
  });

  it("rejects an adjustment without a reason with 400 (Zod) and does not touch stock", async () => {
    const before = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });

    const res = await request(app)
      .post("/api/inventory/adjust")
      .set("Cookie", [adminCookie])
      .send({ productId: product.id, branchId: branch.id, quantity: 1 });

    expect(res.status).toBe(400);

    const after = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });
    expect(after?.stock).toBe(before?.stock);
  });

  it("rejects an adjustment with a too-short reason with 400 (Zod)", async () => {
    const res = await request(app)
      .post("/api/inventory/adjust")
      .set("Cookie", [adminCookie])
      .send({ productId: product.id, branchId: branch.id, quantity: 1, reason: "ab" });

    expect(res.status).toBe(400);
  });

  it("rejects a user whose role lacks inventory.adjust with 403", async () => {
    const res = await request(app)
      .post("/api/inventory/adjust")
      .set("Cookie", [cashierCookie])
      .send({ productId: product.id, branchId: branch.id, quantity: 1, reason: "Intento no autorizado" });

    expect(res.status).toBe(403);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/inventory/adjust")
      .send({ productId: product.id, branchId: branch.id, quantity: 1, reason: "Sin sesión" });

    expect(res.status).toBe(401);
  });

  it("rejects an adjustment that would take stock negative with 400, creating NEITHER a movement NOR an adjustment row", async () => {
    const before = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });
    expect(before?.stock).toBe(15); // from the successful adjustment test above

    const movementsBefore = await prisma.inventoryMovement.count({ where: { productId: product.id, branchId: branch.id } });
    const movementIdsBefore = (
      await prisma.inventoryMovement.findMany({ where: { productId: product.id, branchId: branch.id }, select: { id: true } })
    ).map((m) => m.id);
    const adjustmentsBefore = await prisma.inventoryAdjustment.count({ where: { movementId: { in: movementIdsBefore } } });

    const res = await request(app)
      .post("/api/inventory/adjust")
      .set("Cookie", [adminCookie])
      .send({ productId: product.id, branchId: branch.id, quantity: -9999, reason: "Ajuste que dejaría negativo el stock" });

    expect(res.status).toBe(400);

    // Fresh DB reads — not the HTTP response — prove nothing was created/changed.
    const after = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });
    expect(after?.stock).toBe(before?.stock);

    const movementsAfter = await prisma.inventoryMovement.count({ where: { productId: product.id, branchId: branch.id } });
    expect(movementsAfter).toBe(movementsBefore);

    const movementIdsAfter = (
      await prisma.inventoryMovement.findMany({ where: { productId: product.id, branchId: branch.id }, select: { id: true } })
    ).map((m) => m.id);
    const adjustmentsAfter = await prisma.inventoryAdjustment.count({ where: { movementId: { in: movementIdsAfter } } });
    expect(adjustmentsAfter).toBe(adjustmentsBefore);
  });

  it("rejects a zero quantity with 400 (Zod refine)", async () => {
    const res = await request(app)
      .post("/api/inventory/adjust")
      .set("Cookie", [adminCookie])
      .send({ productId: product.id, branchId: branch.id, quantity: 0, reason: "Cantidad cero" });

    expect(res.status).toBe(400);
  });
});
