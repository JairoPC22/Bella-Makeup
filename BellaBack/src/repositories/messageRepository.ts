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

/**
 * Normalizes an unordered user pair into a deterministic (a, b) order via
 * plain string comparison, then find-or-creates the conversation row for
 * that pair. Because neither userAId nor userBId is nullable, the
 * @@unique([userAId, userBId]) index lets Postgres's ON CONFLICT handle
 * the race on its own — no advisory lock needed (that pattern only matters
 * for unique indexes with a nullable column).
 */
export function findOrCreateConversation(userIdA: string, userIdB: string) {
  const [userAId, userBId] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
  return prisma.conversation.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    update: {},
    create: { userAId, userBId },
    include: { userA: { include: partyInclude }, userB: { include: partyInclude } },
  });
}

export function findConversationById(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: { userA: { include: partyInclude }, userB: { include: partyInclude } },
  });
}

export function listConversationsForUsers(userId: string) {
  return prisma.conversation.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      userA: { include: partyInclude },
      userB: { include: partyInclude },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { author: { include: partyInclude }, attachments: true },
      },
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
