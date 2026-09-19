import fs from "fs/promises";
import * as messageRepository from "../repositories/messageRepository";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

const RETENTION_DAYS = 30;

// Shape returned for "a person" everywhere in the messaging API (a
// conversation participant, a message's author, an entry in the
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

interface ParticipantLike {
  userId: string;
  lastReadAt: Date | null;
  hiddenAt: Date | null;
  user: PartyLike;
}

interface ConversationLike {
  id: string;
  isGroup: boolean;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantLike[];
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

// Task 3's "seen" contract: each participant entry carries the user's
// public shape plus their OWN lastReadAt on this conversation. For a 1:1
// conversation, the frontend finds the entry whose user.id !== me and shows
// "Visto" under any of my own messages where message.createdAt <=
// thatEntry.lastReadAt. Groups get the same shape but the frontend is told
// (in this project's report) to skip building a per-message indicator for
// them — the shape doesn't stop them from adding it later.
function mapParticipant(p: ParticipantLike) {
  return {
    user: mapParty(p.user),
    lastReadAt: p.lastReadAt,
  };
}

// Computes the unread-message count for `userId` on this conversation and
// assembles the list/detail response shape shared by listMyConversations
// and startConversation. `messages` is the (already-fetched) 1-item
// last-message preview array, mapped the same way listMessages maps a full
// thread.
async function toConversationSummary(
  conversation: ConversationLike & { messages: { author: PartyLike }[] },
  userId: string
) {
  const own = conversation.participants.find((p) => p.userId === userId);
  const since = own?.lastReadAt ?? conversation.createdAt;
  const unreadCount = await messageRepository.countUnreadMessages(conversation.id, userId, since);
  return {
    id: conversation.id,
    isGroup: conversation.isGroup,
    name: conversation.name,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    participants: conversation.participants.map(mapParticipant),
    unreadCount,
    messages: conversation.messages.map((m) => ({ ...m, author: mapParty(m.author) })),
  };
}

export async function listMyConversations(userId: string) {
  const conversations = await messageRepository.listConversationsForUser(userId);
  return Promise.all(conversations.map((c) => toConversationSummary(c, userId)));
}

export interface StartConversationInput {
  participantIds: string[];
  name?: string | null;
}

export async function startConversation(userId: string, input: StartConversationInput) {
  const uniqueIds = Array.from(new Set(input.participantIds));
  if (uniqueIds.length !== input.participantIds.length) {
    throw new AppError(400, "No repitas participantes en la lista");
  }

  // The caller is always implicitly included — strip their own id out if
  // the frontend happened to send it, rather than treating it as an error.
  const otherIds = uniqueIds.filter((id) => id !== userId);
  if (otherIds.length === 0) {
    throw new AppError(400, "Debes incluir al menos otro participante");
  }

  const users = await prisma.user.findMany({ where: { id: { in: otherIds } } });
  if (users.length !== otherIds.length) {
    throw new AppError(404, "Uno o más usuarios no fueron encontrados");
  }
  if (users.some((u) => u.status === "DISABLED")) {
    throw new AppError(400, "No puedes iniciar una conversación con un usuario deshabilitado");
  }

  if (otherIds.length === 1) {
    const otherId = otherIds[0];
    const existing = await messageRepository.findExisting1to1Conversation(userId, otherId);
    if (existing) {
      await messageRepository.unhideParticipant(existing.id, userId);
      const refreshed = await messageRepository.findConversationById(existing.id);
      return toConversationSummary(refreshed!, userId);
    }
    const created = await messageRepository.createConversationWithParticipants({
      isGroup: false,
      name: null,
      participantIds: [userId, otherId],
    });
    return toConversationSummary(created, userId);
  }

  // Groups always create a brand-new conversation — no dedup attempt, same
  // as starting "a new group chat" with the same people twice in any
  // messenger app.
  const created = await messageRepository.createConversationWithParticipants({
    isGroup: true,
    name: input.name?.trim() ? input.name.trim() : null,
    participantIds: [userId, ...otherIds],
  });
  return toConversationSummary(created, userId);
}

// GET .../conversations/:id/messages response shape:
//   { conversation: { id, isGroup, name, participants: [{ user, lastReadAt }] }, messages: Message[] }
// `participants[].lastReadAt` is captured BEFORE this same request marks
// the caller's own row as read below, so for a 1:1 thread the entry whose
// user.id !== caller still reflects whatever that other participant had
// actually read as of just now — exactly the "seen" contract from Task 3.
export async function listMessages(userId: string, conversationId: string) {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(404, "Conversación no encontrada");

  const participant = conversation.participants.find((p) => p.userId === userId);
  if (!participant) throw new AppError(403, "Sin acceso a esta conversación");

  // Viewing IS reading — no separate "mark read" endpoint.
  await messageRepository.markConversationRead(conversationId, userId);

  const messages = await messageRepository.listMessagesForConversation(conversationId);

  return {
    conversation: {
      id: conversation.id,
      isGroup: conversation.isGroup,
      name: conversation.name,
      participants: conversation.participants.map(mapParticipant),
    },
    messages: messages.map((m) => ({ ...m, author: mapParty(m.author) })),
  };
}

export interface SendMessageInput {
  body: string | undefined;
  files: Express.Multer.File[];
}

export async function sendMessage(userId: string, conversationId: string, input: SendMessageInput) {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(404, "Conversación no encontrada");

  const participant = conversation.participants.find((p) => p.userId === userId);
  if (!participant) throw new AppError(403, "Sin acceso a esta conversación");

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

  // A new message should make the conversation reappear for anyone who'd
  // hidden it — "hide" is closer to "archive until something new happens"
  // than a true permanent delete. The sender's own hiddenAt/lastReadAt are
  // deliberately left untouched (irrelevant — they're actively sending).
  await messageRepository.unhideForOtherParticipants(conversationId, userId);

  await logAudit({
    userId,
    action: "messages.send",
    module: "messages",
    entityType: "message",
    entityId: message.id,
  });

  return { ...message, author: mapParty(message.author) };
}

// Sets the caller's own hiddenAt — purely a per-viewer flag, never touches
// the Conversation/Message rows or any other participant's view.
export async function hideConversation(userId: string, conversationId: string) {
  const participant = await messageRepository.findParticipant(conversationId, userId);
  if (!participant) throw new AppError(403, "Sin acceso a esta conversación");

  await messageRepository.hideConversationForUser(conversationId, userId);
}

// Powers the floating unread button: the number of the caller's non-hidden
// conversations that have at least one unread message, NOT a raw unread
// message tally — reads more naturally as a badge ("3 conversations need
// attention" vs. a potentially huge raw message count).
export async function getUnreadCount(userId: string) {
  const conversations = await messageRepository.listNonHiddenConversationsForUnread(userId);
  let count = 0;
  for (const c of conversations) {
    const since = c.participants[0]?.lastReadAt ?? c.createdAt;
    const unread = await messageRepository.countUnreadMessages(c.id, userId, since);
    if (unread > 0) count++;
  }
  return { count };
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
// can't abort the whole cleanup run. Participants aren't message-scoped, so
// this still only needs to touch the Message table directly — unmodified
// by the schema pivot.
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
