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
// Deliberately not gated by branches.view: roles like cashier get
// messages.view/messages.send but not branches.view in the seed, and still
// need branch names to start a conversation. Keeps the payload minimal
// (id + name only), not the full branch record.
router.get("/branches", requireAuth, requirePermission("messages.view"), messageController.listBranches);

export default router;
