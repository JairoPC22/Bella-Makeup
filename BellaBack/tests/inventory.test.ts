import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";
import { applyMovement, computeStatus } from "../src/services/inventoryService";
import { AppError } from "../src/utils/AppError";

describe("Inventory movement service + query endpoints", () => {
  let cookie: string;
  let noPermCookie: string;
  let branchA: { id: string };
  let branchB: { id: string };
  let category: { id: string };
  let product: { id: string; minStock: number };
  let lowStockProduct: { id: string };
  const productIds: string[] = [];

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const admin = await prisma.user.upsert({
      where: { username: "inventory_test_admin" },
      update: {},
      create: {
        firstName: "Inventory", lastName: "Admin", displayName: "Inventory Admin",
        username: "inventory_test_admin", email: "inventory_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: admin.id, roleId: adminRole.id })}`;

    // None of the seeded roles lack inventory.view (every role from admin
    // down to viewer includes it), so a dedicated permission-less role is
    // created here to exercise requirePermission's 403 path specifically.
    const noPermRole = await prisma.role.upsert({
      where: { code: "inventory_test_no_perms" },
      update: {},
      create: { code: "inventory_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    const noPermUser = await prisma.user.upsert({
      where: { username: "inventory_test_noperm" },
      update: {},
      create: {
        firstName: "No", lastName: "Perm", displayName: "No Perm", username: "inventory_test_noperm",
        email: "inventory_test_noperm@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: noPermRole.id, allBranches: true,
      },
    });
    noPermCookie = `access_token=${signAccessToken({ sub: noPermUser.id, roleId: noPermRole.id })}`;

    category = await prisma.category.create({ data: { name: `Inv Cat ${Date.now()}` } });
    branchA = await prisma.branch.create({ data: { name: `Inv Sucursal A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Inv Sucursal B ${Date.now()}` } });

    const p = await prisma.product.create({
      data: {
        sku: `INV-TEST-${Date.now()}`,
        name: "Producto inventario",
        price: 100,
        categoryId: category.id,
        minStock: 10,
      },
    });
    product = { id: p.id, minStock: p.minStock };
    productIds.push(p.id);

    const lp = await prisma.product.create({
      data: {
        sku: `INV-LOW-${Date.now()}`,
        name: "Producto bajo stock",
        price: 50,
        categoryId: category.id,
        minStock: 10,
      },
    });
    lowStockProduct = { id: lp.id };
    productIds.push(lp.id);
  });

  afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { username: { in: ["inventory_test_admin", "inventory_test_noperm"] } } });
    await prisma.role.deleteMany({ where: { code: "inventory_test_no_perms" } }).catch(() => {});
  });

  describe("applyMovement", () => {
    it("a positive quantity increases stock and creates a movement row with correct stockBefore/stockAfter", async () => {
      const movement = await applyMovement({
        productId: product.id,
        branchId: branchA.id,
        type: "PURCHASE",
        quantity: 15,
      });

      expect(movement.stockBefore).toBe(0);
      expect(movement.stockAfter).toBe(15);
      expect(movement.quantity).toBe(15);
      expect(movement.type).toBe("PURCHASE");

      const row = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branchA.id } });
      expect(row?.stock).toBe(15);

      const freshMovement = await prisma.inventoryMovement.findUnique({ where: { id: movement.id } });
      expect(freshMovement?.stockBefore).toBe(0);
      expect(freshMovement?.stockAfter).toBe(15);
    });

    it("a subsequent negative quantity decreases stock correctly", async () => {
      const movement = await applyMovement({
        productId: product.id,
        branchId: branchA.id,
        type: "SALE",
        quantity: -5,
      });

      expect(movement.stockBefore).toBe(15);
      expect(movement.stockAfter).toBe(10);

      const row = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branchA.id } });
      expect(row?.stock).toBe(10);
    });

    it("throws AppError(400) when a negative quantity would take stock below zero, and does NOT create a movement row or change stock", async () => {
      const before = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branchA.id } });
      expect(before?.stock).toBe(10);

      const movementsBefore = await prisma.inventoryMovement.count({ where: { productId: product.id, branchId: branchA.id } });

      await expect(
        applyMovement({
          productId: product.id,
          branchId: branchA.id,
          type: "SALE",
          quantity: -9999,
        })
      ).rejects.toThrow(AppError);

      // Fresh DB read — not trusting in-memory state — to prove the rejected
      // transaction left both the inventory row and the movement log untouched.
      const after = await prisma.inventory.findFirst({ where: { productId: product.id, branchId: branchA.id } });
      expect(after?.stock).toBe(10);

      const movementsAfter = await prisma.inventoryMovement.count({ where: { productId: product.id, branchId: branchA.id } });
      expect(movementsAfter).toBe(movementsBefore);
    });

    it("rejects a movement that would take a brand-new (never-stocked) row negative, without creating an inventory row", async () => {
      const freshProduct = await prisma.product.create({
        data: { sku: `INV-FRESH-${Date.now()}`, name: "Producto fresco", price: 20, minStock: 5 },
      });
      productIds.push(freshProduct.id);

      await expect(
        applyMovement({ productId: freshProduct.id, branchId: branchA.id, type: "SALE", quantity: -1 })
      ).rejects.toThrow(AppError);

      const row = await prisma.inventory.findFirst({ where: { productId: freshProduct.id, branchId: branchA.id } });
      expect(row).toBeNull();
    });

    it("two concurrent applyMovement calls for the same inventory row don't lose an update", async () => {
      const raceProduct = await prisma.product.create({
        data: { sku: `INV-RACE-${Date.now()}`, name: "Producto concurrencia", price: 30, minStock: 5 },
      });
      productIds.push(raceProduct.id);

      // Seed an initial stock so both concurrent calls are stock-out
      // movements that both fit (proving the lock doesn't just serialize
      // arbitrarily but that both updates are actually reflected).
      await applyMovement({ productId: raceProduct.id, branchId: branchA.id, type: "PURCHASE", quantity: 100 });

      // Fired together via Promise.all (not one-at-a-time) so both
      // transactions are genuinely in flight concurrently, hitting Postgres
      // at the same time — the same technique productImages.test.ts uses to
      // prove productImageRepository's row lock (Task 3) actually closes the
      // race, rather than merely asserting sequential-call correctness.
      const [a, b] = await Promise.all([
        applyMovement({ productId: raceProduct.id, branchId: branchA.id, type: "SALE", quantity: -10 }),
        applyMovement({ productId: raceProduct.id, branchId: branchA.id, type: "SALE", quantity: -7 }),
      ]);

      expect(a.stockAfter).not.toBe(b.stockAfter); // no two movements should compute the same resulting stock
      const finalRow = await prisma.inventory.findFirst({ where: { productId: raceProduct.id, branchId: branchA.id } });
      expect(finalRow?.stock).toBe(100 - 10 - 7);
    });

    it("keeps concurrent movements correct for a variant-less product (nullable variantId edge case)", async () => {
      const raceProduct = await prisma.product.create({
        data: { sku: `INV-RACE-NULL-${Date.now()}`, name: "Producto concurrencia sin variante", price: 30, minStock: 5 },
      });
      productIds.push(raceProduct.id);

      const [a, b] = await Promise.all([
        applyMovement({ productId: raceProduct.id, branchId: branchA.id, type: "PURCHASE", quantity: 20 }),
        applyMovement({ productId: raceProduct.id, branchId: branchA.id, type: "PURCHASE", quantity: 30 }),
      ]);

      expect(a.stockAfter).not.toBe(b.stockAfter);

      // The critical assertion: no duplicate inventory row was created for
      // this (productId, variantId=null, branchId) combination — Postgres
      // unique constraints never conflict on NULL, so a naive upsert keyed
      // on the compound unique index would silently create two rows here.
      const rows = await prisma.inventory.findMany({ where: { productId: raceProduct.id, branchId: branchA.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].stock).toBe(50);
    });

    it("does not serialize concurrent applyMovement calls for the SAME product across DIFFERENT branches or variants (advisory lock is scoped to the exact tuple, not the whole product)", async () => {
      // Review round 2: the lock moved from a Product-row SELECT ... FOR
      // UPDATE (which would serialize every call below through one lock)
      // to a pg_advisory_xact_lock keyed on the full (productId, variantId,
      // branchId) tuple. This test doesn't measure timing/parallelism —
      // that's not reliably assertable from a test — it proves the
      // correctness half of the claim: four concurrent calls touching four
      // disjoint rows of the SAME product (two different branches, plus
      // two different variants at a third branch) all land correctly with
      // no lost updates, no cross-contamination between rows, and no
      // unexpected serialization-related failure (e.g. deadlock/timeout).
      const sharedProduct = await prisma.product.create({
        data: { sku: `INV-INDEP-${Date.now()}`, name: "Producto independencia", price: 25, minStock: 5 },
      });
      productIds.push(sharedProduct.id);
      const variantP = await prisma.productVariant.create({
        data: { productId: sharedProduct.id, name: "P", sku: `INV-INDEP-${Date.now()}-P`, minStock: 2 },
      });
      const variantQ = await prisma.productVariant.create({
        data: { productId: sharedProduct.id, name: "Q", sku: `INV-INDEP-${Date.now()}-Q`, minStock: 2 },
      });

      const [branchAResult, branchBResult, variantPResult, variantQResult] = await Promise.all([
        applyMovement({ productId: sharedProduct.id, branchId: branchA.id, type: "PURCHASE", quantity: 11 }),
        applyMovement({ productId: sharedProduct.id, branchId: branchB.id, type: "PURCHASE", quantity: 22 }),
        applyMovement({ productId: sharedProduct.id, variantId: variantP.id, branchId: branchA.id, type: "PURCHASE", quantity: 33 }),
        applyMovement({ productId: sharedProduct.id, variantId: variantQ.id, branchId: branchA.id, type: "PURCHASE", quantity: 44 }),
      ]);

      // Each call started from stockBefore=0 (four genuinely disjoint rows)
      // and must land at its own stockAfter — if the advisory lock were
      // accidentally scoped too broadly (e.g. by product only) these could
      // still pass by luck, but if it were scoped too narrowly / broken
      // (not locking at all) a race could corrupt one of these; combined
      // with the fresh-row reads below this proves both isolation and
      // correctness.
      expect(branchAResult.stockAfter).toBe(11);
      expect(branchBResult.stockAfter).toBe(22);
      expect(variantPResult.stockAfter).toBe(33);
      expect(variantQResult.stockAfter).toBe(44);

      const rowBranchA = await prisma.inventory.findFirst({ where: { productId: sharedProduct.id, variantId: null, branchId: branchA.id } });
      const rowBranchB = await prisma.inventory.findFirst({ where: { productId: sharedProduct.id, variantId: null, branchId: branchB.id } });
      const rowVariantP = await prisma.inventory.findFirst({ where: { productId: sharedProduct.id, variantId: variantP.id, branchId: branchA.id } });
      const rowVariantQ = await prisma.inventory.findFirst({ where: { productId: sharedProduct.id, variantId: variantQ.id, branchId: branchA.id } });
      expect(rowBranchA?.stock).toBe(11);
      expect(rowBranchB?.stock).toBe(22);
      expect(rowVariantP?.stock).toBe(33);
      expect(rowVariantQ?.stock).toBe(44);
    });

    it("tracks stock per variant independently of the product's variant-less row and other variants", async () => {
      const variantProduct = await prisma.product.create({
        data: { sku: `INV-VARIANT-${Date.now()}`, name: "Producto con variantes", price: 40, minStock: 5 },
      });
      productIds.push(variantProduct.id);
      const variantX = await prisma.productVariant.create({
        data: { productId: variantProduct.id, name: "X", sku: `INV-VARIANT-${Date.now()}-X`, minStock: 4 },
      });
      const variantY = await prisma.productVariant.create({
        data: { productId: variantProduct.id, name: "Y", sku: `INV-VARIANT-${Date.now()}-Y`, minStock: 4 },
      });

      await applyMovement({ productId: variantProduct.id, variantId: variantX.id, branchId: branchA.id, type: "PURCHASE", quantity: 10 });
      await applyMovement({ productId: variantProduct.id, variantId: variantY.id, branchId: branchA.id, type: "PURCHASE", quantity: 3 });

      const rowX = await prisma.inventory.findFirst({ where: { productId: variantProduct.id, variantId: variantX.id, branchId: branchA.id } });
      const rowY = await prisma.inventory.findFirst({ where: { productId: variantProduct.id, variantId: variantY.id, branchId: branchA.id } });
      expect(rowX?.stock).toBe(10);
      expect(rowY?.stock).toBe(3);

      // A movement against variantX must not be able to oversell variantY's stock.
      await expect(
        applyMovement({ productId: variantProduct.id, variantId: variantY.id, branchId: branchA.id, type: "SALE", quantity: -4 })
      ).rejects.toThrow(AppError);
      const rowYAfter = await prisma.inventory.findFirst({ where: { productId: variantProduct.id, variantId: variantY.id, branchId: branchA.id } });
      expect(rowYAfter?.stock).toBe(3);
    });
  });

  describe("GET /api/inventory", () => {
    beforeAll(async () => {
      // product: stock 10 at branchA already (from the applyMovement tests above), minStock 10 -> LOW
      await applyMovement({ productId: lowStockProduct.id, branchId: branchA.id, type: "PURCHASE", quantity: 2 }); // minStock 10 -> CRITICAL (2 <= floor(10/2)=5)
      await applyMovement({ productId: lowStockProduct.id, branchId: branchB.id, type: "PURCHASE", quantity: 50 }); // AVAILABLE
    });

    it("requires authentication", async () => {
      const res = await request(app).get("/api/inventory");
      expect(res.status).toBe(401);
    });

    it("rejects a user whose role lacks inventory.view with 403", async () => {
      const res = await request(app).get("/api/inventory").set("Cookie", [noPermCookie]);
      expect(res.status).toBe(403);
    });

    it("lists inventory rows with computed status, filterable by branch", async () => {
      const res = await request(app).get(`/api/inventory?branchId=${branchA.id}`).set("Cookie", [cookie]);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.every((r: any) => r.branchId === branchA.id)).toBe(true);

      const productRow = res.body.find((r: any) => r.productId === product.id);
      expect(productRow).toBeDefined();
      expect(productRow.stock).toBe(10);
      expect(productRow.status).toBe("LOW"); // 10 <= minStock(10), > floor(10/2)=5

      const lowRow = res.body.find((r: any) => r.productId === lowStockProduct.id);
      expect(lowRow.stock).toBe(2);
      expect(lowRow.status).toBe("CRITICAL"); // 2 <= floor(10/2)=5
    });

    it("filters by computed status", async () => {
      const res = await request(app)
        .get(`/api/inventory?branchId=${branchA.id}&status=CRITICAL`)
        .set("Cookie", [cookie]);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((r: any) => r.status === "CRITICAL")).toBe(true);
      expect(res.body.some((r: any) => r.productId === lowStockProduct.id)).toBe(true);
      expect(res.body.some((r: any) => r.productId === product.id)).toBe(false);
    });

    it("filters by branch showing a different row for the same product", async () => {
      const res = await request(app).get(`/api/inventory?branchId=${branchB.id}`).set("Cookie", [cookie]);
      expect(res.status).toBe(200);
      const row = res.body.find((r: any) => r.productId === lowStockProduct.id);
      expect(row.stock).toBe(50);
      expect(row.status).toBe("AVAILABLE");
    });

    it("uses the variant's own minStock (not the product's) to compute status for a variant row", async () => {
      // Product minStock is 10 (would read LOW at stock=6), but the variant
      // has its own minStock of 4 (stock=6 is comfortably AVAILABLE under
      // the variant's own threshold). This proves the controller reads
      // `row.variant?.minStock ?? row.product.minStock`, not just the
      // product's minStock unconditionally.
      const variantProduct = await prisma.product.create({
        data: { sku: `INV-STATUS-VARIANT-${Date.now()}`, name: "Producto variante status", price: 40, minStock: 10 },
      });
      productIds.push(variantProduct.id);
      const variant = await prisma.productVariant.create({
        data: { productId: variantProduct.id, name: "Unica", sku: `INV-STATUS-VARIANT-${Date.now()}-U`, minStock: 4 },
      });
      await applyMovement({ productId: variantProduct.id, variantId: variant.id, branchId: branchA.id, type: "PURCHASE", quantity: 6 });

      const res = await request(app).get(`/api/inventory?branchId=${branchA.id}`).set("Cookie", [cookie]);
      expect(res.status).toBe(200);
      const row = res.body.find((r: any) => r.variantId === variant.id);
      expect(row).toBeDefined();
      expect(row.stock).toBe(6);
      expect(row.status).toBe("AVAILABLE"); // 6 > minStock(4) under variant's own threshold
    });
  });

  describe("GET /api/inventory/:productId/movements", () => {
    it("returns kardex history for a product, newest first", async () => {
      const res = await request(app)
        .get(`/api/inventory/${product.id}/movements`)
        .set("Cookie", [cookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      const types = res.body.map((m: any) => m.type);
      expect(types).toContain("PURCHASE");
      expect(types).toContain("SALE");

      // Newest first
      const createdAts = res.body.map((m: any) => new Date(m.createdAt).getTime());
      const sorted = [...createdAts].sort((a, b) => b - a);
      expect(createdAts).toEqual(sorted);
    });

    it("requires authentication", async () => {
      const res = await request(app).get(`/api/inventory/${product.id}/movements`);
      expect(res.status).toBe(401);
    });

    it("rejects a user whose role lacks inventory.view with 403", async () => {
      const res = await request(app)
        .get(`/api/inventory/${product.id}/movements`)
        .set("Cookie", [noPermCookie]);
      expect(res.status).toBe(403);
    });
  });

  describe("computeStatus", () => {
    it("matches the exact thresholds: OUT <=0, CRITICAL <= floor(minStock/2), LOW <= minStock, else AVAILABLE", () => {
      expect(computeStatus(0, 10)).toBe("OUT");
      expect(computeStatus(-1, 10)).toBe("OUT");
      expect(computeStatus(5, 10)).toBe("CRITICAL"); // floor(10/2) = 5
      expect(computeStatus(6, 10)).toBe("LOW");
      expect(computeStatus(10, 10)).toBe("LOW");
      expect(computeStatus(11, 10)).toBe("AVAILABLE");
      // odd minStock: floor(7/2) = 3
      expect(computeStatus(3, 7)).toBe("CRITICAL");
      expect(computeStatus(4, 7)).toBe("LOW");
    });
  });
});
