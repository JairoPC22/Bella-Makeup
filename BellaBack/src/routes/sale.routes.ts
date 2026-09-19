import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as saleController from "../controllers/saleController";

const router = Router();

router.get("/", requireAuth, requirePermission("sales.view"), saleController.list);
router.get("/:id", requireAuth, requirePermission("sales.view"), saleController.getById);
router.post("/", requireAuth, requirePermission("sales.create"), saleController.create);
router.patch("/:id/cancel", requireAuth, requirePermission("sales.cancel"), saleController.cancel);

export default router;
