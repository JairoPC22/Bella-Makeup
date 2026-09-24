import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { createPinAttemptLimiter } from "../middleware/pinAttemptLimiter";
import * as mermaController from "../controllers/mermaController";

const router = Router();

router.get("/", requireAuth, requirePermission("shrinkage.view"), mermaController.list);
router.get("/:id", requireAuth, requirePermission("shrinkage.view"), mermaController.getById);
// Igual que return.routes.ts: `shrinkage.create` solicita, `shrinkage.authorize` (vía PIN) aprueba.
router.post(
  "/",
  requireAuth,
  requirePermission("shrinkage.create"),
  createPinAttemptLimiter(),
  mermaController.create
);

export default router;
