import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as ratingController from "../controllers/ratingController";

const router = Router();
// Admin-facing read side only — submission lives on the unauthenticated
// public.routes.ts router (POST /api/public/ratings), same split as
// orders (public create + track vs. authenticated management).
router.get("/", requireAuth, requirePermission("reports.view"), ratingController.list);
router.get("/summary", requireAuth, requirePermission("reports.view"), ratingController.summary);
export default router;
