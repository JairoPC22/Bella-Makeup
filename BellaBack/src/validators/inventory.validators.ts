import { z } from "zod";
import { uuidShape } from "./common.validators";

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
  // Solo se exige cuando quien ajusta no tiene inventory.adjust y
  // CompanySettings.allowPinForInventoryAdjust está activo.
  pinCode: z.string().min(1).optional(),
});
