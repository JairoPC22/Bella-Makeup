import { z } from "zod";
import { uuidShape } from "./common.validators";

// Las cinco categorías definidas por el cliente, en español literal porque
// es exactamente lo que el personal verá en pantalla y dirá en voz alta.
export const mermaTypeSchema = z.enum([
  "TESTER_EXHIBICION",
  "DANO_EN_TIENDA",
  "CADUCIDAD_VENCIDO",
  "MUESTRA_REGALO_CLIENTE",
  "DEFECTO_PROVEEDOR",
]);

const mermaItemSchema = z.object({
  productId: uuidShape,
  variantId: uuidShape.optional(),
  quantity: z.number().int().positive(),
});

export const registerMermaSchema = z.object({
  branchId: uuidShape,
  type: mermaTypeSchema,
  // Obligatorio y no trivial. Un descuento de inventario sin explicación es
  // justo la forma que toma el robo interno, así que la explicación es un
  // requisito duro, no un detalle. `.trim().min(3)` también rechaza un
  // string de solo espacios, que pasaría un min(1) ingenuo sin explicar nada.
  comments: z.string().trim().min(3, "El comentario es obligatorio (mínimo 3 caracteres)"),
  items: z.array(mermaItemSchema).min(1, "La merma debe tener al menos un artículo"),
  // Opcional: solo se exige cuando CompanySettings.requirePinForShrinkage
  // está activo (ver mermaService.registerMerma). Sin restricciones de
  // formato a propósito — ver la misma nota en return.validators.ts.
  pinCode: z.string().min(1).optional(),
});

export const listMermasQuerySchema = z.object({
  branchId: uuidShape.optional(),
  type: mermaTypeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
