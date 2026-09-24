import { z } from "zod";
import { uuidShape } from "./common.validators";

// El alcance de un conteo es exactamente uno de: una categoría, una marca, o
// una lista manual explícita de productos (también así se hace un conteo
// de toda la sucursal: pasando el id de cada producto activo). El servicio
// exige "exactamente uno"; este esquema solo acepta las tres formas.
export const createInventoryCountSchema = z.object({
  branchId: uuidShape,
  categoryId: uuidShape.optional(),
  brandId: uuidShape.optional(),
  productIds: z.array(uuidShape).optional(),
  notes: z.string().trim().min(1).optional(),
});

const countedLineSchema = z.object({
  itemId: uuidShape,
  // Piezas contadas físicamente — un entero no negativo, mismo razonamiento
  // que los conteos de denominación en cashSession: no se pueden contar 2.5
  // unidades.
  countedStock: z.number().int("El conteo debe ser un número entero").min(0, "El conteo no puede ser negativo"),
});

export const saveCountedItemsSchema = z.object({
  items: z.array(countedLineSchema).min(1, "Debes enviar al menos una línea contada"),
});

export const listInventoryCountsQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
});
