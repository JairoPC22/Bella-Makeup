import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as branchController from "../controllers/branchController";

const router = Router();
router.get("/", requireAuth, requirePermission("branches.view"), branchController.list);
router.post("/", requireAuth, requirePermission("branches.manage"), branchController.create);
router.put("/:id", requireAuth, requirePermission("branches.manage"), branchController.update);
router.patch("/:id/status", requireAuth, requirePermission("branches.manage"), branchController.updateStatus);
export default router;
