import path from "path";
import { prisma } from "../config/prisma";
import { UPLOADS_MESSAGES_DIR } from "../config/multer";

/**
 * Normalizes an unordered branch pair into a deterministic (a, b) order via
 * plain string comparison, then find-or-creates the conversation row for
 * that pair. Because neither branchAId nor branchBId is nullable, the
 * @@unique([branchAId, branchBId]) index lets Postgres's ON CONFLICT handle
 * the race on its own — no advisory lock needed (that pattern only matters
 * for unique indexes with a nullable column).
 */
export function findOrCreateConversation(branchIdA: string, branchIdB: string) {
  const [branchAId, branchBId] = branchIdA < branchIdB ? [branchIdA, branchIdB] : [branchIdB, branchIdA];
  return prisma.branchConversation.upsert({
    where: { branchAId_branchBId: { branchAId, branchBId } },
    update: {},
    create: { branchAId, branchBId },
    include: { branchA: true, branchB: true },
  });
}

export function findConversationById(id: string) {
  return prisma.branchConversation.findUnique({
    where: { id },
    include: { branchA: true, branchB: true },
  });
}

export function listConversationsForBranches(branchIds: string[]) {
  return prisma.branchConversation.findMany({
    where: {
      OR: [{ branchAId: { in: branchIds } }, { branchBId: { in: branchIds } }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      branchA: true,
      branchB: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { author: true, fromBranch: true, attachments: true },
      },
    },
  });
}

export function listMessagesForConversation(conversationId: string) {
  return prisma.branchMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { author: true, fromBranch: true, attachments: true },
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
  authorId: string | null;
  fromBranchId: string;
  body: string;
  attachments: CreateMessageAttachmentInput[];
}

// Creates the message row + its attachment rows and bumps the parent
// conversation's updatedAt (so it re-sorts to the top of the conversation
// list) all inside a single transaction.
export function createMessage(input: CreateMessageInput) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.branchMessage.create({
      data: {
        conversationId: input.conversationId,
        authorId: input.authorId,
        fromBranchId: input.fromBranchId,
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
      include: { author: true, fromBranch: true, attachments: true },
    });
    await tx.branchConversation.update({
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
    const expired = await tx.branchMessage.findMany({
      where: { createdAt: { lt: cutoff } },
      include: { attachments: true },
    });
    if (expired.length === 0) return { messageCount: 0, filePaths: [] };

    const filePaths = expired.flatMap((m) =>
      m.attachments.map((a) => path.resolve(UPLOADS_MESSAGES_DIR, path.basename(a.url)))
    );

    await tx.branchMessage.deleteMany({
      where: { id: { in: expired.map((m) => m.id) } },
    });

    return { messageCount: expired.length, filePaths };
  });
}
