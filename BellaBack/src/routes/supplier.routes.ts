import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as supplierController from "../controllers/supplierController";

const router = Router();

// Split gate, deliberately: READING the supplier list is gated on
// purchases.view, not suppliers.manage, because anyone raising a purchase
// order has to pick a supplier from a dropdown — requiring the master-data
// permission just to see the names would make purchases.create unusable on
// its own. WRITING supplier records is the narrower suppliers.manage.
router.get("/", requireAuth, requirePermission("purchases.view"), supplierController.list);
router.post("/", requireAuth, requirePermission("suppliers.manage"), supplierController.create);
router.put("/:id", requireAuth, requirePermission("suppliers.manage"), supplierController.update);

export default router;
