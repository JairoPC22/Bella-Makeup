import path from "path";
import { prisma } from "../config/prisma";
import { UPLOADS_MESSAGES_DIR } from "../config/multer";

// Include compartido para "una persona" en mensajería: rol + sucursales,
// lo que necesita messageService.mapParty() sin otra consulta.
const partyInclude = {
  role: { select: { name: true } },
  userBranches: { include: { branch: true } },
} as const;

// Include compartido para participantes: usuario + lastReadAt/hiddenAt,
// usados para la lista de participantes y el cálculo de unreadCount.
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

// Busca una conversación 1:1 existente entre estos dos usuarios; se filtra
// en JS a exactamente 2 participantes por simplicidad de la consulta.
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

// Limpia hiddenAt de un participante: al reabrir una conversación oculta
// o cuando llega un mensaje nuevo a una conversación que había ocultado.
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

// Lista las conversaciones no ocultas del usuario, con todos los participantes
// (hiddenAt es por usuario, no global) y una vista previa de 1 mensaje.
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

// Consulta liviana para el endpoint de no leídos: solo lo necesario para countUnreadMessages.
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

// Cuenta mensajes de otros creados después del lastReadAt del usuario (o de createdAt si nunca leyó).
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

// Crea el mensaje y sus adjuntos, y actualiza updatedAt de la conversación, todo en una transacción.
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

// Busca y borra mensajes anteriores a `cutoff` en una transacción; devuelve
// las rutas de los adjuntos para que el caller los borre del disco.
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
