import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as brandController from "../controllers/brandController";

const router = Router();
router.get("/", requireAuth, requirePermission("products.view"), brandController.list);
router.post("/", requireAuth, requirePermission("products.edit"), brandController.create);
router.put("/:id", requireAuth, requirePermission("products.edit"), brandController.update);
router.patch("/:id/status", requireAuth, requirePermission("products.edit"), brandController.updateStatus);
export default router;
