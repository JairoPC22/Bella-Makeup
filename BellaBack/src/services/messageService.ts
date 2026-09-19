import fs from "fs/promises";
import * as messageRepository from "../repositories/messageRepository";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

const RETENTION_DAYS = 30;

// Shape returned for "a person" everywhere in the messaging API (the other
// participant on a conversation, a message's author, an entry in the
// people-picker) — mirrors the branches shape authService.toPublicUser
// already establishes for the Users CRUD response (userBranches -> branch),
// trimmed to just what the messaging UI needs.
interface PartyLike {
  id: string;
  displayName: string;
  avatarStyle: string;
  avatarSeed: string;
  allBranches: boolean;
  lastLoginAt: Date | null;
  role: { name: string };
  userBranches: { branch: { id: string; name: string } }[];
}

function mapParty(user: PartyLike) {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarStyle: user.avatarStyle,
    avatarSeed: user.avatarSeed,
    role: { name: user.role.name },
    allBranches: user.allBranches,
    branches: user.userBranches.map((ub) => ({ id: ub.branch.id, name: ub.branch.name })),
    lastLoginAt: user.lastLoginAt,
  };
}

function otherUserOf(conversation: { userAId: string; userA: PartyLike; userB: PartyLike }, userId: string) {
  return conversation.userAId === userId ? conversation.userB : conversation.userA;
}

function mapConversation<
  T extends { userAId: string; userA: PartyLike; userB: PartyLike; messages: { author: PartyLike }[] }
>(conversation: T, userId: string) {
  const { userA, userB, messages, ...rest } = conversation;
  return {
    ...rest,
    otherUser: mapParty(otherUserOf(conversation, userId)),
    messages: messages.map((m) => ({ ...m, author: mapParty(m.author) })),
  };
}

export async function listMyConversations(userId: string) {
  const conversations = await messageRepository.listConversationsForUsers(userId);
  return conversations.map((c) => mapConversation(c, userId));
}

export async function startConversation(userId: string, otherUserId: string) {
  if (otherUserId === userId) {
    throw new AppError(400, "No puedes iniciarte una conversación contigo mismo");
  }

  const otherUser = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!otherUser) throw new AppError(404, "Usuario no encontrado");
  if (otherUser.status === "DISABLED") {
    throw new AppError(400, "No puedes iniciar una conversación con un usuario deshabilitado");
  }

  const conversation = await messageRepository.findOrCreateConversation(userId, otherUserId);
  // Destructure userA/userB out before spreading — they're full Prisma User
  // rows (passwordHash included) fetched for the mapParty() below, and must
  // never reach the response as-is. Same shape as mapConversation()'s own
  // strip-then-spread for listMyConversations.
  const { userA, userB, ...rest } = conversation;
  return {
    ...rest,
    otherUser: mapParty(otherUserOf(conversation, userId)),
  };
}

export async function listMessages(userId: string, conversationId: string) {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(404, "Conversación no encontrada");

  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new AppError(403, "Sin acceso a esta conversación");
  }

  const messages = await messageRepository.listMessagesForConversation(conversationId);
  return messages.map((m) => ({ ...m, author: mapParty(m.author) }));
}

export interface SendMessageInput {
  body: string | undefined;
  files: Express.Multer.File[];
}

export async function sendMessage(userId: string, conversationId: string, input: SendMessageInput) {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(404, "Conversación no encontrada");

  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new AppError(403, "Sin acceso a esta conversación");
  }

  const body = (input.body ?? "").trim();
  if (body.length === 0 && input.files.length === 0) {
    throw new AppError(400, "El mensaje debe tener texto o al menos un archivo adjunto");
  }

  const message = await messageRepository.createMessage({
    conversationId,
    authorId: userId,
    body,
    attachments: input.files.map((f) => ({
      fileName: f.originalname,
      url: `/uploads/messages/${f.filename}`,
      mimeType: f.mimetype,
      size: f.size,
    })),
  });

  await logAudit({
    userId,
    action: "messages.send",
    module: "messages",
    entityType: "message",
    entityId: message.id,
  });

  return { ...message, author: mapParty(message.author) };
}

// Powers the "start a new conversation" people-picker: every active user
// except the caller, ordered by name. No branch-access filtering — any
// active user can message any other active user regardless of branch/role.
export async function listMessagingUsers(currentUserId: string) {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", id: { not: currentUserId } },
    orderBy: { displayName: "asc" },
    include: {
      role: { select: { name: true } },
      userBranches: { include: { branch: true } },
    },
  });
  return users.map(mapParty);
}

// Deletes every message older than 30 days and unlinks their attachment
// files from disk. Returns the number of messages deleted, used by the
// retention job for a log line. A missing file on disk (e.g. already
// removed manually) is not fatal — it's logged and skipped so one bad file
// can't abort the whole cleanup run.
export async function deleteExpiredMessages(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { messageCount, filePaths } = await messageRepository.deleteMessagesOlderThan(cutoff);

  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error(`[messageRetention] failed to unlink attachment at ${filePath}:`, err);
    }
  }

  return messageCount;
}
