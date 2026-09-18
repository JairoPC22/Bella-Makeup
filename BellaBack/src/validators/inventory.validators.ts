import { z } from "zod";

export const listInventoryQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["AVAILABLE", "LOW", "CRITICAL", "OUT"]).optional(),
});

export const listMovementsQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
});
