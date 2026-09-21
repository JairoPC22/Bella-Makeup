import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import * as userController from "../controllers/userController";

const router = Router();
// Self-service, declared before "/:id" for readability (no actual conflict —
// "/:id" is a single path segment and can never match "/me/pin"). Guarded by
// requireAuth ONLY, with no requirePermission: the target is always the token
// holder, so there is nothing to authorize beyond being logged in. This
// mirrors the existing self-service credential flow at
// PUT /api/profile/password, which is likewise requireAuth-only.
router.put("/me/pin", requireAuth, userController.setOwnPin);
router.get("/", requireAuth, requirePermission("users.view"), userController.list);
router.post("/", requireAuth, requirePermission("users.create"), userController.create);
router.put("/:id", requireAuth, requirePermission("users.edit"), userController.update);
router.patch("/:id/status", requireAuth, requirePermission("users.disable"), userController.updateStatus);
router.put("/:id/branches", requireAuth, requirePermission("users.edit"), userController.assignBranches);
export default router;
