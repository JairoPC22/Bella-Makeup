import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as purchaseController from "../controllers/purchaseController";

const router = Router();

router.get("/", requireAuth, requirePermission("purchases.view"), purchaseController.list);
router.get("/:id", requireAuth, requirePermission("purchases.view"), purchaseController.getById);
router.post("/", requireAuth, requirePermission("purchases.create"), purchaseController.create);
router.post("/:id/receive", requireAuth, requirePermission("purchases.receive"), purchaseController.receive);
router.post("/:id/cancel", requireAuth, requirePermission("purchases.cancel"), purchaseController.cancel);

export default router;
