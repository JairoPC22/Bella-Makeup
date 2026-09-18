// tests/smoke.test.ts
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "products");

function savedPathFor(url: string): string {
  return path.resolve(UPLOADS_DIR, path.basename(url));
}

function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

describe("full-stack smoke flow", () => {
  it("logs in as the seeded admin, reads /api/auth/me, lists branches, and logs out", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "BellaAdmin#2026" });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"];

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("admin");

    const branches = await request(app).get("/api/branches").set("Cookie", cookies);
    expect(branches.status).toBe(200);
    expect(branches.body.length).toBeGreaterThanOrEqual(2);

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookies);
    expect(logout.status).toBe(200);
  });

  describe("catalog + inventory end-to-end flow", () => {
    const cleanupProductIds: string[] = [];
    const cleanupCategoryIds: string[] = [];
    const cleanupBrandIds: string[] = [];
    const cleanupBranchIds: string[] = [];
    const cleanupFiles: string[] = [];

    afterAll(async () => {
      for (const filePath of cleanupFiles) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
      // InventoryAdjustment.movementId is a plain unique string column, not a
      // Prisma relation, so movements must be looked up first (same pattern
      // as inventoryAdjustments.test.ts).
      const movementIds = (
        await prisma.inventoryMovement.findMany({ where: { productId: { in: cleanupProductIds } }, select: { id: true } })
      ).map((m) => m.id);
      await prisma.inventoryAdjustment.deleteMany({ where: { movementId: { in: movementIds } } }).catch(() => {});
      await prisma.inventoryMovement.deleteMany({ where: { productId: { in: cleanupProductIds } } }).catch(() => {});
      await prisma.inventory.deleteMany({ where: { productId: { in: cleanupProductIds } } }).catch(() => {});
      await prisma.product.deleteMany({ where: { id: { in: cleanupProductIds } } }).catch(() => {});
      await prisma.category.deleteMany({ where: { id: { in: cleanupCategoryIds } } }).catch(() => {});
      await prisma.brand.deleteMany({ where: { id: { in: cleanupBrandIds } } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { id: { in: cleanupBranchIds } } }).catch(() => {});
    });

    it("creates a category+brand, a product with a variant, uploads an image, adjusts stock, and verifies inventory + kardex", async () => {
      const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "BellaAdmin#2026" });
      expect(login.status).toBe(200);
      const cookies = login.headers["set-cookie"];

      // 1. Category + brand
      const tag = Date.now();
      const category = await request(app)
        .post("/api/categories")
        .set("Cookie", cookies)
        .send({ name: `Smoke Categoria ${tag}` });
      expect(category.status).toBe(201);
      cleanupCategoryIds.push(category.body.id);

      const brand = await request(app)
        .post("/api/brands")
        .set("Cookie", cookies)
        .send({ name: `Smoke Marca ${tag}` });
      expect(brand.status).toBe(201);
      cleanupBrandIds.push(brand.body.id);

      // Dedicated branch, created directly (not picked from GET /api/branches,
      // whose ordering by name is not deterministic across the full suite and
      // could land on a branch another test file deactivated).
      const branch = await prisma.branch.create({ data: { name: `Smoke Sucursal ${tag}` } });
      cleanupBranchIds.push(branch.id);

      // 2. Product with a variant
      const sku = `SMOKE-PROD-${tag}`;
      const product = await request(app)
        .post("/api/products")
        .set("Cookie", cookies)
        .send({
          sku,
          name: "Producto smoke end-to-end",
          price: 150,
          categoryId: category.body.id,
          brandId: brand.body.id,
          variants: [{ name: "Variante Smoke", sku: `${sku}-V1`, minStock: 2 }],
        });
      expect(product.status).toBe(201);
      cleanupProductIds.push(product.body.id);
      expect(product.body.variants).toHaveLength(1);

      // 3. Image upload (tiny in-memory JPEG, same technique as productImages.test.ts)
      const imageBuffer = await makeJpeg(50, 50);
      const image = await request(app)
        .post(`/api/products/${product.body.id}/images`)
        .set("Cookie", cookies)
        .attach("image", imageBuffer, "smoke.jpg");
      expect(image.status).toBe(201);
      expect(image.body.isPrimary).toBe(true);
      cleanupFiles.push(savedPathFor(image.body.url));

      // 4. Adjust stock
      const branchId = branch.id;

      const adjust = await request(app)
        .post("/api/inventory/adjust")
        .set("Cookie", cookies)
        .send({ productId: product.body.id, branchId, quantity: 8, reason: "Carga inicial de stock (smoke test)" });
      expect(adjust.status).toBe(201);
      expect(adjust.body.stockBefore).toBe(0);
      expect(adjust.body.stockAfter).toBe(8);

      // 5. List /api/inventory and confirm the new stock appears with the correct computed status
      const inventoryList = await request(app)
        .get(`/api/inventory?branchId=${branchId}`)
        .set("Cookie", cookies);
      expect(inventoryList.status).toBe(200);
      const row = inventoryList.body.find((r: any) => r.productId === product.body.id && r.branchId === branchId);
      expect(row).toBeDefined();
      expect(row.stock).toBe(8);
      // Product has no explicit minStock (defaults to 0), so any positive stock is AVAILABLE.
      expect(row.status).toBe("AVAILABLE");

      // 6. Fetch kardex and confirm one movement exists
      const kardex = await request(app)
        .get(`/api/inventory/${product.body.id}/movements`)
        .set("Cookie", cookies);
      expect(kardex.status).toBe(200);
      expect(kardex.body).toHaveLength(1);
      expect(kardex.body[0].type).toBe("ADJUSTMENT");
      expect(kardex.body[0].stockAfter).toBe(8);
    });
  });
});
