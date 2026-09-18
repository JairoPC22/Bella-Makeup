import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as productController from "../controllers/productController";

const router = Router();
router.get("/", requireAuth, requirePermission("products.view"), productController.list);
router.get("/:id", requireAuth, requirePermission("products.view"), productController.getById);
router.post("/", requireAuth, requirePermission("products.create"), productController.create);
router.put("/:id", requireAuth, requirePermission("products.edit"), productController.update);
router.patch("/:id/status", requireAuth, requirePermission("products.edit"), productController.updateStatus);
export default router;
