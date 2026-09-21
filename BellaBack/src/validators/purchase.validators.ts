import { z } from "zod";

// Same recurring bug class documented in transfer.validators.ts, user.validators.ts
// and every other validator file: Zod's strict `.uuid()` rejects the
// deterministic seed ids ("00000000-...-000000000001") used by the seeded
// branches, which are valid UUID-shaped strings but fail the RFC
// version/variant check. `branchId` routinely references those seeded
// fixtures, so it uses this shape-only regex. Never use `.uuid()` for a field
// that can hold a seeded id.
//
// supplierId/productId/variantId/purchaseItemId also use uuidShape here
// rather than `.uuid()`: unlike transfers (where products always carry
// Prisma's real v4 default), suppliers are brand-new master data that a
// future seed or an import script is very likely to give deterministic ids
// for, and there is no upside to the stricter check — Prisma still rejects
// any id that does not correspond to a real row.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

const purchaseItemSchema = z.object({
  productId: uuidShape,
  variantId: uuidShape.optional(),
  expectedQuantity: z.number().int().positive(),
  // Non-negative rather than positive: a zero-cost line is legitimate
  // (promotional units, free samples shipped with an order, warranty
  // replacements) and the business still needs them on the books and in stock.
  unitCost: z.number().nonnegative(),
});

export const createPurchaseSchema = z.object({
  supplierId: uuidShape,
  branchId: uuidShape,
  reference: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  items: z.array(purchaseItemSchema).min(1, "La compra debe tener al menos un artículo"),
});

export const receivePurchaseSchema = z.object({
  items: z
    .array(
      z.object({
        purchaseItemId: uuidShape,
        // Zero is valid and meaningful: "this line was checked and nothing
        // arrived". No upper bound — an over-delivery is recorded as a
        // discrepancy, not rejected (see receivePurchase).
        receivedQuantity: z.number().int().nonnegative(),
      })
    )
    // An empty array is allowed: it is the legitimate way to close out a
    // delivery where the truck arrived with none of the ordered lines, which
    // the service records as every line received 0 and
    // RECEIVED_WITH_DISCREPANCIES.
    .default([]),
});

export const cancelPurchaseSchema = z.object({
  reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres"),
});

export const listPurchasesQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(["PENDING", "COMPLETED", "RECEIVED_WITH_DISCREPANCIES", "CANCELLED"]).optional(),
  supplierId: uuidShape.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ---------- Suppliers ----------

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1),
  contactName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(1).optional(),
  contactName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const listSuppliersQuerySchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
