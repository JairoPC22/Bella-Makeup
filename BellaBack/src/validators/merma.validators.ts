import { z } from "zod";

// Same `uuidShape` convention as every other validator in this project —
// never `.uuid()`, which rejects the deterministic seed ids. See
// return.validators.ts / transfer.validators.ts for the full note.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

// The boss's five categories, kept as literal Spanish business terms because
// that is exactly what staff will see on screen and say out loud.
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
  // Mandatory and non-trivial. An unexplained inventory decrement is exactly
  // the shape internal theft takes, so the explanation is a hard requirement
  // rather than a nicety — `.trim().min(3)` also rejects a whitespace-only
  // string, which would satisfy a naive min(1) while explaining nothing.
  comments: z.string().trim().min(3, "El comentario es obligatorio (mínimo 3 caracteres)"),
  items: z.array(mermaItemSchema).min(1, "La merma debe tener al menos un artículo"),
  // Unconstrained string on purpose — see the same note in
  // return.validators.ts: constraining it here would leak that a malformed
  // PIN never reached the comparison stage.
  pinCode: z.string().min(1),
});

export const listMermasQuerySchema = z.object({
  branchId: uuidShape.optional(),
  type: mermaTypeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
