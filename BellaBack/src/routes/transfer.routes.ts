import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as transferController from "../controllers/transferController";

const router = Router();

router.get("/", requireAuth, requirePermission("transfers.view"), transferController.list);
router.get("/:id", requireAuth, requirePermission("transfers.view"), transferController.getById);
router.post("/", requireAuth, requirePermission("transfers.create"), transferController.create);
router.post("/:id/receive", requireAuth, requirePermission("transfers.receive"), transferController.receive);
router.post("/:id/cancel", requireAuth, requirePermission("transfers.cancel"), transferController.cancel);

export default router;
