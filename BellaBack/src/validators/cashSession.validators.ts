import { z } from "zod";
import { uuidShape } from "./common.validators";

export const openCashSessionSchema = z.object({
  branchId: uuidShape,
  // Un valor de exactamente 0 es legítimo (un cajón que en verdad arranca
  // vacío); uno negativo nunca lo es.
  openingFloat: z.number().min(0, "El fondo de apertura no puede ser negativo"),
});

// El conteo físico, línea por línea. Es un campo tecleado a mano en la
// pantalla del POS al final de un turno largo, así que se valida
// estrictamente: una denominación debe ser un monto positivo (no hay
// billetes de $0 o negativos), y un conteo debe ser un entero no negativo
// de piezas físicas (no se pueden contar 2.5 o -1 billetes de veinte). El
// servicio revalida ambas cosas de forma independiente, para que la regla
// se cumpla también para un llamador que no sea HTTP.
const cashBreakdownLineSchema = z.object({
  denomination: z.number().positive("La denominación debe ser mayor a cero"),
  count: z.number().int("El conteo debe ser un número entero").min(0, "El conteo no puede ser negativo"),
});

export const closeCashSessionSchema = z.object({
  cashBreakdown: z.array(cashBreakdownLineSchema).min(1, "El conteo de efectivo debe tener al menos una línea"),
  cardTotal: z.number().min(0, "El total de tarjeta no puede ser negativo"),
});

export const currentCashSessionQuerySchema = z.object({
  branchId: uuidShape,
});

export const listCashSessionsQuerySchema = z.object({
  branchId: uuidShape.optional(),
  status: z.enum(["OPEN", "CLOSED", "CLOSED_WITH_DISCREPANCY"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
