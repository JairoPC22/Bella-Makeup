import { z } from "zod";
import { uuidShape } from "./common.validators";

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
  // Opcional: solo se exige cuando algún descuento excede el umbral que el
  // cajero puede autorizar por sí mismo. Sin restricciones de formato a
  // propósito, ver la misma nota en return.validators.ts / merma.validators.ts.
  pinCode: z.string().min(1).optional(),
});

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres"),
  // Solo se exige cuando quien cancela no tiene sales.cancel y
  // CompanySettings.allowPinForSaleCancel está activo.
  pinCode: z.string().min(1).optional(),
});

export const listSalesQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(["COMPLETED", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
