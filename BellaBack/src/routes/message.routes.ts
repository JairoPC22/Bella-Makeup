import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { messageAttachmentUpload } from "../config/multer";
import * as messageController from "../controllers/messageController";

const router = Router();

router.get("/conversations", requireAuth, requirePermission("messages.view"), messageController.listConversations);
router.post("/conversations", requireAuth, requirePermission("messages.send"), messageController.startConversation);
// Deliberately ahead of nothing that would conflict (no other :id-shaped
// route past /conversations/:id in this file), a plain DELETE on the
// conversation resource — this project's REST convention elsewhere (see
// e.g. product image delete) uses DELETE for a "remove this from my view"
// action even when, as here, it's a soft/per-viewer flag rather than a
// hard delete of the row.
router.delete(
  "/conversations/:id",
  requireAuth,
  requirePermission("messages.view"),
  messageController.hideConversation
);
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
router.get("/unread-count", requireAuth, requirePermission("messages.view"), messageController.getUnreadCount);
// Deliberately not gated by users.view: roles like cashier get
// messages.view/messages.send but not users.view in the seed, and still
// need to see who they can message. Keeps the payload minimal (no
// permissions/email/etc), not the full Users CRUD record.
router.get("/users", requireAuth, requirePermission("messages.view"), messageController.listUsers);

export default router;
