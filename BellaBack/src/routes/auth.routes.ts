import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Se declara aquí (no en app.ts) porque se identifica por req.user.id, que
// solo existe después de requireAuth. Limita a 5 intentos fallidos cada 15
// minutos por usuario, para evitar fuerza bruta sobre el PIN de 4 dígitos.
const verifyPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  // Mismo formato { ok, error } que las demás fallas de verify-pin, no el texto plano por defecto.
  handler: (_req, res) =>
    res.status(429).json({
      ok: false,
      error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
    }),
});

router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", requireAuth, authController.logout);
router.get("/me", requireAuth, authController.me);
// requireAuth primero (el limiter necesita req.user.id), luego el limiter.
router.post("/verify-pin", requireAuth, verifyPinLimiter, authController.verifyPin);

export default router;
