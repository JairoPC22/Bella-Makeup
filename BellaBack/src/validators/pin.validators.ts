import { z } from "zod";
import { PIN_REGEX } from "../services/pinAuthService";

// Se importa PIN_REGEX del servicio (no se redeclara) para que ambas validaciones no diverjan.

export const setPinSchema = z.object({
  pin: z.string().regex(PIN_REGEX, "El PIN debe tener entre 4 y 6 dígitos numéricos."),
  // Reingresar la contraseña es la salvaguarda para crear una segunda credencial.
  currentPassword: z.string().min(1),
});

// A propósito `pin` no tiene regex aquí: si fallara con 400 vs 401 genérico,
// se filtraría información al atacante. verifySupervisorPin valida el formato
// internamente y siempre responde con el mismo 401 genérico.
export const verifyPinSchema = z.object({
  pin: z.string(),
  requiredPermission: z.string().min(1),
});
