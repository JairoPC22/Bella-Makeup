import { z } from "zod";
import { uuidShape } from "./common.validators";

const transferItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
});

export const createTransferSchema = z
  .object({
    sourceBranchId: uuidShape,
    destinationBranchId: uuidShape,
    notes: z.string().trim().min(1).optional(),
    items: z.array(transferItemSchema).min(1, "La transferencia debe tener al menos un artículo"),
  })
  .refine((data) => data.sourceBranchId !== data.destinationBranchId, {
    message: "La sucursal de origen y destino no pueden ser la misma",
    path: ["destinationBranchId"],
  });

export const cancelTransferSchema = z.object({
  reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres"),
});

export const listTransfersQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(["PENDING", "IN_TRANSIT", "COMPLETED", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
