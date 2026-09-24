import { z } from "zod";
import { uuidShape } from "./common.validators";

// POST /api/public/orders no tiene autenticación: toda entrada se valida
// de forma defensiva en el servidor, sin confiar en la validación del frontend.
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

// `reason` solo es obligatorio al cancelar (ver el .refine). `pickupCode` se
// valida en forma aquí (6 dígitos); orderService.updateOrderStatus lo compara.
export const updateOrderStatusSchema = z
  .object({
    status: z.enum(["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]),
    reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres").optional(),
    pickupCode: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos").optional(),
  })
  .refine((data) => data.status !== "CANCELLED" || Boolean(data.reason), {
    message: "Se requiere un motivo para cancelar el pedido",
    path: ["reason"],
  });

// `null` borra el ETA previo; omitir el campo es un error de validación.
export const setOrderEtaSchema = z.object({
  estimatedReadyAt: z.coerce.date().nullable(),
});
