import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { applyMovement } from "../src/services/inventoryService";

describe("Public storefront catalog (/api/public/*) — unauthenticated", () => {
  let activeCategory: { id: string };
  let inactiveCategory: { id: string };
  let activeBranch: { id: string };
  let inactiveBranch: { id: string };
  let activeProduct: { id: string };
  let inactiveProduct: { id: string };
  let variant: { id: string };

  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const branchIds: string[] = [];

  beforeAll(async () => {
    const cat = await prisma.category.create({ data: { name: `Public Cat Active ${Date.now()}` } });
    activeCategory = { id: cat.id };
    categoryIds.push(cat.id);

    const catInactive = await prisma.category.create({
      data: { name: `Public Cat Inactive ${Date.now()}`, status: "INACTIVE" },
    });
    inactiveCategory = { id: catInactive.id };
    categoryIds.push(catInactive.id);

    const branch = await prisma.branch.create({ data: { name: `Public Sucursal Activa ${Date.now()}` } });
    activeBranch = { id: branch.id };
    branchIds.push(branch.id);

    const branchOff = await prisma.branch.create({
      data: { name: `Public Sucursal Inactiva ${Date.now()}`, status: "INACTIVE" },
    });
    inactiveBranch = { id: branchOff.id };
    branchIds.push(branchOff.id);

    const p = await prisma.product.create({
      data: {
        sku: `PUBLIC-ACTIVE-${Date.now()}`,
        name: "Producto Público Activo",
        description: "Un producto de prueba",
        price: 199,
        promoPrice: 149,
        taxRate: 16,
        categoryId: activeCategory.id,
        minStock: 2,
        images: { create: [{ url: "/uploads/products/test.jpg", isPrimary: true, sortOrder: 0 }] },
      },
    });
    activeProduct = { id: p.id };
    productIds.push(p.id);

    const v = await prisma.productVariant.create({
      data: { productId: p.id, name: "Variante Pública", sku: `PUBLIC-ACTIVE-${Date.now()}-V`, minStock: 1 },
    });
    variant = { id: v.id };

    const pInactive = await prisma.product.create({
      data: {
        sku: `PUBLIC-INACTIVE-${Date.now()}`,
        name: "Producto Público Inactivo",
        price: 50,
        taxRate: 0,
        status: "INACTIVE",
        minStock: 1,
      },
    });
    inactiveProduct = { id: pInactive.id };
    productIds.push(pInactive.id);

    // Stock only for the product itself (not the variant) at the active branch.
    await applyMovement({ productId: p.id, branchId: activeBranch.id, type: "PURCHASE", quantity: 5 });
  });

  afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  });

  it("GET /api/public/categories returns only ACTIVE categories with no Authorization header, and never 401s", async () => {
    const res = await request(app).get("/api/public/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((c: any) => c.id === activeCategory.id)).toBe(true);
    expect(res.body.some((c: any) => c.id === inactiveCategory.id)).toBe(false);
  });

  it("GET /api/public/branches returns only ACTIVE branches", async () => {
    const res = await request(app).get("/api/public/branches");
    expect(res.status).toBe(200);
    expect(res.body.some((b: any) => b.id === activeBranch.id)).toBe(true);
    expect(res.body.some((b: any) => b.id === inactiveBranch.id)).toBe(false);
    const found = res.body.find((b: any) => b.id === activeBranch.id);
    expect(found).toHaveProperty("lat");
    expect(found).toHaveProperty("lng");
  });

  it("GET /api/public/products returns only ACTIVE products, paginated, with resolved inStock/price as Decimal-strings", async () => {
    const res = await request(app).get("/api/public/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page", 1);
    expect(res.body).toHaveProperty("pageSize");
    expect(Array.isArray(res.body.items)).toBe(true);

    const ids = res.body.items.map((p: any) => p.id);
    expect(ids).toContain(activeProduct.id);
    expect(ids).not.toContain(inactiveProduct.id);

    const found = res.body.items.find((p: any) => p.id === activeProduct.id);
    expect(typeof found.price).toBe("string");
    expect(typeof found.promoPrice).toBe("string");
    expect(found.inStock).toBe(true); // has stock at activeBranch
    const foundVariant = found.variants.find((v: any) => v.id === variant.id);
    expect(foundVariant.inStock).toBe(false); // never got any stock
  });

  it("GET /api/public/products?categoryId= filters by category", async () => {
    const res = await request(app).get(`/api/public/products?categoryId=${activeCategory.id}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((p: any) => p.category?.id === activeCategory.id)).toBe(true);
  });

  it("GET /api/public/products?search= filters by name/sku", async () => {
    const res = await request(app).get(`/api/public/products?search=${encodeURIComponent("Público Activo")}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((p: any) => p.id === activeProduct.id)).toBe(true);
  });

  it("GET /api/public/products/:id returns a single active product with images/variants", async () => {
    const res = await request(app).get(`/api/public/products/${activeProduct.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(activeProduct.id);
    expect(res.body.images.length).toBeGreaterThan(0);
    expect(res.body.variants.some((v: any) => v.id === variant.id)).toBe(true);
  });

  it("GET /api/public/products/:id returns 404 for an INACTIVE product (never exposed publicly)", async () => {
    const res = await request(app).get(`/api/public/products/${inactiveProduct.id}`);
    expect(res.status).toBe(404);
  });

  it("GET /api/public/products/:id returns 404 for a nonexistent product", async () => {
    const res = await request(app).get(`/api/public/products/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });
});
