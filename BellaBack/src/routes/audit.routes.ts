import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as auditController from "../controllers/auditController";

const router = Router();
router.get("/", requireAuth, requirePermission("audit.view"), auditController.list);
export default router;
