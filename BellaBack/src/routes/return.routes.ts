import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { createPinAttemptLimiter } from "../middleware/pinAttemptLimiter";
import * as returnController from "../controllers/returnController";

const router = Router();

router.get("/", requireAuth, requirePermission("returns.view"), returnController.list);
router.get("/:id", requireAuth, requirePermission("returns.view"), returnController.getById);
// `returns.create` is the CASHIER's own gate — permission to initiate the
// flow. It is NOT what authorizes the operation: the supervisor's
// `returns.authorize` is checked separately by verifySupervisorPin against
// whoever's PIN was typed, inside the service. A cashier holding
// returns.create can start a return and complete nothing without a second
// person present.
//
// requireAuth first (the limiter keys on req.user.id), then the permission
// gate, then the PIN attempt limiter — so a caller who lacks the permission
// is rejected without ever consuming PIN-attempt budget.
router.post(
  "/",
  requireAuth,
  requirePermission("returns.create"),
  createPinAttemptLimiter(),
  returnController.create
);

export default router;
