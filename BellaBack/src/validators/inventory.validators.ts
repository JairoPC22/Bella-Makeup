import { z } from "zod";

// Zod's built-in `.uuid()` only accepts RFC 4122 version 1-8 / variant 8-b
// UUIDs. The seeded demo branches and categories (prisma/seed.ts) use
// deterministic ids like "00000000-0000-0000-0000-000000000001" /
// "10000000-0000-0000-0000-000000000001" for readability/reproducibility in
// fixtures, which are valid UUID-shaped strings but fail that stricter
// check (their version/variant nibbles are "0"). Same bug already found and
// fixed the same way in user.validators.ts's `uuidShape` (there for
// assignBranchesSchema) and message.validators.ts — here it made the
// Inventory page's own branch/category filters 400 on exactly the two
// branches and two categories the demo data ships with. productId/variantId
// below are left on the strict `.uuid()` since products/variants always get
// Prisma's default `uuid()` (proper v4), never one of these fixture ids.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

export const listInventoryQuerySchema = z.object({
  branchId: uuidShape.optional(),
  categoryId: uuidShape.optional(),
  status: z.enum(["AVAILABLE", "LOW", "CRITICAL", "OUT"]).optional(),
});

export const listMovementsQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
});

export const adjustInventorySchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  branchId: uuidShape,
  quantity: z.coerce.number().int().refine((n) => n !== 0, "La cantidad no puede ser cero"),
  reason: z.string().min(3),
});
