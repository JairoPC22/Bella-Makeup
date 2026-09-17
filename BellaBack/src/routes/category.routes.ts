import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as categoryController from "../controllers/categoryController";

const router = Router();
router.get("/", requireAuth, requirePermission("products.view"), categoryController.list);
router.post("/", requireAuth, requirePermission("products.edit"), categoryController.create);
router.put("/:id", requireAuth, requirePermission("products.edit"), categoryController.update);
router.patch("/:id/status", requireAuth, requirePermission("products.edit"), categoryController.updateStatus);
export default router;
