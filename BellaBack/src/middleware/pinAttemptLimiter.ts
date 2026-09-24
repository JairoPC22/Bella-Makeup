import rateLimit from "express-rate-limit";
import { PIN_GENERIC_ERROR } from "../services/pinAuthService";

// Limita intentos fallidos de PIN (5 cada 15 min) para evitar fuerza bruta;
// se usa también en /returns y /mermas porque comparten verifySupervisorPin.
// Se identifica por usuario y no por IP porque una sucursal comparte una sola IP.
export function createPinAttemptLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.statusCode !== 401,
    keyGenerator: (req) => req.user?.id ?? "anonymous",
    // Mismo mensaje genérico que cualquier fallo de PIN, para no revelar que hubo bloqueo.
    handler: (_req, res) => res.status(429).json({ message: PIN_GENERIC_ERROR }),
  });
}
