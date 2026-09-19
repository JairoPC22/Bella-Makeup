import fs from "fs/promises";
import * as messageRepository from "../repositories/messageRepository";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

const RETENTION_DAYS = 30;

// Mirrors requireBranchScope's logic in src/middleware/permissions.ts, but
// that middleware only reads req.params — here the branch id comes from the
// request body (starting a conversation, sending a message), so this needs
// its own inline version rather than sharing the middleware.
export async function hasBranchAccess(userId: string, branchId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.allBranches) return true;
  const assignment = await prisma.userBranch.findUnique({
    where: { userId_branchId: { userId, branchId } },
  });
  return !!assignment;
}

async function getAccessibleBranchIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  if (user.allBranches) {
    const branches = await prisma.branch.findMany({ select: { id: true } });
    return branches.map((b) => b.id);
  }
  const assignments = await prisma.userBranch.findMany({ where: { userId }, select: { branchId: true } });
  return assignments.map((a) => a.branchId);
}

// "Last seen" for a branch = the most recent lastLoginAt among every user
// who can act as that branch: users explicitly assigned via UserBranch,
// union users with allBranches:true (they could be operating from any
// branch, so their login counts toward every branch's activity). A single
// query fetching every user once, reduced in JS, mirrors the
// branchUserCounts-style "aggregate users over branches" shape already used
// in DashboardPage.tsx on the frontend — branch counts here are small
// enough that this doesn't need a per-branch SQL aggregate.
async function computeLastActivityByBranch(): Promise<Map<string, Date | null>> {
  const [branches, users] = await Promise.all([
    prisma.branch.findMany({ select: { id: true } }),
    prisma.user.findMany({
      select: { allBranches: true, lastLoginAt: true, userBranches: { select: { branchId: true } } },
    }),
  ]);

  const activity = new Map<string, Date | null>(branches.map((b) => [b.id, null]));

  function bump(branchId: string, lastLoginAt: Date | null) {
    if (!lastLoginAt) return;
    const current = activity.get(branchId);
    if (!current || lastLoginAt > current) activity.set(branchId, lastLoginAt);
  }

  for (const user of users) {
    if (!user.lastLoginAt) continue;
    if (user.allBranches) {
      for (const b of branches) bump(b.id, user.lastLoginAt);
    } else {
      for (const ub of user.userBranches) bump(ub.branchId, user.lastLoginAt);
    }
  }

  return activity;
}

function withLastActivity<T extends { id: string }>(branch: T, activity: Map<string, Date | null>) {
  return { ...branch, lastActivityAt: activity.get(branch.id) ?? null };
}

export async function listMyConversations(userId: string) {
  const branchIds = await getAccessibleBranchIds(userId);
  if (branchIds.length === 0) return [];
  const conversations = await messageRepository.listConversationsForBranches(branchIds);
  const activity = await computeLastActivityByBranch();
  return conversations.map((c) => ({
    ...c,
    branchA: withLastActivity(c.branchA, activity),
    branchB: withLastActivity(c.branchB, activity),
  }));
}

export async function startConversation(userId: string, fromBranchId: string, toBranchId: string) {
  if (fromBranchId === toBranchId) {
    throw new AppError(400, "No puedes iniciar una conversación de una sucursal consigo misma");
  }

  const canAct = await hasBranchAccess(userId, fromBranchId);
  if (!canAct) throw new AppError(403, "Sin acceso a esta sucursal");

  const [fromBranch, toBranch] = await Promise.all([
    prisma.branch.findUnique({ where: { id: fromBranchId } }),
    prisma.branch.findUnique({ where: { id: toBranchId } }),
  ]);
  if (!fromBranch || !toBranch) throw new AppError(404, "Sucursal no encontrada");

  const conversation = await messageRepository.findOrCreateConversation(fromBranchId, toBranchId);
  const activity = await computeLastActivityByBranch();
  return {
    ...conversation,
    branchA: withLastActivity(conversation.branchA, activity),
    branchB: withLastActivity(conversation.branchB, activity),
  };
}

export async function listMessages(userId: string, conversationId: string) {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(404, "Conversación no encontrada");

  const [accessA, accessB] = await Promise.all([
    hasBranchAccess(userId, conversation.branchAId),
    hasBranchAccess(userId, conversation.branchBId),
  ]);
  if (!accessA && !accessB) throw new AppError(403, "Sin acceso a esta conversación");

  return messageRepository.listMessagesForConversation(conversationId);
}

export interface SendMessageInput {
  fromBranchId: string;
  body: string | undefined;
  files: Express.Multer.File[];
}

export async function sendMessage(userId: string, conversationId: string, input: SendMessageInput) {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(404, "Conversación no encontrada");

  if (input.fromBranchId !== conversation.branchAId && input.fromBranchId !== conversation.branchBId) {
    throw new AppError(400, "La sucursal remitente no pertenece a esta conversación");
  }

  const canAct = await hasBranchAccess(userId, input.fromBranchId);
  if (!canAct) throw new AppError(403, "Sin acceso a esta sucursal");

  const body = (input.body ?? "").trim();
  if (body.length === 0 && input.files.length === 0) {
    throw new AppError(400, "El mensaje debe tener texto o al menos un archivo adjunto");
  }

  const message = await messageRepository.createMessage({
    conversationId,
    authorId: userId,
    fromBranchId: input.fromBranchId,
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
    entityType: "branch_message",
    entityId: message.id,
    branchId: input.fromBranchId,
  });

  return message;
}

export async function listMessagingBranches() {
  const branches = await prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const activity = await computeLastActivityByBranch();
  return branches.map((b) => withLastActivity(b, activity));
}

// Deletes every branch message older than 30 days and unlinks their
// attachment files from disk. Returns the number of messages deleted, used
// by the retention job for a log line. A missing file on disk (e.g. already
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
