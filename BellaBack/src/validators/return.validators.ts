import { z } from "zod";

// Same recurring bug class documented in transfer.validators.ts,
// purchase.validators.ts and every other validator file: Zod's strict
// `.uuid()` rejects the deterministic seed ids
// ("00000000-...-000000000001"), which are valid UUID-shaped strings but
// fail the RFC version/variant check. Every id below can reference a seeded
// fixture (branchId directly, and productId/variantId via a seeded catalog),
// so they all use this shape-only regex. Never use `.uuid()` for a field
// that can hold a seeded id.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

const returnedItemSchema = z.object({
  saleItemId: uuidShape,
  quantity: z.number().int().positive(),
  // Required, not defaulted: whether the merchandise is sellable again is a
  // decision someone has to make while holding it, and silently defaulting
  // it either way would be wrong. Defaulting to true would quietly put
  // damaged goods back on the shelf; defaulting to false would quietly
  // shrink inventory on every normal return.
  restock: z.boolean(),
});

const newItemSchema = z.object({
  productId: uuidShape,
  variantId: uuidShape.optional(),
  quantity: z.number().int().positive(),
});

export const processReturnSchema = z.object({
  originalSaleId: uuidShape,
  returnedItems: z.array(returnedItemSchema).min(1, "La devolución debe incluir al menos un artículo devuelto"),
  // Empty/absent = a pure refund, which is the most common case.
  newItems: z.array(newItemSchema).default([]),
  // NOTE the deliberate asymmetry with pin.validators.ts's setPinSchema, and
  // the deliberate symmetry with its verifyPinSchema: `pinCode` is an
  // unconstrained non-empty string ON PURPOSE. Applying PIN_REGEX here would
  // make a malformed PIN fail with Zod's 400 "Datos inválidos" while a
  // well-formed but wrong PIN fails with the generic 401 — and that
  // difference alone tells an attacker their input at least reached the
  // comparison stage. verifySupervisorPin applies the regex internally and
  // funnels the malformed case into the exact same generic 401 as every
  // other failure mode.
  pinCode: z.string().min(1),
  // Only stored when the computed resolution is CUSTOMER_OWES; the service
  // requires it in that case and discards it otherwise. Reuses the same four
  // values as the PaymentMethod enum shared with Sale/SalePayment.
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  notes: z.string().trim().min(1).optional(),
});

export const listReturnsQuerySchema = z.object({
  branchId: uuidShape.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
