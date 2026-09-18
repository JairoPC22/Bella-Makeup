# Bella Makeup — Catálogo e Inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build products, variants, images, categories, brands, and real per-branch inventory with a full movement history (kardex) — the catalog and stock data the upcoming online store will read and decrement live.

**Architecture:** Same layered backend (`routes → controllers → services → repositories → Prisma`) and frontend (`pages → components → services`) conventions established in Phase 1. A single central inventory-movement service is the only code path allowed to change `inventory.stock` — every future phase (sales, purchases, transfers) calls it instead of writing stock directly, mirroring how Phase 1's `auditService` became the single source of truth for audit rows.

**Tech Stack:** Same as Phase 1 (Express 5, TypeScript, Prisma, PostgreSQL, Zod, vitest+supertest; React 18, Vite, TypeScript, React Router, lucide-react). Adds `multer` (already a Phase-1 dependency, unused until now) for image upload and `sharp` (already a dependency) for image optimization.

## Global Constraints

- Follow every Phase 1 convention exactly: layered backend, `requireAuth` + `requirePermission` on every route, Zod validation on every write endpoint, `logAudit` call for every significant write, design tokens only (no hardcoded hex), no emoji (lucide-react icons), loading/empty/error/success/disabled states on every data view, `PermissionGate` on every admin action in the UI.
- **Single source of truth for stock changes:** no service outside `inventoryService.ts` may call `prisma.inventory.update()` on the `stock` field directly. Every stock change (this phase: manual adjustments; future phases: sales, purchases, transfers) goes through `inventoryService.applyMovement(...)`, which updates `inventory.stock` AND writes an `inventory_movements` row in the same transaction.
- Money fields (`cost`, `price`, `promoPrice`) are `Decimal` in Prisma, not `Float` — avoid floating-point rounding errors on currency.
- Image uploads go to `BellaBack/uploads/products/` (the `uploads/` folder already exists from Phase 1 scaffolding), served statically; store only the relative path in the DB, never a full filesystem path.
- Permission codes already exist from Phase 1's seed (`products.view`, `products.create`, `products.edit`, `products.delete`, `inventory.view`, `inventory.adjust`) — reuse them, don't invent new ones.
- Palette/typography/token system from Phase 1 (`src/styles/tokens.css`) is unchanged — extend, never fork.

---

## File Structure

