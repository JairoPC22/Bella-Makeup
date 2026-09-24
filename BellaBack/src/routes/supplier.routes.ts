import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as supplierController from "../controllers/supplierController";

const router = Router();

// Lectura con purchases.view (se necesita el dropdown al crear una compra);
// escritura con el permiso más restrictivo suppliers.manage.
router.get("/", requireAuth, requirePermission("purchases.view"), supplierController.list);
router.post("/", requireAuth, requirePermission("suppliers.manage"), supplierController.create);
router.put("/:id", requireAuth, requirePermission("suppliers.manage"), supplierController.update);

export default router;
