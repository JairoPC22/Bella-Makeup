import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { applyMovement } from "../src/services/inventoryService";

describe("Inventarios físicos (cycle counts)", () => {
  let adminCookie: string;
  let cashierCookie: string; // has inventory.view but not inventory.count
  let branch: { id: string };
  let category: { id: string };
  let product: { id: string };
  const productIds: string[] = [];
  let countId: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const adminUser = await prisma.user.upsert({
      where: { username: "invcount_test_admin" },
      update: {},
      create: {
        firstName: "Count", lastName: "Admin", displayName: "Count Admin",
        username: "invcount_test_admin", email: "invcount_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    adminCookie = `access_token=${signAccessToken({ sub: adminUser.id, roleId: adminRole.id })}`;

    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const cashierUser = await prisma.user.upsert({
      where: { username: "invcount_test_cashier" },
      update: {},
      create: {
        firstName: "Count", lastName: "Cashier", displayName: "Count Cashier",
        username: "invcount_test_cashier", email: "invcount_test_cashier@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: cashierRole.id, allBranches: true,
      },
    });
    cashierCookie = `access_token=${signAccessToken({ sub: cashierUser.id, roleId: cashierRole.id })}`;

    category = await prisma.category.create({ data: { name: `Count Cat ${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: `Count Sucursal ${Date.now()}` } });

    const p = await prisma.product.create({
      data: { sku: `COUNT-TEST-${Date.now()}`, name: "Producto conteo", price: 100, categoryId: category.id, minStock: 5 },
    });
    product = { id: p.id };
    productIds.push(p.id);

    // Starts with 10 units on the books; the physical count below will find 12.
    await applyMovement({ productId: product.id, branchId: branch.id, type: "PURCHASE", quantity: 10 });
  });

  afterAll(async () => {
    await prisma.inventoryCountItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryCount.deleteMany({ where: { branchId: branch.id } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: branch.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: ["invcount_test_admin", "invcount_test_cashier"] } } });
  });

  it("rejects creation without inventory.count", async () => {
    const res = await request(app)
      .post("/api/inventory-counts")
      .set("Cookie", [cashierCookie])
      .send({ branchId: branch.id, categoryId: category.id });
    expect(res.status).toBe(403);
  });

  it("creates a count scoped to a category, snapshotting current stock as systemStock but withholding it while OPEN", async () => {
    const res = await request(app)
      .post("/api/inventory-counts")
      .set("Cookie", [adminCookie])
      .send({ branchId: branch.id, categoryId: category.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.items.length).toBe(1);
    // Blind while OPEN — systemStock must not be present as a key at all.
    expect(res.body.items[0]).not.toHaveProperty("systemStock");
    expect(res.body.items[0].difference).toBeNull();
    expect(res.body.items[0].countedStock).toBeNull();

    countId = res.body.id;
  });

  it("rejects completion while a line is still uncounted", async () => {
    const res = await request(app).post(`/api/inventory-counts/${countId}/complete`).set("Cookie", [adminCookie]);
    expect(res.status).toBe(400);
  });

  it("saves the physical count for a line without revealing systemStock", async () => {
    const detail = await request(app).get(`/api/inventory-counts/${countId}`).set("Cookie", [adminCookie]);
    const itemId = detail.body.items[0].id;

    const res = await request(app)
      .patch(`/api/inventory-counts/${countId}/items`)
      .set("Cookie", [adminCookie])
      .send({ items: [{ itemId, countedStock: 12 }] });

    expect(res.status).toBe(200);
    expect(res.body.items[0].countedStock).toBe(12);
    expect(res.body.items[0]).not.toHaveProperty("systemStock");
    expect(res.body.items[0].difference).toBeNull();
  });

  it("completes the count: reveals systemStock/difference and writes an ADJUSTMENT movement for the gap", async () => {
    const res = await request(app).post(`/api/inventory-counts/${countId}/complete`).set("Cookie", [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.items[0].systemStock).toBe(10);
    expect(res.body.items[0].countedStock).toBe(12);
    expect(res.body.items[0].difference).toBe(2);

    const row = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });
    expect(row?.stock).toBe(12);

    const movement = await prisma.inventoryMovement.findFirst({
      where: { productId: product.id, branchId: branch.id, type: "ADJUSTMENT", reference: countId },
    });
    expect(movement).not.toBeNull();
    expect(movement?.quantity).toBe(2);
  });

  it("rejects saving items on an already-completed count", async () => {
    const detail = await request(app).get(`/api/inventory-counts/${countId}`).set("Cookie", [adminCookie]);
    const itemId = detail.body.items[0].id;
    const res = await request(app)
      .patch(`/api/inventory-counts/${countId}/items`)
      .set("Cookie", [adminCookie])
      .send({ items: [{ itemId, countedStock: 99 }] });
    expect(res.status).toBe(400);
  });

  it("cancels an open count with no side effects on stock", async () => {
    const created = await request(app)
      .post("/api/inventory-counts")
      .set("Cookie", [adminCookie])
      .send({ branchId: branch.id, productIds: [product.id] });
    expect(created.status).toBe(201);

    const before = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });

    const cancelled = await request(app).post(`/api/inventory-counts/${created.body.id}/cancel`).set("Cookie", [adminCookie]);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");

    const after = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branch.id } });
    expect(after?.stock).toBe(before?.stock);
  });

  it("rejects a create request with more than one scope selector", async () => {
    const res = await request(app)
      .post("/api/inventory-counts")
      .set("Cookie", [adminCookie])
      .send({ branchId: branch.id, categoryId: category.id, productIds: [product.id] });
    expect(res.status).toBe(400);
  });
});
