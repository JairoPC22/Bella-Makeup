import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { productImageUpload } from "../config/multer";
import * as productImageController from "../controllers/productImageController";

// Mounted at "/api/products" in app.ts. Defined as its own route file
// (rather than nested under Task 4's product CRUD routes) so image upload
// is self-contained and testable before the full product CRUD exists.
const router = Router();

router.post(
  "/:productId/images",
  requireAuth,
  requirePermission("products.edit"),
  productImageUpload.single("image"),
  productImageController.upload
);

router.delete(
  "/:productId/images/:imageId",
  requireAuth,
  requirePermission("products.edit"),
  productImageController.remove
);

router.patch(
  "/:productId/images/:imageId/primary",
  requireAuth,
  requirePermission("products.edit"),
  productImageController.setPrimary
);

export default router;
