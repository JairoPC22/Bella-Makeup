import fs from "fs/promises";
import * as messageRepository from "../repositories/messageRepository";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { logAudit } from "./auditService";

const RETENTION_DAYS = 30;

// Forma devuelta para "una persona" en toda la API de mensajería (un
// participante, el autor de un mensaje, una entrada del selector de
// personas) — sigue el mismo patrón de branches que authService.toPublicUser
// ya usa (userBranches -> branch), reducido a lo que necesita el chat.
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

// Contrato de "visto": cada participante trae su forma pública más su
// PROPIO lastReadAt en esta conversación. En un chat 1:1 el frontend busca
// la entrada cuyo user.id !== yo y muestra "Visto" bajo mis mensajes con
// createdAt <= ese lastReadAt. Los grupos usan la misma forma aunque el
// frontend no construya el indicador por mensaje para ellos.
function mapParticipant(p: ParticipantLike) {
  return {
    user: mapParty(p.user),
    lastReadAt: p.lastReadAt,
  };
}

// Calcula el conteo de mensajes no leídos de `userId` en esta conversación y
// arma la forma de respuesta compartida por listMyConversations y
// startConversation. `messages` es el arreglo de 1 elemento con la vista
// previa del último mensaje, mapeado igual que listMessages mapea un hilo
// completo.
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

  // Quien llama siempre se incluye implícitamente: si el frontend envía su
  // propio id, se descarta en vez de tratarlo como error.
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

  // Los grupos siempre crean una conversación nueva, sin intento de
  // deduplicación, igual que en cualquier app de mensajería.
  const created = await messageRepository.createConversationWithParticipants({
    isGroup: true,
    name: input.name?.trim() ? input.name.trim() : null,
    participantIds: [userId, ...otherIds],
  });
  return toConversationSummary(created, userId);
}

// Forma de respuesta de GET .../conversations/:id/messages:
//   { conversation: { id, isGroup, name, participants: [{ user, lastReadAt }] }, messages: Message[] }
// `participants[].lastReadAt` se captura ANTES de marcar como leída la
// propia fila más abajo, así que en un chat 1:1 la entrada del otro
// participante sigue reflejando lo que él realmente había leído hasta
// este momento.
export async function listMessages(userId: string, conversationId: string) {
  const conversation = await messageRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(404, "Conversación no encontrada");

  const participant = conversation.participants.find((p) => p.userId === userId);
  if (!participant) throw new AppError(403, "Sin acceso a esta conversación");

  // Ver ES leer — no hay un endpoint separado de "marcar como leído".
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

  // Un mensaje nuevo debe hacer reaparecer la conversación para quien la
  // ocultó: "ocultar" es más un "archivar hasta que pase algo nuevo" que un
  // borrado real. El hiddenAt/lastReadAt del propio remitente no se tocan
  // (irrelevante, está enviando activamente).
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

// Establece el hiddenAt propio del que llama — solo una bandera por
// usuario, nunca toca las filas de Conversation/Message ni la vista de
// otro participante.
export async function hideConversation(userId: string, conversationId: string) {
  const participant = await messageRepository.findParticipant(conversationId, userId);
  if (!participant) throw new AppError(403, "Sin acceso a esta conversación");

  await messageRepository.hideConversationForUser(conversationId, userId);
}

// Alimenta el botón flotante de no leídos: el número de conversaciones no
// ocultas con al menos un mensaje sin leer, NO el total crudo de mensajes;
// se lee mejor como badge ("3 conversaciones pendientes") que un conteo
// potencialmente enorme.
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

// Alimenta el selector de personas para "nueva conversación": todo usuario
// activo excepto quien llama, ordenado por nombre. Sin filtro de sucursal:
// cualquier usuario activo puede escribirle a cualquier otro sin importar
// sucursal o rol.
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

// Elimina todo mensaje con más de 30 días y borra sus archivos adjuntos del
// disco. Devuelve la cantidad eliminada, usada por el job de retención para
// su log. Un archivo faltante en disco no es fatal: se registra y se salta
// para que uno solo no aborte toda la limpieza.
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
