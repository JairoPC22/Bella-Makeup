import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { messageAttachmentUpload } from "../config/multer";
import * as messageController from "../controllers/messageController";

const router = Router();

router.get("/conversations", requireAuth, requirePermission("messages.view"), messageController.listConversations);
router.post("/conversations", requireAuth, requirePermission("messages.send"), messageController.startConversation);
// DELETE aquí es "ocultar de mi vista" (soft, por usuario), no un borrado real de la fila.
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
// No se restringe con users.view: roles como cajero necesitan ver a quién mensajear
// aunque no tengan permiso para el CRUD de usuarios. Devuelve datos mínimos.
router.get("/users", requireAuth, requirePermission("messages.view"), messageController.listUsers);

export default router;
