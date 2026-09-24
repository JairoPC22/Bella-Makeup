import { z } from "zod";
import { uuidShape } from "./common.validators";

const returnedItemSchema = z.object({
  saleItemId: uuidShape,
  quantity: z.number().int().positive(),
  // Obligatorio, sin default: si la mercancía puede reingresar a la venta es
  // una decisión que alguien debe tomar, no un valor asumido en silencio.
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
  // Vacío/ausente = reembolso puro, el caso más común.
  newItems: z.array(newItemSchema).default([]),
  // Opcional: solo se exige cuando CompanySettings.requirePinForReturns está
  // activo (ver returnService.processReturn). Sin regex a propósito (igual
  // que verifyPinSchema): así no se filtra si el PIN llegó a compararse.
  pinCode: z.string().min(1).optional(),
  // Solo se usa cuando la resolución es CUSTOMER_OWES; mismos valores que PaymentMethod.
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  notes: z.string().trim().min(1).optional(),
});

export const listReturnsQuerySchema = z.object({
  branchId: uuidShape.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
