import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as roleController from "../controllers/roleController";

const router = Router();
router.get("/", requireAuth, requirePermission("roles.view"), roleController.list);
router.post("/", requireAuth, requirePermission("roles.manage"), roleController.create);
router.put("/:id/permissions", requireAuth, requirePermission("roles.manage"), roleController.updatePermissions);
router.delete("/:id", requireAuth, requirePermission("roles.manage"), roleController.remove);
export default router;
