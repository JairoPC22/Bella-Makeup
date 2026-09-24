import { z } from "zod";
import { uuidShape } from "./common.validators";

const variantSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  price: z.coerce.number().positive().optional(),
  minStock: z.coerce.number().int().min(0).default(0),
  maxStock: z.coerce.number().int().min(0).optional(),
});

export const createProductSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: uuidShape.optional(),
  brandId: uuidShape.optional(),
  cost: z.coerce.number().min(0).default(0),
  price: z.coerce.number().positive(),
  promoPrice: z.coerce.number().positive().optional(),
  taxRate: z.coerce.number().min(0).default(0),
  minStock: z.coerce.number().int().min(0).default(0),
  maxStock: z.coerce.number().int().min(0).optional(),
  variants: z.array(variantSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const updateProductStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export const listProductsQuerySchema = z.object({
  categoryId: uuidShape.optional(),
  brandId: uuidShape.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  search: z.string().optional(),
});
