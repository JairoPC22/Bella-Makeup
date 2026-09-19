import { apiFetch, ApiError } from "./apiClient";
import type { Conversation, Message, MessagingParty } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL as string;
// /uploads is served as a static root by the backend (see BellaBack's
// app.ts app.use("/uploads", ...)), not under /api — strip the /api suffix
// from VITE_API_URL to get the origin attachment URLs need to be resolved
// against.
const UPLOADS_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export function buildAttachmentUrl(relativeUrl: string): string {
  return `${UPLOADS_ORIGIN}${relativeUrl}`;
}

export const listConversations = () => apiFetch<Conversation[]>("/messages/conversations");

export const listMessagingUsers = () => apiFetch<MessagingParty[]>("/messages/users");

export const startConversation = (otherUserId: string) =>
  apiFetch<Conversation>("/messages/conversations", {
    method: "POST",
    body: JSON.stringify({ otherUserId }),
  });

export const listMessages = (conversationId: string) =>
  apiFetch<Message[]>(`/messages/conversations/${conversationId}/messages`);

export interface SendMessageInput {
  body: string;
  files: File[];
}

// apiFetch always sets Content-Type: application/json, which is wrong for a
// multipart upload (it would clobber the browser-generated boundary). This
// is deliberately its own fetch() call rather than a special case bolted
// onto apiFetch — apiFetch is used everywhere else and JSON is correct
// there. No 401-refresh-retry here (unlike apiFetch): sending a message is a
// rare, manual user action rather than a background poll, so a simple
// version without that retry logic is an acceptable tradeoff.
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
