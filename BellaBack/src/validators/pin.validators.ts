import { z } from "zod";
import { PIN_REGEX } from "../services/pinAuthService";

// PIN_REGEX is imported from the service rather than redeclared so the
// API-boundary check and pinAuthService's own defensive check can never
// drift apart. The validator depends on the domain rule, not the reverse.

export const setPinSchema = z.object({
  pin: z.string().regex(PIN_REGEX, "El PIN debe tener entre 4 y 6 dígitos numéricos."),
  // Re-entering the login password is the safeguard for setting a second
  // credential — see pinAuthService.setOwnPin's rationale.
  currentPassword: z.string().min(1),
});

// NOTE the asymmetry with setPinSchema above: `pin` here is an unconstrained
// string ON PURPOSE. Applying PIN_REGEX at this layer would make a malformed
// PIN fail with Zod's 400 "Datos inválidos" while a well-formed but wrong PIN
// fails with the generic 401 — and that difference alone tells an attacker
// their input at least reached the comparison stage. verifySupervisorPin
// applies the regex internally and funnels the malformed case into the exact
// same generic 401 as every other failure.
export const verifyPinSchema = z.object({
  pin: z.string(),
  requiredPermission: z.string().min(1),
});
