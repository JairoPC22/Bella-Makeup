import { Router } from "express";
import * as publicController from "../controllers/publicController";

const router = Router();

// Este router se monta a propósito sin requireAuth ni requirePermission:
// es la superficie pública del storefront que un cliente anónimo (sin
// cuenta ni sesión) consulta directamente. Ver app.ts, donde se monta en
// /api/public, junto a (no anidado dentro de) los routers autenticados
// /api/*.
router.get("/categories", publicController.listCategories);
router.get("/products", publicController.listProducts);
router.get("/products/:id", publicController.getProduct);
router.get("/branches", publicController.listBranches);
router.get("/company", publicController.getCompanyInfo);
router.post("/orders", publicController.createOrder);
router.get("/orders/:orderNumber", publicController.trackOrder);
router.post("/ratings", publicController.createRating);

export default router;
