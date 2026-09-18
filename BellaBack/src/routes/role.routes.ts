import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as roleController from "../controllers/roleController";

const router = Router();
router.get("/", requireAuth, requirePermission("roles.view"), roleController.list);
router.put("/:id/permissions", requireAuth, requirePermission("roles.manage"), roleController.updatePermissions);
export default router;
