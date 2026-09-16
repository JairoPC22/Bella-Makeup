import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as roleController from "../controllers/roleController";

const router = Router();
router.get("/", requireAuth, requirePermission("roles.view"), roleController.list);
export default router;
