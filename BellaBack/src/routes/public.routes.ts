import { Router } from "express";
import * as publicController from "../controllers/publicController";

const router = Router();

// This entire router is deliberately mounted with NO requireAuth and NO
// requirePermission anywhere — it's the genuinely public, unauthenticated
// storefront surface a real anonymous customer (no account, no session
// cookie) hits directly. See app.ts for where this is mounted at
// /api/public, as a sibling to (not nested under) the authenticated /api/*
// routers.
router.get("/categories", publicController.listCategories);
router.get("/products", publicController.listProducts);
router.get("/products/:id", publicController.getProduct);
router.get("/branches", publicController.listBranches);
router.post("/orders", publicController.createOrder);
router.get("/orders/:orderNumber", publicController.trackOrder);

export default router;