**BellaBack/**
- `prisma/schema.prisma` — add `Category`, `Brand`, `Product`, `ProductImage`, `ProductVariant`, `Inventory`, `InventoryMovement`, `InventoryAdjustment` models + `MovementType` enum.
- `prisma/seed.ts` — extend with demo categories, brands, 4-5 demo products (some with variants), initial stock rows for both seeded branches.
- `src/config/multer.ts` — multer disk-storage config for product image uploads.
- `src/repositories/categoryRepository.ts`, `brandRepository.ts`, `productRepository.ts`, `productVariantRepository.ts`, `productImageRepository.ts`, `inventoryRepository.ts`, `inventoryMovementRepository.ts`.
- `src/services/categoryService.ts`, `brandService.ts`, `productService.ts`, `inventoryService.ts` (the central movement service), `inventoryAdjustmentService.ts`.
- `src/controllers/categoryController.ts`, `brandController.ts`, `productController.ts`, `productImageController.ts`, `inventoryController.ts`.
- `src/routes/category.routes.ts`, `brand.routes.ts`, `product.routes.ts`, `inventory.routes.ts`. Modify `src/app.ts` to mount all four + serve `uploads/` statically.
- `src/validators/category.validators.ts`, `brand.validators.ts`, `product.validators.ts`, `inventory.validators.ts`.
- `tests/categories.test.ts`, `brands.test.ts`, `products.test.ts`, `productImages.test.ts`, `inventory.test.ts`, `inventoryAdjustments.test.ts`.

**BellaFront/**
- `src/types/api.ts` — add `Category`, `Brand`, `Product`, `ProductVariant`, `ProductImage`, `InventoryItem`, `InventoryMovement` types.
- `src/services/categoryService.ts`, `brandService.ts`, `productService.ts`, `inventoryService.ts`.
- `src/components/common/ImageUploader.tsx` — drag & drop multi-image uploader (reused by product form).
- `src/pages/products/ProductsPage.tsx`, `ProductFormModal.tsx`, `ProductsPage.css` — list + create/edit with variants + images, category/brand filters.
- `src/pages/inventory/InventoryPage.tsx`, `InventoryPage.css` — stock table per branch with status badges and filters.
- `src/pages/inventory/AdjustmentModal.tsx` — manual stock adjustment form.
- `src/pages/inventory/KardexModal.tsx` — movement history for one product/variant.
- `src/components/layout/Sidebar.tsx` — add "Productos" and "Inventario" nav links (modify, don't recreate).
- `src/app/router.tsx` — add `/productos` and `/inventario` routes, permission-gated.

---

## Backend Tasks

### Task 1: Prisma schema (catalog + inventory models) + migration + seed

**Files:**
- Modify: `BellaBack/prisma/schema.prisma`
- Modify: `BellaBack/prisma/seed.ts`

**Interfaces:**
- Produces: Prisma models `Category`, `Brand`, `Product`, `ProductImage`, `ProductVariant`, `Inventory`, `InventoryMovement`, `InventoryAdjustment`, enum `MovementType`. Every later task imports these via the `prisma` singleton exactly as Phase 1 tasks did.

- [ ] **Step 1: Add to `schema.prisma`**

```prisma
enum ProductStatus {
  ACTIVE
  INACTIVE
}

enum MovementType {
  ADJUSTMENT
  PURCHASE
  SALE
  TRANSFER_IN
  TRANSFER_OUT
  RETURN
}

model Category {
  id        String    @id @default(uuid())
  name      String
  status    ProductStatus @default(ACTIVE)
  createdAt DateTime  @default(now()) @map("created_at")

  products  Product[]

  @@map("categories")
}

model Brand {
  id        String    @id @default(uuid())
  name      String
  status    ProductStatus @default(ACTIVE)
  createdAt DateTime  @default(now()) @map("created_at")

  products  Product[]

  @@map("brands")
}

model Product {
  id            String        @id @default(uuid())
  sku           String        @unique
  barcode       String?
  name          String
  description   String?
  categoryId    String?       @map("category_id")
  brandId       String?       @map("brand_id")
  cost          Decimal       @default(0) @db.Decimal(10, 2)
  price         Decimal       @db.Decimal(10, 2)
  promoPrice    Decimal?      @map("promo_price") @db.Decimal(10, 2)
  taxRate       Decimal       @default(0) @map("tax_rate") @db.Decimal(5, 2)
  minStock      Int           @default(0) @map("min_stock")
  maxStock      Int?          @map("max_stock")
  status        ProductStatus @default(ACTIVE)
  createdAt     DateTime      @default(now()) @map("created_at")

  category      Category?     @relation(fields: [categoryId], references: [id])
  brand         Brand?        @relation(fields: [brandId], references: [id])
  images        ProductImage[]
  variants      ProductVariant[]
  inventory     Inventory[]
  movements     InventoryMovement[]

  @@map("products")
  @@index([categoryId])
  @@index([brandId])
}

model ProductImage {
  id         String   @id @default(uuid())
  productId  String   @map("product_id")
  url        String
  isPrimary  Boolean  @default(false) @map("is_primary")
  sortOrder  Int      @default(0) @map("sort_order")
  createdAt  DateTime @default(now()) @map("created_at")

  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@map("product_images")
}

model ProductVariant {
  id          String    @id @default(uuid())
  productId   String    @map("product_id")
  name        String
  sku         String    @unique
  barcode     String?
  imageUrl    String?   @map("image_url")
  price       Decimal?  @db.Decimal(10, 2)
  minStock    Int       @default(0) @map("min_stock")
  maxStock    Int?      @map("max_stock")
  status      ProductStatus @default(ACTIVE)

  product     Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  inventory   Inventory[]
  movements   InventoryMovement[]

  @@map("product_variants")
}

model Inventory {
  id         String   @id @default(uuid())
  productId  String   @map("product_id")
  variantId  String?  @map("variant_id")
  branchId   String   @map("branch_id")
  stock      Int      @default(0)
  updatedAt  DateTime @updatedAt @map("updated_at")

  product    Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant    ProductVariant? @relation(fields: [variantId], references: [id], onDelete: Cascade)
  branch     Branch          @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([productId, variantId, branchId])
  @@map("inventory")
  @@index([branchId])
}

model InventoryMovement {
  id            String       @id @default(uuid())
  productId     String       @map("product_id")
  variantId     String?      @map("variant_id")
  branchId      String       @map("branch_id")
  type          MovementType
  quantity      Int
  stockBefore   Int          @map("stock_before")
  stockAfter    Int          @map("stock_after")
  reference     String?
  userId        String?      @map("user_id")
  createdAt     DateTime     @default(now()) @map("created_at")

  product       Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant       ProductVariant? @relation(fields: [variantId], references: [id], onDelete: Cascade)
  branch        Branch          @relation(fields: [branchId], references: [id], onDelete: Cascade)
  user          User?           @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@map("inventory_movements")
  @@index([productId])
  @@index([branchId])
  @@index([createdAt])
}

model InventoryAdjustment {
  id           String   @id @default(uuid())
  movementId   String   @unique @map("movement_id")
  reason       String
  authorizedBy String?  @map("authorized_by")
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("inventory_adjustments")
}
```

Also add back-relations on the existing `Branch` model (`inventory Inventory[]`, `inventoryMovements InventoryMovement[]`) and `User` model (`inventoryMovements InventoryMovement[]`) — Prisma requires both sides of a relation declared.

- [ ] **Step 2: Run the migration**

Run: `cd BellaBack && npx prisma migrate dev --name catalog_inventory`
Expected: migration applies cleanly against the running Docker Postgres.

- [ ] **Step 3: Extend `prisma/seed.ts`**

Append (inside `main()`, after the existing Phase 1 seed logic, before the closing `console.log`):

```typescript
const maquillaje = await prisma.category.upsert({
  where: { id: "10000000-0000-0000-0000-000000000001" },
  update: {},
  create: { id: "10000000-0000-0000-0000-000000000001", name: "Maquillaje" },
});
const cuidadoPiel = await prisma.category.upsert({
  where: { id: "10000000-0000-0000-0000-000000000002" },
  update: {},
  create: { id: "10000000-0000-0000-0000-000000000002", name: "Cuidado de la piel" },
});

const bellaBrand = await prisma.brand.upsert({
  where: { id: "20000000-0000-0000-0000-000000000001" },
  update: {},
  create: { id: "20000000-0000-0000-0000-000000000001", name: "Bella Makeup" },
});

const labial = await prisma.product.upsert({
  where: { sku: "LAB-MATTE-001" },
  update: {},
  create: {
    sku: "LAB-MATTE-001", name: "Labial Matte", categoryId: maquillaje.id, brandId: bellaBrand.id,
    cost: 80, price: 129, minStock: 5, maxStock: 100,
  },
});
const labialNude = await prisma.productVariant.upsert({
  where: { sku: "LAB-MATTE-001-NUDE" },
  update: {},
  create: { productId: labial.id, name: "Nude", sku: "LAB-MATTE-001-NUDE", minStock: 3, maxStock: 40 },
});
const labialRojo = await prisma.productVariant.upsert({
  where: { sku: "LAB-MATTE-001-ROJO" },
  update: {},
  create: { productId: labial.id, name: "Rojo", sku: "LAB-MATTE-001-ROJO", minStock: 3, maxStock: 40 },
});

const base = await prisma.product.upsert({
  where: { sku: "BASE-LIQ-001" },
  update: {},
  create: {
    sku: "BASE-LIQ-001", name: "Base Líquida", categoryId: maquillaje.id, brandId: bellaBrand.id,
    cost: 150, price: 280, minStock: 5, maxStock: 60,
  },
});

const crema = await prisma.product.upsert({
  where: { sku: "CREMA-HID-001" },
  update: {},
  create: {
    sku: "CREMA-HID-001", name: "Crema Hidratante", categoryId: cuidadoPiel.id, brandId: bellaBrand.id,
    cost: 90, price: 199, minStock: 4, maxStock: 50,
  },
});

const branchesForStock = await prisma.branch.findMany();
const stockSeeds: Array<{ productId: string; variantId?: string; stock: number }> = [
  { productId: labial.id, variantId: labialNude.id, stock: 20 },
  { productId: labial.id, variantId: labialRojo.id, stock: 15 },
  { productId: base.id, stock: 12 },
  { productId: crema.id, stock: 8 },
];
for (const branch of branchesForStock) {
  for (const s of stockSeeds) {
    await prisma.inventory.upsert({
      where: { productId_variantId_branchId: { productId: s.productId, variantId: s.variantId ?? null as any, branchId: branch.id } },
      update: {},
      create: { productId: s.productId, variantId: s.variantId, branchId: branch.id, stock: s.stock },
    });
  }
}
```

- [ ] **Step 4: Run the seed and verify**

Run: `npm run prisma:seed`
Expected: 2 categories, 1 brand, 3 products (1 with 2 variants), inventory rows for both branches.

- [ ] **Step 5: Commit**

```bash
git add BellaBack/prisma
git commit -m "feat(backend): catalog and inventory Prisma schema + seed data"
```

---

### Task 2: Categories & Brands CRUD (TDD)

**Files:**
- Create: `src/repositories/categoryRepository.ts`, `src/repositories/brandRepository.ts`
- Create: `src/services/categoryService.ts`, `src/services/brandService.ts`
- Create: `src/controllers/categoryController.ts`, `src/controllers/brandController.ts`
- Create: `src/routes/category.routes.ts`, `src/routes/brand.routes.ts`
- Create: `src/validators/category.validators.ts`, `src/validators/brand.validators.ts`
- Modify: `src/app.ts`
- Test: `tests/categories.test.ts`, `tests/brands.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requirePermission` (Phase 1), `logAudit` (Phase 1), `prisma`.
- Produces: `GET/POST /api/categories`, `PUT /api/categories/:id`, `PATCH /api/categories/:id/status` (mirror for `/api/brands`). Both gated by `products.view` (GET) / `products.edit` (write) — categories/brands are product metadata, reuse product permissions rather than inventing new ones. Response shape `{ id, name, status, createdAt }`.

- [ ] **Step 1: Write failing tests** — same shape as Phase 1's `branches.test.ts` (create → list → update → deactivate, plus a 403 test for a role without `products.edit`). Write one file per entity, following that exact pattern (idempotent test user creation via `upsert`, per the established convention).

- [ ] **Step 2: Implement following the exact layered pattern from Phase 1's `branchRepository.ts`/`branchService.ts`/`branchController.ts`/`branch.routes.ts`** — same CRUD shape, same `logAudit` calls (`action: "categories.create"` etc., `module: "products"`), same Zod validators (`z.object({ name: z.string().min(1) })` for create, `.partial()` for update).

- [ ] **Step 3: Mount in `app.ts`, run tests, commit**

```typescript
import categoryRoutes from "./routes/category.routes";
import brandRoutes from "./routes/brand.routes";
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
```

Run: `npx vitest run tests/categories.test.ts tests/brands.test.ts` → Expected: PASS.

```bash
git add BellaBack/src BellaBack/tests/categories.test.ts BellaBack/tests/brands.test.ts
git commit -m "feat(backend): categories and brands CRUD"
```

---

### Task 3: Multer config + product image upload/delete endpoints (TDD)

**Files:**
- Create: `src/config/multer.ts`
- Create: `src/repositories/productImageRepository.ts`
- Create: `src/controllers/productImageController.ts` (mounted under product routes, created in Task 4 — this task creates the controller functions, Task 4 wires the routes since they're nested under `/api/products/:id/images`)
- Test: `tests/productImages.test.ts` (written here, run once Task 4's routes exist — note this dependency explicitly if you're the Task 3 implementer: your tests may need to stay RED until Task 4 lands, or coordinate with the controller so a minimal route exists now — simplest: Task 3 creates the full route file `src/routes/productImage.routes.ts` mounted directly at `/api/products/:productId/images`, independent of Task 4's product CRUD routes, so this task is fully self-contained.)
- Modify: `src/app.ts` — serve `uploads/` statically, mount image routes.

**Interfaces:**
- Produces: `POST /api/products/:productId/images` (multipart form-data, field name `image`, max 5MB, jpeg/png/webp only) → uploads to `uploads/products/`, creates a `ProductImage` row, returns it. `DELETE /api/products/:productId/images/:imageId`. `PATCH /api/products/:productId/images/:imageId/primary` (sets this image primary, unsets any other primary image for the same product in one transaction).
- Consumes: `requireAuth` + `requirePermission("products.edit")`, `logAudit`.

- [ ] **Step 1: `src/config/multer.ts`**

```typescript
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { AppError } from "../utils/AppError";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: path.resolve(process.cwd(), "uploads/products"),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new AppError(400, "Formato de imagen no permitido (solo JPG, PNG o WEBP)") as unknown as null, false);
    }
    cb(null, true);
  },
});
```

Ensure `uploads/products/` exists (Phase 1 has `uploads/` already; create the `products` subfolder — add a `.gitkeep` so the empty dir is tracked).

- [ ] **Step 2: Write failing tests** in `tests/productImages.test.ts` — use `supertest`'s `.attach("image", buffer, "test.jpg")` with a tiny in-memory JPEG buffer (a 1x1 pixel JPEG byte array is fine — don't depend on an external fixture file). Cover: upload succeeds and returns `{ id, url, isPrimary }`; first uploaded image for a product is automatically `isPrimary: true`; uploading a second image does not unset the first's primary flag (only explicit `PATCH .../primary` does); delete removes the file and the row; a non-image file (e.g. `.txt`) is rejected with 400.

- [ ] **Step 3: `src/repositories/productImageRepository.ts`, `src/services/` (inline in controller is fine for this small a surface, or a thin `productImageService.ts` if you prefer consistency with the rest of the codebase — match the established pattern), `src/controllers/productImageController.ts`, `src/routes/productImage.routes.ts`**

Implement per the Interfaces section above. Use `sharp` to resize uploaded images to a max width of 1200px (preserve aspect ratio, no upscaling) before saving, to keep storage/bandwidth sane — read the file after multer saves it, process with `sharp(path).resize({ width: 1200, withoutEnlargement: true })`, overwrite.

- [ ] **Step 4: Mount routes in `app.ts`, serve uploads statically**

```typescript
import express from "express";
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
import productImageRoutes from "./routes/productImage.routes";
app.use("/api/products", productImageRoutes); // routes internally define "/:productId/images..."
```

- [ ] **Step 5: Run tests, commit**

```bash
git add BellaBack/src BellaBack/uploads/products/.gitkeep BellaBack/tests/productImages.test.ts BellaBack/.gitignore
git commit -m "feat(backend): product image upload with sharp optimization"
```

(Ensure `BellaBack/.gitignore` still excludes actual uploaded files — `uploads/*` `!uploads/.gitkeep` pattern from Phase 1 — extend it to also keep `uploads/products/.gitkeep` tracked while ignoring its contents: `uploads/products/*` + `!uploads/products/.gitkeep`.)

---

### Task 4: Products CRUD with nested variants (TDD)

**Files:**
- Create: `src/repositories/productRepository.ts`, `src/repositories/productVariantRepository.ts`
- Create: `src/services/productService.ts`
- Create: `src/controllers/productController.ts`
- Create: `src/routes/product.routes.ts`
- Create: `src/validators/product.validators.ts`
- Modify: `src/app.ts`
- Test: `tests/products.test.ts`

**Interfaces:**
- Consumes: `requireAuth`/`requirePermission` (`products.view`/`products.create`/`products.edit`/`products.delete`), `logAudit`, `prisma`.
- Produces: `GET /api/products` (query filters: `categoryId`, `brandId`, `status`, `search`), `GET /api/products/:id` (includes `images`, `variants`, and this product's `inventory` rows across branches), `POST /api/products` (body includes an optional `variants: Array<{name, sku, price?, minStock, maxStock}>` created in the same transaction), `PUT /api/products/:id`, `PATCH /api/products/:id/status`. Every product response includes `images: ProductImage[]` and `variants: ProductVariant[]`.

- [ ] **Step 1: Write failing tests** — cover: create a product with 2 nested variants in one request (assert both variants exist afterward), list with category filter, list with search (matches name or SKU, case-insensitive — use Prisma's `contains` + `mode: "insensitive"`), get by id includes images/variants/inventory, update, deactivate, 403 for a role without `products.create`.

- [ ] **Step 2: `src/validators/product.validators.ts`**

```typescript
import { z } from "zod";

const variantSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  price: z.coerce.number().positive().optional(),
  minStock: z.coerce.number().int().min(0).default(0),
  maxStock: z.coerce.number().int().min(0).optional(),
});

export const createProductSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  cost: z.coerce.number().min(0).default(0),
  price: z.coerce.number().positive(),
  promoPrice: z.coerce.number().positive().optional(),
  taxRate: z.coerce.number().min(0).default(0),
  minStock: z.coerce.number().int().min(0).default(0),
  maxStock: z.coerce.number().int().min(0).optional(),
  variants: z.array(variantSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const updateProductStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export const listProductsQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  search: z.string().optional(),
});
```

- [ ] **Step 3: `src/repositories/productRepository.ts`**

```typescript
import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

const productInclude = { images: { orderBy: { sortOrder: "asc" as const } }, variants: true, category: true, brand: true };

export function findAllProducts(filters: { categoryId?: string; brandId?: string; status?: "ACTIVE" | "INACTIVE"; search?: string }) {
  const where: Prisma.ProductWhereInput = {
    categoryId: filters.categoryId,
    brandId: filters.brandId,
    status: filters.status,
    OR: filters.search
      ? [
          { name: { contains: filters.search, mode: "insensitive" } },
          { sku: { contains: filters.search, mode: "insensitive" } },
        ]
      : undefined,
  };
  return prisma.product.findMany({ where, include: productInclude, orderBy: { name: "asc" } });
}

export function findProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { ...productInclude, inventory: { include: { branch: true } } },
  });
}

export function createProductWithVariants(data: Prisma.ProductUncheckedCreateInput, variants: Array<any>) {
  return prisma.product.create({
    data: { ...data, variants: variants?.length ? { create: variants } : undefined },
    include: productInclude,
  });
}

export function updateProduct(id: string, data: Prisma.ProductUncheckedUpdateInput) {
  return prisma.product.update({ where: { id }, data, include: productInclude });
}
```

- [ ] **Step 4: `src/services/productService.ts`** — thin layer calling the repository, plus `logAudit` on create/update/status-change (`module: "products"`), following the exact pattern of Phase 1's `branchService.ts`.

- [ ] **Step 5: `src/controllers/productController.ts` + `src/routes/product.routes.ts`** — mirror Phase 1's `branchController.ts`/`branch.routes.ts` structure exactly, with the query-filter parsing for `GET /api/products` validated through `listProductsQuerySchema`.

- [ ] **Step 6: Mount in `app.ts`, run tests, commit**

```typescript
import productRoutes from "./routes/product.routes";
app.use("/api/products", productRoutes);
```

Run: `npx vitest run tests/products.test.ts` → Expected: PASS.

```bash
git add BellaBack/src BellaBack/tests/products.test.ts
git commit -m "feat(backend): products CRUD with nested variants, filters, search"
```

---

### Task 5: Central inventory-movement service + inventory query endpoint (TDD)

**Files:**
- Create: `src/repositories/inventoryRepository.ts`, `src/repositories/inventoryMovementRepository.ts`
- Create: `src/services/inventoryService.ts` — **the single source of truth for stock changes, per Global Constraints**
- Create: `src/controllers/inventoryController.ts`
- Create: `src/routes/inventory.routes.ts`
- Create: `src/validators/inventory.validators.ts`
- Modify: `src/app.ts`
- Test: `tests/inventory.test.ts`

**Interfaces:**
- Produces: `inventoryService.applyMovement(input: { productId: string; variantId?: string; branchId: string; type: MovementType; quantity: number; reference?: string; userId?: string }): Promise<InventoryMovement>` — the function every future phase (sales, purchases, transfers) will import and call. `quantity` is signed: positive for stock-in (`PURCHASE`, `TRANSFER_IN`, `RETURN`, or a positive `ADJUSTMENT`), negative for stock-out (`SALE`, `TRANSFER_OUT`, or a negative `ADJUSTMENT`). Throws `AppError(400, ...)` if the resulting stock would go negative. `GET /api/inventory` (filters: `branchId`, `categoryId`, `status` computed as available/low/critical/out based on each row's product-or-variant `minStock`) gated by `requirePermission("inventory.view")`.

- [ ] **Step 1: Write failing tests** — cover: `applyMovement` with a positive quantity increases stock and creates a movement row with correct `stockBefore`/`stockAfter`; a negative quantity that would take stock below zero throws `AppError(400)` and does NOT create a movement row or change stock (verify via a fresh DB read); two concurrent calls to `applyMovement` for the same inventory row don't lose an update (use a Prisma transaction with the update — test this by issuing two sequential awaited calls and asserting the final stock is the sum, which is sufficient coverage for Phase-level testing without needing true concurrency simulation). Also test `GET /api/inventory` filtering by branch and by computed status.

- [ ] **Step 2: `src/repositories/inventoryRepository.ts`**

```typescript
import { prisma } from "../config/prisma";

export function findInventoryRow(productId: string, variantId: string | undefined, branchId: string) {
  return prisma.inventory.findUnique({
    where: { productId_variantId_branchId: { productId, variantId: variantId ?? null as any, branchId } },
  });
}

export function upsertInventoryRow(productId: string, variantId: string | undefined, branchId: string, newStock: number) {
  return prisma.inventory.upsert({
    where: { productId_variantId_branchId: { productId, variantId: variantId ?? null as any, branchId } },
    update: { stock: newStock },
    create: { productId, variantId, branchId, stock: newStock },
  });
}

export function listInventory(filters: { branchId?: string; categoryId?: string }) {
  return prisma.inventory.findMany({
    where: {
      branchId: filters.branchId,
      product: filters.categoryId ? { categoryId: filters.categoryId } : undefined,
    },
    include: { product: true, variant: true, branch: true },
    orderBy: { product: { name: "asc" } },
  });
}
```

- [ ] **Step 3: `src/repositories/inventoryMovementRepository.ts`**

```typescript
import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function createMovement(data: Prisma.InventoryMovementUncheckedCreateInput) {
  return prisma.inventoryMovement.create({ data });
}

export function listMovements(productId: string, variantId?: string) {
  return prisma.inventoryMovement.findMany({
    where: { productId, variantId },
    include: { branch: true, user: true },
    orderBy: { createdAt: "desc" },
  });
}
```

- [ ] **Step 4: `src/services/inventoryService.ts`**

```typescript
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { findInventoryRow } from "../repositories/inventoryRepository";

export interface ApplyMovementInput {
  productId: string;
  variantId?: string;
  branchId: string;
  type: "ADJUSTMENT" | "PURCHASE" | "SALE" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN";
  quantity: number; // signed
  reference?: string;
  userId?: string;
}

export async function applyMovement(input: ApplyMovementInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventory.findUnique({
      where: {
        productId_variantId_branchId: {
          productId: input.productId,
          variantId: input.variantId ?? (null as any),
          branchId: input.branchId,
        },
      },
    });
    const stockBefore = existing?.stock ?? 0;
    const stockAfter = stockBefore + input.quantity;
    if (stockAfter < 0) {
      throw new AppError(400, "La operación dejaría el inventario en negativo");
    }

    await tx.inventory.upsert({
      where: {
        productId_variantId_branchId: {
          productId: input.productId,
          variantId: input.variantId ?? (null as any),
          branchId: input.branchId,
        },
      },
      update: { stock: stockAfter },
      create: { productId: input.productId, variantId: input.variantId, branchId: input.branchId, stock: stockAfter },
    });

    return tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        variantId: input.variantId,
        branchId: input.branchId,
        type: input.type,
        quantity: input.quantity,
        stockBefore,
        stockAfter,
        reference: input.reference,
        userId: input.userId,
      },
    });
  });
}

export function computeStatus(stock: number, minStock: number): "AVAILABLE" | "LOW" | "CRITICAL" | "OUT" {
  if (stock <= 0) return "OUT";
  if (stock <= Math.floor(minStock / 2)) return "CRITICAL";
  if (stock <= minStock) return "LOW";
  return "AVAILABLE";
}

export { listInventory } from "../repositories/inventoryRepository";
export { listMovements } from "../repositories/inventoryMovementRepository";
```

- [ ] **Step 5: `src/controllers/inventoryController.ts` + `src/routes/inventory.routes.ts`**

`GET /api/inventory` (requirePermission `inventory.view`) maps each row through `computeStatus` before responding, so the frontend never recomputes business logic. `GET /api/inventory/:productId/movements?variantId=` (requirePermission `inventory.view`) returns kardex history. Wire per Phase 1's controller/route pattern.

- [ ] **Step 6: Mount in `app.ts`, run tests, commit**

```typescript
import inventoryRoutes from "./routes/inventory.routes";
app.use("/api/inventory", inventoryRoutes);
```

Run: `npx vitest run tests/inventory.test.ts` → Expected: PASS.

```bash
git add BellaBack/src BellaBack/tests/inventory.test.ts
git commit -m "feat(backend): central inventory movement service, inventory query + kardex endpoints"
```

---

### Task 6: Manual inventory adjustment endpoint (TDD)

**Files:**
- Create: `src/repositories/inventoryAdjustmentRepository.ts`
- Create: `src/services/inventoryAdjustmentService.ts`
- Modify: `src/controllers/inventoryController.ts`, `src/routes/inventory.routes.ts`, `src/validators/inventory.validators.ts`
- Test: `tests/inventoryAdjustments.test.ts`

**Interfaces:**
- Consumes: `inventoryService.applyMovement` (Task 5).
- Produces: `POST /api/inventory/adjust` (body `{ productId, variantId?, branchId, quantity, reason }`, signed quantity) gated by `requirePermission("inventory.adjust")`. Calls `applyMovement` with `type: "ADJUSTMENT"`, then creates the linked `InventoryAdjustment` row (reason + `authorizedBy: req.user.id`) referencing the movement id, all in one transaction. Also calls `logAudit` (`module: "inventory"`, `action: "inventory.adjust"`, `details: { productId, quantity, reason }`).

- [ ] **Step 1: Write failing tests** — cover: adjustment with a reason succeeds and both the movement and the adjustment row exist; adjustment without a `reason` is rejected with 400 (Zod); a 403 test for a role without `inventory.adjust`; an adjustment that would take stock negative returns 400 (propagated from `applyMovement`) and creates NEITHER a movement NOR an adjustment row (verify both).

- [ ] **Step 2: `src/validators/inventory.validators.ts`** (add to the file created in Task 5)

```typescript
export const adjustInventorySchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  branchId: z.string().uuid(),
  quantity: z.coerce.number().int().refine((n) => n !== 0, "La cantidad no puede ser cero"),
  reason: z.string().min(3),
});
```

- [ ] **Step 3: `src/services/inventoryAdjustmentService.ts`**

```typescript
import { prisma } from "../config/prisma";
import { applyMovement } from "./inventoryService";
import { logAudit } from "./auditService";

export async function adjustInventory(input: { productId: string; variantId?: string; branchId: string; quantity: number; reason: string }, actorId: string) {
  const movement = await applyMovement({
    productId: input.productId,
    variantId: input.variantId,
    branchId: input.branchId,
    type: "ADJUSTMENT",
    quantity: input.quantity,
    userId: actorId,
  });

  await prisma.inventoryAdjustment.create({
    data: { movementId: movement.id, reason: input.reason, authorizedBy: actorId },
  });

  await logAudit({
    userId: actorId,
    action: "inventory.adjust",
    module: "inventory",
    entityType: "product",
    entityId: input.productId,
    branchId: input.branchId,
    details: { quantity: input.quantity, reason: input.reason },
  });

  return movement;
}
```

- [ ] **Step 4: Wire the controller/route, run tests, commit**

```typescript
router.post("/adjust", requireAuth, requirePermission("inventory.adjust"), inventoryController.adjust);
```

Run: `npx vitest run tests/inventoryAdjustments.test.ts` → Expected: PASS.

```bash
git add BellaBack/src BellaBack/tests/inventoryAdjustments.test.ts
git commit -m "feat(backend): manual inventory adjustments with reason and audit trail"
```

---

### Task 7: Final backend wiring — full suite regression + smoke test extension

**Files:**
- Modify: `tests/smoke.test.ts` (extend, don't replace)

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Extend the smoke test** to also: create a category+brand, create a product with a variant, upload an image (use the same tiny-JPEG-buffer technique as Task 3), adjust its stock, list `/api/inventory` and confirm the new stock appears, fetch its kardex and confirm one movement exists.

- [ ] **Step 2: Run the full suite twice**

Run: `npx vitest run` (twice, to catch any test-isolation issue the same way Phase 1's finishing step did) → Expected: all files pass both times.

- [ ] **Step 3: Commit**

```bash
git add BellaBack/tests/smoke.test.ts
git commit -m "test(backend): extend smoke test to cover catalog and inventory flow"
```

---

## Frontend Tasks

### Task 8: Types + services for catalog/inventory

**Files:**
- Modify: `src/types/api.ts`
- Create: `src/services/categoryService.ts`, `src/services/brandService.ts`, `src/services/productService.ts`, `src/services/inventoryService.ts`

**Interfaces:**
- Consumes: `apiFetch` (Phase 1).
- Produces: TS types mirroring every backend DTO from Tasks 1-6 exactly (field names must match — this is the contract every page in Tasks 9-13 relies on). `listCategories/createCategory/updateCategory/updateCategoryStatus`, same shape for brands. `listProducts(filters)/getProduct(id)/createProduct/updateProduct/updateProductStatus`, `uploadProductImage(productId, file)/deleteProductImage/setPrimaryImage`. `listInventory(filters)/adjustInventory(input)/getMovements(productId, variantId?)`.

- [ ] **Step 1: Add types to `src/types/api.ts`**

```typescript
export interface Category { id: string; name: string; status: "ACTIVE" | "INACTIVE"; }
export interface Brand { id: string; name: string; status: "ACTIVE" | "INACTIVE"; }

export interface ProductImage { id: string; url: string; isPrimary: boolean; sortOrder: number; }

export interface ProductVariant {
  id: string; productId: string; name: string; sku: string; barcode?: string | null;
  imageUrl?: string | null; price?: string | null; minStock: number; maxStock?: number | null; status: "ACTIVE" | "INACTIVE";
}

export interface Product {
  id: string; sku: string; barcode?: string | null; name: string; description?: string | null;
  categoryId?: string | null; brandId?: string | null; category?: Category | null; brand?: Brand | null;
  cost: string; price: string; promoPrice?: string | null; taxRate: string;
  minStock: number; maxStock?: number | null; status: "ACTIVE" | "INACTIVE";
  images: ProductImage[]; variants: ProductVariant[];
  inventory?: Array<{ id: string; branchId: string; branch: { id: string; name: string }; stock: number; variantId?: string | null }>;
}

export interface InventoryItem {
  id: string; productId: string; variantId?: string | null; branchId: string;
  stock: number; status: "AVAILABLE" | "LOW" | "CRITICAL" | "OUT";
  product: Pick<Product, "id" | "name" | "sku" | "minStock">;
  variant?: Pick<ProductVariant, "id" | "name" | "sku" | "minStock"> | null;
  branch: { id: string; name: string };
}

export interface InventoryMovement {
  id: string; type: string; quantity: number; stockBefore: number; stockAfter: number;
  reference?: string | null; createdAt: string;
  branch: { id: string; name: string }; user?: { id: string; displayName: string } | null;
}
```

Note: `Decimal` fields (`cost`, `price`, `promoPrice`, `taxRate`, variant `price`) serialize as JSON strings over the wire from Prisma's `Decimal` type — type them as `string` on the frontend and `Number(...)`/format at render time, don't type them as `number`.

- [ ] **Step 2: Implement each service file** — one `apiFetch` call per backend endpoint from Tasks 2-6, following the exact pattern of Phase 1's `src/services/branchService.ts`/`userService.ts`. For `uploadProductImage`, use `FormData` and do NOT set a `Content-Type` header manually (let the browser set the multipart boundary) — `apiClient.ts`'s `apiFetch` currently always sets `"Content-Type": "application/json"`; you'll need a small variant or an options override that omits it for this one call. Check `apiClient.ts` first and adapt minimally (e.g. allow `options.headers` to override/omit rather than always spreading json on top) — don't break any existing caller.

- [ ] **Step 3: Verify, commit**

Run: `npx tsc -p tsconfig.app.json --noEmit` → Expected: no new errors (existing missing-page errors for Tasks 9-13's not-yet-built pages are expected and fine).

```bash
git add BellaFront/src/types/api.ts BellaFront/src/services
git commit -m "feat(frontend): catalog/inventory types and API services"
```

---

### Task 9: Shared `ImageUploader` component

**Files:**
- Create: `src/components/common/ImageUploader.tsx`, `ImageUploader.css`

**Interfaces:**
- Consumes: nothing new (pure UI component).
- Produces: `<ImageUploader images={ProductImage[]} onUpload={(file: File) => Promise<void>} onDelete={(imageId: string) => Promise<void>} onSetPrimary={(imageId: string) => Promise<void>} uploading={boolean} />` — reused by Task 10's product form.

- [ ] **Step 1: Implement** a drag-and-drop + click-to-browse image uploader: a dashed-border drop zone (design-token colors/radius, not default browser styling), a grid of already-uploaded image thumbnails below it with a "principal" (primary) badge on the primary image, a button on each thumbnail to set it primary or delete it (lucide `Star`/`Trash2` icons), and a loading state on the drop zone while `uploading` is true. Validate file type/size client-side before calling `onUpload` (jpeg/png/webp, max 5MB) and show an inline error message if rejected — don't rely solely on the backend's rejection.

- [ ] **Step 2: Verify, commit**

Run: `npx tsc -p tsconfig.app.json --noEmit` → Expected: no new errors.

```bash
git add BellaFront/src/components/common/ImageUploader.tsx BellaFront/src/components/common/ImageUploader.css
git commit -m "feat(frontend): shared drag-and-drop ImageUploader component"
```

---

### Task 10: Products page (list + create/edit modal with variants + images)

**Files:**
- Create: `src/pages/products/ProductsPage.tsx`, `ProductFormModal.tsx`, `ProductsPage.css`
- Modify: `src/components/layout/Sidebar.tsx`, `src/app/router.tsx`

**Interfaces:**
- Consumes: `productService`, `categoryService`, `brandService` (Task 8), `ImageUploader` (Task 9), `Modal`/`Badge`/`StatusState`/`PermissionGate` (Phase 1).
- Produces: `/productos` route, gated `requirePermission="products.view"` via `PermissionRoute` (Phase 1 pattern), with `products.create`/`products.edit` gating the relevant buttons.

- [ ] **Step 1: `ProductFormModal.tsx`** — a form for create/edit covering: SKU, barcode, name, description, category select, brand select, cost, price, promo price, tax rate, min/max stock, status. A repeatable "variants" section (add/remove rows: name, SKU, price override, min/max stock) — client-side array state, submitted as the `variants` array on create (per Task 4's nested-create contract); on edit, variants are managed as a simpler read-only list for this phase (full variant editing after creation can be a fast-follow — don't over-scope this task, creating a product with variants is the priority). Embed `<ImageUploader>` — but only enabled once the product has been saved once (you need a `productId` to attach images to) — for a NEW product, save first (or disable the image section with a hint "Guarda el producto primero para agregar imágenes"), then let the uploader work against the real `productId`. Apply the same `key={editingProduct?.id ?? "new"}` remount-on-target-change pattern established in Phase 1 to avoid the stale-form bug.

- [ ] **Step 2: `ProductsPage.tsx`** — grid or table view of products (use your judgment on which reads better for products with thumbnail images — a card grid showing the primary image, name, SKU, category/brand chips, price, and a stock-status badge aggregated across branches is likely more appropriate than a dense table, given these are visual retail products). Filters: category, brand, status, search input (debounced). Loading/empty/error states. "Nuevo producto" gated by `PermissionGate code="products.create"`.

- [ ] **Step 3: Wire into `Sidebar.tsx` and `router.tsx`**

Add a "Productos" link (lucide `Package` or `ShoppingBag` icon) gated by `PermissionGate code="products.view"`, and the route:
```tsx
{ path: "/productos", element: <PermissionRoute code="products.view" /> , children: [{ index: true, element: <ProductsPage /> }] }
```
(match whatever exact nesting pattern Phase 1's `PermissionRoute` usage already established for `/usuarios` etc. — don't invent a different structure.)

- [ ] **Step 4: Verify, commit**

Run: `npx tsc -p tsconfig.app.json --noEmit` → Expected: no new errors.

```bash
git add BellaFront/src/pages/products BellaFront/src/components/layout/Sidebar.tsx BellaFront/src/app/router.tsx
git commit -m "feat(frontend): products page with variant and image management"
```

---

### Task 11: Inventory page (stock table, filters, status badges)

**Files:**
- Create: `src/pages/inventory/InventoryPage.tsx`, `InventoryPage.css`
- Modify: `src/components/layout/Sidebar.tsx`, `src/app/router.tsx`

**Interfaces:**
- Consumes: `inventoryService.listInventory`, `branchService.listBranches`, `categoryService.listCategories` (Task 8/Phase 1).
- Produces: `/inventario` route, gated `requirePermission="inventory.view"`.

- [ ] **Step 1: Implement** a filterable table: product image thumbnail, name + SKU (+ variant name if applicable), branch, stock quantity, status badge (`AVAILABLE`→verde/success tone, `LOW`→amarillo/neutral-warning, `CRITICAL`/`OUT`→danger tone — reuse `Badge`'s existing `tone` prop, extend with a 4th tone if needed, following the token-based approach already established). Filters: branch, category, status. Loading/empty/error states. A row action opens `KardexModal` (Task 12) and, if the user has `inventory.adjust`, an "Ajustar" action opens `AdjustmentModal` (Task 13).

- [ ] **Step 2: Wire into `Sidebar.tsx` and `router.tsx`** — same pattern as Task 10, lucide `Boxes` or `Warehouse` icon.

- [ ] **Step 3: Verify, commit**

```bash
git add BellaFront/src/pages/inventory/InventoryPage.tsx BellaFront/src/pages/inventory/InventoryPage.css BellaFront/src/components/layout/Sidebar.tsx BellaFront/src/app/router.tsx
git commit -m "feat(frontend): inventory page with branch/category/status filters"
```

---

### Task 12: Kardex modal (movement history)

**Files:**
- Create: `src/pages/inventory/KardexModal.tsx`

**Interfaces:**
- Consumes: `inventoryService.getMovements`, `Modal` (Phase 1).
- Produces: a modal opened from `InventoryPage`, showing a chronological list of movements for one product(+variant): date, type (translate `MovementType` codes to Spanish labels — reuse the `ACTION_LABELS`-style lookup-map pattern from Phase 1's audit page), quantity (signed, colored green/red), stock before→after, actor, reference.

- [ ] **Step 1: Implement.** Loading/empty ("Sin movimientos registrados")/error states.

- [ ] **Step 2: Wire into `InventoryPage.tsx`, verify, commit**

```bash
git add BellaFront/src/pages/inventory/KardexModal.tsx BellaFront/src/pages/inventory/InventoryPage.tsx
git commit -m "feat(frontend): kardex modal showing inventory movement history"
```

---

### Task 13: Adjustment modal (manual stock adjustment)

**Files:**
- Create: `src/pages/inventory/AdjustmentModal.tsx`

**Interfaces:**
- Consumes: `inventoryService.adjustInventory`, `Modal` (Phase 1).
- Produces: a modal opened from `InventoryPage` (gated by `PermissionGate code="inventory.adjust"`) with a form: quantity (signed number input, with clear +/- guidance in the label, e.g. "Cantidad (positivo para entrada, negativo para salida)"), reason (required textarea, min 3 chars matching the backend's Zod rule). On submit, calls `adjustInventory`, shows the backend's error message on failure (e.g. the "dejaría el inventario en negativo" case from Task 6), shows a success confirmation and refreshes the inventory list on success.

- [ ] **Step 1: Implement** with proper try/catch/error-display (the recurring defect class from Phase 1's reviews — don't repeat it).

- [ ] **Step 2: Wire into `InventoryPage.tsx`, verify, commit**

```bash
git add BellaFront/src/pages/inventory/AdjustmentModal.tsx BellaFront/src/pages/inventory/InventoryPage.tsx
git commit -m "feat(frontend): manual inventory adjustment modal"
```

---

### Task 14: Final integration pass

**Files:** none new — verification only.

- [ ] **Step 1:** Boot the full stack fresh (docker, backend, frontend), re-seed.
- [ ] **Step 2:** Run the full backend suite twice: `cd BellaBack && npx vitest run` (×2) → all green both times.
- [ ] **Step 3:** `npx tsc -p BellaFront/tsconfig.app.json --noEmit` → zero errors.
- [ ] **Step 4:** If a browser automation tool is available (Playwright was installed during Phase 1's QA pass — check `BellaFront/package.json`), drive: create a category/brand, create a product with 2 variants, upload an image and confirm it renders, set it primary, view `/inventario` and confirm the seeded stock appears with correct status badges, open the kardex for a product and confirm entries, perform a manual adjustment and confirm the stock/kardex update and a success message shows, attempt an adjustment that would go negative and confirm a clean error message (not a crash). Screenshot each major step to `BellaFront/.qa-screenshots-inventario/`.
- [ ] **Step 5:** Fix anything broken; re-verify; commit fixes if any.
