import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { createPinAttemptLimiter } from "../middleware/pinAttemptLimiter";
import * as mermaController from "../controllers/mermaController";

const router = Router();

router.get("/", requireAuth, requirePermission("shrinkage.view"), mermaController.list);
router.get("/:id", requireAuth, requirePermission("shrinkage.view"), mermaController.getById);
// Same split as return.routes.ts: `shrinkage.create` lets staff REQUEST a
// write-off; `shrinkage.authorize` (checked by verifySupervisorPin against
// the PIN holder, never against the requester) is what approves it.
router.post(
  "/",
  requireAuth,
  requirePermission("shrinkage.create"),
  createPinAttemptLimiter(),
  mermaController.create
);

export default router;
