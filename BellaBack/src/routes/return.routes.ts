import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { createPinAttemptLimiter } from "../middleware/pinAttemptLimiter";
import * as returnController from "../controllers/returnController";

const router = Router();

router.get("/", requireAuth, requirePermission("returns.view"), returnController.list);
router.get("/:id", requireAuth, requirePermission("returns.view"), returnController.getById);
// `returns.create` solo inicia el flujo; `returns.authorize` (vía PIN de supervisor)
// autoriza la operación. El orden requireAuth → permiso → limiter evita gastar
// intentos de PIN en llamadas que ni siquiera tienen el permiso.
router.post(
  "/",
  requireAuth,
  requirePermission("returns.create"),
  createPinAttemptLimiter(),
  returnController.create
);

export default router;
