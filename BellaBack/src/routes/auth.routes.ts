import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Reuses the same express-rate-limit dependency and option shape as app.ts's
// existing loginLimiter, but is declared HERE rather than in app.ts for one
// reason: it is keyed on the acting user's id, and `req.user` only exists
// after requireAuth has run. app.ts's `app.use("/api/auth/login", ...)` style
// mounts a limiter ahead of the route's own middleware chain, which would
// leave nothing to key on but the IP — and an IP key is the wrong unit here,
// since every terminal in a store shares one public IP and a single cashier
// brute-forcing would lock out the whole branch.
//
// Strict by design: a 4-digit PIN has only 10,000 combinations, so an
// unthrottled endpoint is trivially brute-forced. 5 attempts per 15 minutes
// per acting user makes an exhaustive search take years while still leaving
// room for a supervisor to fat-finger a couple of times.
//
// skipSuccessfulRequests: successful authorizations do NOT consume the
// budget. A busy cashier legitimately co-signing many returns on a Saturday
// must not get locked out, whereas an attacker's attempts are by definition
// all failures — so counting only failures is both friendlier and strictly
// more targeted at the actual threat.
const verifyPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  // Custom handler so a throttled request returns the same { ok: false, error }
  // envelope as every other verify-pin failure instead of express-rate-limit's
  // default plain-text body, which the calling module would fail to parse.
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
// requireAuth first (the limiter keys on req.user.id), limiter second.
router.post("/verify-pin", requireAuth, verifyPinLimiter, authController.verifyPin);

export default router;
