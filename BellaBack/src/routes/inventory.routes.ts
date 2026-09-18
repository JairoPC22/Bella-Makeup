import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as inventoryController from "../controllers/inventoryController";

const router = Router();

router.get("/", requireAuth, requirePermission("inventory.view"), inventoryController.list);
router.get("/:productId/movements", requireAuth, requirePermission("inventory.view"), inventoryController.movements);

export default router;
