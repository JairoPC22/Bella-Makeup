import { z } from "zod";
import { uuidShape } from "./common.validators";

// Este endpoint no tiene autenticación: cualquiera puede llamarlo con un
// `page` arbitrariamente grande, así que se acota (no solo se convierte)
// para evitar que un llamador malicioso o descuidado fuerce un OFFSET
// enorme.
export const listPublicProductsQuerySchema = z.object({
  categoryId: uuidShape.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().max(10000).optional(),
});

export const publicIdParamSchema = z.object({
  id: uuidShape,
});
