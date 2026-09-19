import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { messageAttachmentUpload } from "../config/multer";
import * as messageController from "../controllers/messageController";

const router = Router();

router.get("/conversations", requireAuth, requirePermission("messages.view"), messageController.listConversations);
router.post("/conversations", requireAuth, requirePermission("messages.send"), messageController.startConversation);
router.get(
  "/conversations/:id/messages",
  requireAuth,
  requirePermission("messages.view"),
  messageController.listMessages
);
router.post(
  "/conversations/:id/messages",
  requireAuth,
  requirePermission("messages.send"),
  messageAttachmentUpload.array("attachments", 3),
  messageController.sendMessage
);
// Deliberately not gated by users.view: roles like cashier get
// messages.view/messages.send but not users.view in the seed, and still
// need to see who they can message. Keeps the payload minimal (no
// permissions/email/etc), not the full Users CRUD record.
router.get("/users", requireAuth, requirePermission("messages.view"), messageController.listUsers);

export default router;
