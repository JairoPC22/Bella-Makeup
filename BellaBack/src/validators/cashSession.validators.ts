import { z } from "zod";

// Same recurring bug class documented in sale.validators.ts,
// transfer.validators.ts and every other validator file: Zod's strict
// `.uuid()` rejects the deterministic seed ids
// ("00000000-...-000000000001") used by seeded branches, which are valid
// UUID-shaped strings but fail the RFC version/variant check. branchId can
// reference those seeded fixtures, so it uses this shape-only regex.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

export const openCashSessionSchema = z.object({
  branchId: uuidShape,
  // A float of exactly 0 is legitimate (a drawer that genuinely starts
  // empty); a negative one never is.
  openingFloat: z.number().min(0, "El fondo de apertura no puede ser negativo"),
});

// The physical count, line by line. This is a hand-typed field on a POS
// screen at the end of a long shift, so it is validated hard: a
// denomination must be a positive amount of money (there is no $0 or
// negative bill), and a count must be a whole non-negative number of
// physical pieces (you cannot have counted 2.5 or -1 twenty-peso notes).
// The service re-checks both independently — see cashSessionService's own
// validation — so the rules hold even for a non-HTTP caller.
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
