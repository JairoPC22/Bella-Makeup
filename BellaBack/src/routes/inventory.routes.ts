import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as inventoryController from "../controllers/inventoryController";

const router = Router();

router.get("/", requireAuth, requirePermission("inventory.view"), inventoryController.list);
// El permiso real (inventory.adjust, o un PIN de supervisor si
// CompanySettings.allowPinForInventoryAdjust lo permite) se valida dentro de
// adjustInventory — inventory.view es solo el piso para intentarlo.
router.post("/adjust", requireAuth, requirePermission("inventory.view"), inventoryController.adjust);
router.get("/:productId/movements", requireAuth, requirePermission("inventory.view"), inventoryController.movements);

export default router;
