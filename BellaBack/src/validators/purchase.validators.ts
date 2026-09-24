import { z } from "zod";
import { uuidShape } from "./common.validators";

const purchaseItemSchema = z.object({
  productId: uuidShape,
  variantId: uuidShape.optional(),
  expectedQuantity: z.number().int().positive(),
  // No negativo en vez de positivo: una línea de costo cero es legítima
  // (unidades promocionales, muestras gratis enviadas con un pedido,
  // reemplazos de garantía) y el negocio necesita registrarlas en libros y
  // en stock.
  unitCost: z.number().nonnegative(),
});

export const createPurchaseSchema = z.object({
  supplierId: uuidShape,
  branchId: uuidShape,
  reference: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  items: z.array(purchaseItemSchema).min(1, "La compra debe tener al menos un artículo"),
});

export const receivePurchaseSchema = z.object({
  items: z
    .array(
      z.object({
        purchaseItemId: uuidShape,
        // Cero es válido y significativo: "esta línea se revisó y no llegó
        // nada". Sin límite superior: una sobre-entrega se registra como
        // discrepancia, no se rechaza (ver receivePurchase).
        receivedQuantity: z.number().int().nonnegative(),
      })
    )
    // Un arreglo vacío está permitido: es la forma legítima de cerrar una
    // entrega donde el camión llegó sin ninguna de las líneas pedidas, que
    // el servicio registra como cada línea recibida en 0 y
    // RECEIVED_WITH_DISCREPANCIES.
    .default([]),
});

export const cancelPurchaseSchema = z.object({
  reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres"),
});

export const listPurchasesQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(["PENDING", "COMPLETED", "RECEIVED_WITH_DISCREPANCIES", "CANCELLED"]).optional(),
  supplierId: uuidShape.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ---------- Suppliers ----------

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1),
  contactName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(1).optional(),
  contactName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const listSuppliersQuerySchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
