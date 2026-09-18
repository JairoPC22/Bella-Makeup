import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Products CRUD with nested variants", () => {
  let cookie: string;
  let viewerCookie: string;
  let categoryA: { id: string };
  let categoryB: { id: string };
  let branch: { id: string };
  const productIds: string[] = [];

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const admin = await prisma.user.upsert({
      where: { username: "products_test_admin" },
      update: {},
      create: {
        firstName: "Products", lastName: "Admin", displayName: "Products Admin",
        username: "products_test_admin", email: "products_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: admin.id, roleId: adminRole.id })}`;

    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "products_test_viewer" },
      update: {},
      create: {
        firstName: "V", lastName: "T", displayName: "V T", username: "products_test_viewer",
        email: "products_test_viewer@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: viewerRole.id, allBranches: true,
      },
    });
    viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;

    categoryA = await prisma.category.create({ data: { name: `Cat A ${Date.now()}` } });
    categoryB = await prisma.category.create({ data: { name: `Cat B ${Date.now()}` } });
    branch = await prisma.branch.create({ data: { name: `Sucursal Test ${Date.now()}` } });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: [categoryA.id, categoryB.id] } } });
    await prisma.branch.delete({ where: { id: branch.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: ["products_test_admin", "products_test_viewer"] } } });
  });

  it("creates a product with 2 nested variants in one request, verified by a fresh DB read", async () => {
    const sku = `PROD-VARIANTS-${Date.now()}`;
    const res = await request(app)
      .post("/api/products")
      .set("Cookie", [cookie])
      .send({
        sku,
        name: "Producto con variantes",
        price: 100,
        categoryId: categoryA.id,
        variants: [
          { name: "Variante 1", sku: `${sku}-V1`, minStock: 2 },
          { name: "Variante 2", sku: `${sku}-V2`, minStock: 3 },
        ],
      });

    expect(res.status).toBe(201);
    productIds.push(res.body.id);
    expect(res.body.variants).toHaveLength(2);

    // Fresh read straight from the DB, not trusting the create call's own return value.
    const freshVariants = await prisma.productVariant.findMany({ where: { productId: res.body.id } });
    expect(freshVariants).toHaveLength(2);
    expect(freshVariants.map((v) => v.sku).sort()).toEqual([`${sku}-V1`, `${sku}-V2`].sort());

    const auditEntry = await prisma.auditLog.findFirst({
      where: { module: "products", action: "products.create", entityId: res.body.id },
    });
    expect(auditEntry).not.toBeNull();
  });

  it("lists products filtered by categoryId", async () => {
    const skuA = `PROD-CATA-${Date.now()}`;
    const skuB = `PROD-CATB-${Date.now()}`;
    const productA = await request(app).post("/api/products").set("Cookie", [cookie]).send({ sku: skuA, name: "Producto Cat A", price: 50, categoryId: categoryA.id });
    const productB = await request(app).post("/api/products").set("Cookie", [cookie]).send({ sku: skuB, name: "Producto Cat B", price: 60, categoryId: categoryB.id });
    productIds.push(productA.body.id, productB.body.id);

    const res = await request(app).get(`/api/products?categoryId=${categoryA.id}`).set("Cookie", [cookie]);
    expect(res.status).toBe(200);
    expect(res.body.some((p: any) => p.id === productA.body.id)).toBe(true);
    expect(res.body.some((p: any) => p.id === productB.body.id)).toBe(false);
  });

  it("lists products matching search by name or sku, case-insensitively", async () => {
    const uniqueTag = `Zzyx${Date.now()}`;
    const sku = `SKU-${uniqueTag}`;
    const created = await request(app).post("/api/products").set("Cookie", [cookie]).send({ sku, name: `Producto ${uniqueTag} especial`, price: 70 });
    productIds.push(created.body.id);

    const byName = await request(app).get(`/api/products?search=${uniqueTag.toLowerCase()}`).set("Cookie", [cookie]);
    expect(byName.body.some((p: any) => p.id === created.body.id)).toBe(true);

    const bySku = await request(app).get(`/api/products?search=${sku.toLowerCase()}`).set("Cookie", [cookie]);
    expect(bySku.body.some((p: any) => p.id === created.body.id)).toBe(true);
  });

  it("GET /:id includes images, variants and inventory (with branch info)", async () => {
    const sku = `PROD-FULL-${Date.now()}`;
    const created = await request(app)
      .post("/api/products")
      .set("Cookie", [cookie])
      .send({ sku, name: "Producto completo", price: 90, variants: [{ name: "Unica", sku: `${sku}-V1`, minStock: 1 }] });
    productIds.push(created.body.id);

    await prisma.productImage.create({ data: { productId: created.body.id, url: "/uploads/products/test.jpg", isPrimary: true } });
    await prisma.inventory.create({ data: { productId: created.body.id, branchId: branch.id, stock: 10 } });

    const res = await request(app).get(`/api/products/${created.body.id}`).set("Cookie", [cookie]);
    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.variants).toHaveLength(1);
    expect(res.body.inventory).toHaveLength(1);
    expect(res.body.inventory[0].branch).toBeDefined();
    expect(res.body.inventory[0].branch.id).toBe(branch.id);
  });

  it("updates a product", async () => {
    const sku = `PROD-UPDATE-${Date.now()}`;
    const created = await request(app).post("/api/products").set("Cookie", [cookie]).send({ sku, name: "Antes", price: 40 });
    productIds.push(created.body.id);

    const res = await request(app).put(`/api/products/${created.body.id}`).set("Cookie", [cookie]).send({ name: "Después", price: 55 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Después");
    expect(Number(res.body.price)).toBe(55);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { module: "products", action: "products.update", entityId: created.body.id },
    });
    expect(auditEntry).not.toBeNull();
  });

  it("deactivates a product", async () => {
    const sku = `PROD-DEACTIVATE-${Date.now()}`;
    const created = await request(app).post("/api/products").set("Cookie", [cookie]).send({ sku, name: "A desactivar", price: 30 });
    productIds.push(created.body.id);

    const res = await request(app).patch(`/api/products/${created.body.id}/status`).set("Cookie", [cookie]).send({ status: "INACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("INACTIVE");

    const auditEntry = await prisma.auditLog.findFirst({
      where: { module: "products", action: "products.deactivate", entityId: created.body.id },
    });
    expect(auditEntry).not.toBeNull();
  });

  it("rejects creation without products.create permission", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Cookie", [viewerCookie])
      .send({ sku: `PROD-FORBIDDEN-${Date.now()}`, name: "Should Fail", price: 10 });
    expect(res.status).toBe(403);
  });
});
