import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as profileController from "../controllers/profileController";

const router = Router();
router.get("/", requireAuth, profileController.getProfile);
router.put("/", requireAuth, profileController.updateProfile);
router.put("/password", requireAuth, profileController.changePassword);
router.get("/avatar-options", requireAuth, profileController.getAvatarOptions);
router.put("/avatar", requireAuth, profileController.changeAvatar);
export default router;
