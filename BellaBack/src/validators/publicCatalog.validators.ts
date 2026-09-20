import { z } from "zod";

// Same recurring bug class documented in every other validator file: Zod's
// strict `.uuid()` rejects the deterministic seed ids
// ("00000000-...-000000000001") used by seeded branches/categories, which
// are valid UUID-shaped strings but fail the RFC version/variant check.
// Every id accepted from the public surface (categoryId, product :id
// param, branchId) can reference those seeded fixtures, so this
// shape-only regex is used everywhere on this unauthenticated surface
// instead of `.uuid()`.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

// This endpoint has zero auth — anyone can hit it with an arbitrarily large
// `page`, so it's bounded (not just coerced) to keep a malicious/careless
// caller from forcing a huge OFFSET scan.
export const listPublicProductsQuerySchema = z.object({
  categoryId: uuidShape.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().max(10000).optional(),
});

export const publicIdParamSchema = z.object({
  id: uuidShape,
});
