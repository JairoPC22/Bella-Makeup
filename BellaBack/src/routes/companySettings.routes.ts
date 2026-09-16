import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as controller from "../controllers/companySettingsController";

const router = Router();
router.get("/", requireAuth, controller.get);
router.put("/", requireAuth, requirePermission("settings.manage"), controller.update);
export default router;
