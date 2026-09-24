import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as inventoryCountController from "../controllers/inventoryCountController";

const router = Router();

// Un solo permiso ("inventory.count" — "Realizar inventarios físicos")
// protege todo el módulo, igual que otros módulos de permiso único del
// proyecto. Lo tienen branch_manager y warehouse en el seed.
router.get("/", requireAuth, requirePermission("inventory.count"), inventoryCountController.list);
router.get("/:id", requireAuth, requirePermission("inventory.count"), inventoryCountController.getById);
router.post("/", requireAuth, requirePermission("inventory.count"), inventoryCountController.create);
router.patch("/:id/items", requireAuth, requirePermission("inventory.count"), inventoryCountController.saveItems);
router.post("/:id/complete", requireAuth, requirePermission("inventory.count"), inventoryCountController.complete);
router.post("/:id/cancel", requireAuth, requirePermission("inventory.count"), inventoryCountController.cancel);

export default router;
