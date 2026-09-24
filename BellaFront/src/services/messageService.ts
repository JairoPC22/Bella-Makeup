import { apiFetch, ApiError } from "./apiClient";
import type { Conversation, ConversationMessagesResponse, Message, MessagingParty } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL as string;
// /uploads se sirve como raíz estática en el backend, no bajo /api — se
// quita el sufijo /api de VITE_API_URL para obtener el origen correcto.
const UPLOADS_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export function buildAttachmentUrl(relativeUrl: string): string {
  return `${UPLOADS_ORIGIN}${relativeUrl}`;
}

export const listConversations = () => apiFetch<Conversation[]>("/messages/conversations");

export const listMessagingUsers = () => apiFetch<MessagingParty[]>("/messages/users");

// participantIds son las demás personas a agregar (el llamador es implícito
// en el servidor). 1 id => 1 a 1 (dedup); 2+ ids => siempre crea un grupo.
export const startConversation = (participantIds: string[], name?: string | null) =>
  apiFetch<Conversation>("/messages/conversations", {
    method: "POST",
    body: JSON.stringify({ participantIds, ...(name ? { name } : {}) }),
  });

export const listMessages = (conversationId: string) =>
  apiFetch<ConversationMessagesResponse>(`/messages/conversations/${conversationId}/messages`);

// "Eliminar para mí": oculta la conversación solo para quien la pide.
export const hideConversation = (conversationId: string) =>
  apiFetch<void>(`/messages/conversations/${conversationId}`, { method: "DELETE" });

export const getUnreadCount = () => apiFetch<{ count: number }>("/messages/unread-count");

export interface SendMessageInput {
  body: string;
  files: File[];
}

// fetch() propio en vez de apiFetch: apiFetch fuerza Content-Type
// application/json, lo cual rompería el boundary multipart. Sin reintento
// de refresh 401 (aceptable: enviar un mensaje es una acción manual, no polling).
export async function sendMessage(conversationId: string, input: SendMessageInput): Promise<Message> {
  const formData = new FormData();
  formData.append("body", input.body);
  for (const file of input.files) {
    formData.append("attachments", file);
  }

  const res = await fetch(`${API_URL}/messages/conversations/${conversationId}/messages`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Error de red");
  }

  return res.json() as Promise<Message>;
}
