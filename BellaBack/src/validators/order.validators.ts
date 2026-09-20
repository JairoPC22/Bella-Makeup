import { z } from "zod";

// Same recurring bug class documented in sale.validators.ts/transfer.validators.ts:
// Zod's strict `.uuid()` rejects the deterministic seed ids
// ("00000000-...-000000000001") used by seeded branches, which are valid
// UUID-shaped strings but fail the RFC version/variant check. branchId can
// reference those seeded fixtures, so it uses this shape-only regex.
// productId/variantId/orderId stay on the strict `.uuid()` below since
// products/variants/orders always get Prisma's real v4 `uuid()` default,
// never one of these fixture ids.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

// POST /api/public/orders has zero auth — every field here is validated
// defensively (never trust an unauthenticated public endpoint's input),
// even though the frontend already validates its own form: absurd
// quantities, unknown branch ids, empty item arrays, and out-of-range
// coordinates are all rejected server-side regardless of what the client
// sent.
const onlineOrderItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive().max(999, "Cantidad no válida"),
});

const pickupFulfillmentSchema = z.object({
  type: z.literal("PICKUP"),
  branchId: uuidShape,
});

const deliveryFulfillmentSchema = z.object({
  type: z.literal("DELIVERY"),
  branchId: uuidShape,
  address: z.string().trim().min(3, "La dirección es requerida").max(500),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const onlineOrderFulfillmentSchema = z.discriminatedUnion("type", [pickupFulfillmentSchema, deliveryFulfillmentSchema]);

const onlineOrderCustomerSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es requerido").max(100),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(7, "Teléfono inválido").max(20),
  email: z.string().trim().email().optional(),
});

export const createOnlineOrderSchema = z.object({
  customer: onlineOrderCustomerSchema,
  fulfillment: onlineOrderFulfillmentSchema,
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]),
  items: z.array(onlineOrderItemSchema).min(1, "El pedido debe tener al menos un artículo").max(50),
  notes: z.string().trim().max(500).optional(),
});

export const trackOnlineOrderQuerySchema = z.object({
  phone: z.string().trim().min(1, "Se requiere el teléfono"),
});

// ---------- Authenticated staff surface (/api/orders) ----------

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;

export const listOrdersQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// `reason` is only actually required when transitioning to CANCELLED
// (enforced by the .refine below) — every other transition ignores it.
export const updateOrderStatusSchema = z
  .object({
    status: z.enum(["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]),
    reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres").optional(),
  })
  .refine((data) => data.status !== "CANCELLED" || Boolean(data.reason), {
    message: "Se requiere un motivo para cancelar el pedido",
    path: ["reason"],
  });
