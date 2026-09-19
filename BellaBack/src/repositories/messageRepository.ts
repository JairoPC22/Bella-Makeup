import path from "path";
import { prisma } from "../config/prisma";
import { UPLOADS_MESSAGES_DIR } from "../config/multer";

// Shared include shape for "a person" in the messaging graph (conversation
// participants, message authors) — role name + branch assignments, which is
// exactly what messageService's mapParty() needs to build a MessagingParty
// without a second round trip per user.
const partyInclude = {
  role: { select: { name: true } },
  userBranches: { include: { branch: true } },
} as const;

// Shared include shape for a conversation's participants: each row's own
// user (party shape) plus lastReadAt/hiddenAt, which the service layer
// needs both for the "other participant" / group participant list and for
// computing unreadCount / the Task 3 "seen" contract.
const participantsInclude = {
  include: { user: { include: partyInclude } },
} as const;

const lastMessageInclude = {
  orderBy: { createdAt: "desc" as const },
  take: 1,
  include: { author: { include: partyInclude }, attachments: true },
};

export function findConversationById(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      participants: participantsInclude,
      messages: lastMessageInclude,
    },
  });
}

// Looks for an existing 1:1 (isGroup: false) conversation between exactly
// these two users. Queried as "conversations where isGroup is false and a
// participant row exists for both ids", then filtered in JS to those with
// exactly 2 participants — simplest way to express "the participant set is
// EXACTLY {a, b}" without a more exotic aggregate query.
export async function findExisting1to1Conversation(userIdA: string, userIdB: string) {
  const candidates = await prisma.conversation.findMany({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId: userIdA } } },
        { participants: { some: { userId: userIdB } } },
      ],
    },
    include: { participants: participantsInclude, messages: lastMessageInclude },
  });
  return candidates.find((c) => c.participants.length === 2) ?? null;
}

export function createConversationWithParticipants(input: {
  isGroup: boolean;
  name: string | null;
  participantIds: string[];
}) {
  return prisma.conversation.create({
    data: {
      isGroup: input.isGroup,
      name: input.name,
      participants: {
        create: input.participantIds.map((userId) => ({ userId })),
      },
    },
    include: { participants: participantsInclude, messages: lastMessageInclude },
  });
}

// Clears hiddenAt for a single participant's own row (used both when
// re-starting a 1:1 conversation the caller had hidden, and — for the
// OTHER participants — when a new message arrives in a conversation they'd
// hidden).
export function unhideParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.updateMany({
    where: { conversationId, userId, hiddenAt: { not: null } },
    data: { hiddenAt: null },
  });
}

export function unhideForOtherParticipants(conversationId: string, exceptUserId: string) {
  return prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: { not: exceptUserId }, hiddenAt: { not: null } },
    data: { hiddenAt: null },
  });
}

export function hideConversationForUser(conversationId: string, userId: string) {
  return prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { hiddenAt: new Date() },
  });
}

export function findParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export function markConversationRead(conversationId: string, userId: string) {
  return prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });
}

// Lists every non-hidden conversation for this user, including all
// participants (regardless of THEIR hidden state — hiddenAt is per-viewer,
// not global) and a 1-message preview, ordered most-recently-active first.
export function listConversationsForUser(userId: string) {
  return prisma.conversation.findMany({
    where: {
      participants: { some: { userId, hiddenAt: null } },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      participants: participantsInclude,
      messages: lastMessageInclude,
    },
  });
}

// Lightweight query for the unread-count endpoint: just enough per
// conversation (its own createdAt + the caller's own participant row) to
// compute "since" for countUnreadMessages, without pulling avatars/roles.
export function listNonHiddenConversationsForUnread(userId: string) {
  return prisma.conversation.findMany({
    where: { participants: { some: { userId, hiddenAt: null } } },
    select: {
      id: true,
      createdAt: true,
      participants: { where: { userId }, select: { lastReadAt: true } },
    },
  });
}

// Unread-message count for one conversation, scoped to `userId`: messages
// authored by someone else, created after the viewer's own lastReadAt (or
// the conversation's createdAt if they've never read it).
export function countUnreadMessages(conversationId: string, userId: string, since: Date) {
  return prisma.message.count({
    where: {
      conversationId,
      authorId: { not: userId },
      createdAt: { gt: since },
    },
  });
}

export function listMessagesForConversation(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { author: { include: partyInclude }, attachments: true },
  });
}

export interface CreateMessageAttachmentInput {
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface CreateMessageInput {
  conversationId: string;
  authorId: string;
  body: string;
  attachments: CreateMessageAttachmentInput[];
}

// Creates the message row + its attachment rows and bumps the parent
// conversation's updatedAt (so it re-sorts to the top of the conversation
// list) all inside a single transaction.
export function createMessage(input: CreateMessageInput) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: input.conversationId,
        authorId: input.authorId,
        body: input.body,
        attachments: {
          create: input.attachments.map((a) => ({
            fileName: a.fileName,
            url: a.url,
            mimeType: a.mimeType,
            size: a.size,
          })),
        },
      },
      include: { author: { include: partyInclude }, attachments: true },
    });
    await tx.conversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });
    return message;
  });
}

export interface DeleteExpiredResult {
  messageCount: number;
  filePaths: string[];
}

// Finds every message older than `cutoff` (with their attachments), deletes
// them, and returns both the deleted message count and the deleted rows'
// attachment file paths so the caller can unlink the underlying files from
// disk. The find-then-delete happens inside a transaction so nothing slips
// through between the two steps.
export async function deleteMessagesOlderThan(cutoff: Date): Promise<DeleteExpiredResult> {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.message.findMany({
      where: { createdAt: { lt: cutoff } },
      include: { attachments: true },
    });
    if (expired.length === 0) return { messageCount: 0, filePaths: [] };

    const filePaths = expired.flatMap((m) =>
      m.attachments.map((a) => path.resolve(UPLOADS_MESSAGES_DIR, path.basename(a.url)))
    );

    await tx.message.deleteMany({
      where: { id: { in: expired.map((m) => m.id) } },
    });

    return { messageCount: expired.length, filePaths };
  });
}
