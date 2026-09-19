import { z } from "zod";

// Zod's built-in `.uuid()` only accepts RFC 4122 version 1-8 / variant 8-b
// UUIDs. The seeded demo categories/brands (prisma/seed.ts) use
// deterministic ids like "10000000-0000-0000-0000-000000000001" /
// "20000000-0000-0000-0000-000000000001" for readability/reproducibility in
// fixtures, which are valid UUID-shaped strings but fail that stricter
// check (their version/variant nibbles are "0"). Same bug already found and
// fixed the same way in user.validators.ts, message.validators.ts and
// inventory.validators.ts — here it made filtering/creating products against
// the seeded category/brand 400. productId/variantId are left on the strict
// `.uuid()` since products/variants always get Prisma's default `uuid()`
// (proper v4), never one of these fixture ids.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

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
  categoryId: uuidShape.optional(),
  brandId: uuidShape.optional(),
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
  categoryId: uuidShape.optional(),
  brandId: uuidShape.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  search: z.string().optional(),
});
