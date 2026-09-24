import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as branchController from "../controllers/branchController";

const router = Router();
router.get("/", requireAuth, requirePermission("branches.view"), branchController.list);
// Revenue is deliberately gated to branches.manage (admin-only in the
// seeded roles), not branches.view (which branch_manager also holds) — the
// client explicitly asked that earnings only be visible to the admin.
router.get("/revenue", requireAuth, requirePermission("branches.manage"), branchController.revenue);
router.post("/", requireAuth, requirePermission("branches.manage"), branchController.create);
router.put("/:id", requireAuth, requirePermission("branches.manage"), branchController.update);
router.patch("/:id/status", requireAuth, requirePermission("branches.manage"), branchController.updateStatus);
export default router;
