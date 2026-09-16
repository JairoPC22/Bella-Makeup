import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as userController from "../controllers/userController";

const router = Router();
router.get("/", requireAuth, requirePermission("users.view"), userController.list);
router.post("/", requireAuth, requirePermission("users.create"), userController.create);
router.put("/:id", requireAuth, requirePermission("users.edit"), userController.update);
router.patch("/:id/status", requireAuth, requirePermission("users.disable"), userController.updateStatus);
router.put("/:id/branches", requireAuth, requirePermission("users.edit"), userController.assignBranches);
export default router;
