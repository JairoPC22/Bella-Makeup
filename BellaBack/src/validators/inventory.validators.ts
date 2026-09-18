import { z } from "zod";

export const listInventoryQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["AVAILABLE", "LOW", "CRITICAL", "OUT"]).optional(),
});

export const listMovementsQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
});

export const adjustInventorySchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  branchId: z.string().uuid(),
  quantity: z.coerce.number().int().refine((n) => n !== 0, "La cantidad no puede ser cero"),
  reason: z.string().min(3),
});
