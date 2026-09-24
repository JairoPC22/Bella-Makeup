import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as orderController from "../controllers/orderController";

const router = Router();

// Superficie autenticada para gestionar pedidos de la tienda pública,
// distinta de /api/public/orders (sin autenticación).
router.get("/", requireAuth, requirePermission("orders.view"), orderController.list);
router.get("/:id", requireAuth, requirePermission("orders.view"), orderController.getById);
router.patch("/:id/status", requireAuth, requirePermission("orders.update"), orderController.updateStatus);
router.patch("/:id/eta", requireAuth, requirePermission("orders.update"), orderController.setEta);

export default router;
