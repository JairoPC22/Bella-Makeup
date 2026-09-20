import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as orderController from "../controllers/orderController";

const router = Router();

// Authenticated staff surface for managing orders placed via the public
// storefront — distinct from /api/public/orders (unauthenticated). Reuses
// the "orders.view"/"orders.update" permission codes already seeded in
// prisma/seed.ts for the online_store_admin role, now also granted to
// Administrator (via the wildcard admin role) and Branch Manager.
router.get("/", requireAuth, requirePermission("orders.view"), orderController.list);
router.get("/:id", requireAuth, requirePermission("orders.view"), orderController.getById);
router.patch("/:id/status", requireAuth, requirePermission("orders.update"), orderController.updateStatus);

export default router;
