import { z } from "zod";

// Same recurring bug class documented in inventory/product/user/message
// validators: Zod's strict `.uuid()` rejects the deterministic seed ids
// ("00000000-...-000000000001") used by seeded branches/categories/brands,
// which are valid UUID-shaped strings but fail the RFC version/variant
// check. branchId/customerId can reference those seeded fixtures, so they
// use this shape-only regex. productId/variantId/saleId stay on the strict
// `.uuid()` below since products, variants, and sales always get Prisma's
// real v4 `uuid()` default, never one of these fixture ids.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  discount: z.number().min(0).optional(),
});

const salePaymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
  amount: z.number().positive(),
  reference: z.string().trim().min(1).optional(),
});

export const createSaleSchema = z.object({
  branchId: uuidShape,
  customerId: uuidShape.optional(),
  items: z.array(saleItemSchema).min(1, "La venta debe tener al menos un artículo"),
  payments: z.array(salePaymentSchema).min(1, "La venta debe tener al menos un pago"),
});

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres"),
});

export const listSalesQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(["COMPLETED", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
