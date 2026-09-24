import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as saleController from "../controllers/saleController";

const router = Router();

router.get("/", requireAuth, requirePermission("sales.view"), saleController.list);
router.get("/:id", requireAuth, requirePermission("sales.view"), saleController.getById);
router.post("/", requireAuth, requirePermission("sales.create"), saleController.create);
// El permiso real (sales.cancel, o un PIN de supervisor si
// CompanySettings.allowPinForSaleCancel lo permite) se valida dentro de
// saleService.cancelSale — sales.view es solo el piso para intentarlo,
// igual que sales.create es el piso de discounts.authorize en /sales.
router.patch("/:id/cancel", requireAuth, requirePermission("sales.view"), saleController.cancel);

export default router;
