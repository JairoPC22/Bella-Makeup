import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, Paperclip, Send, X, FileText, Image as ImageIcon } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { StatusState } from "../../components/common/StatusState";
import { Avatar } from "../../components/common/Avatar";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import * as messageService from "../../services/messageService";
import { buildAttachmentUrl } from "../../services/messageService";
import type { Conversation, BranchMessage, MessagingBranch, Branch } from "../../types/api";
import "./MessagesPage.css";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "Justo ahora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Hace ${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `Hace ${diffDay} d`;
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function conversationLabel(conv: Conversation): string {
  return `${conv.branchA.name} ↔ ${conv.branchB.name}`;
}

// Reuses formatRelativeTime (same helper used for message timestamps) so
// "last seen" and message times read consistently instead of introducing a
// second relative-time implementation.
function lastSeenText(lastActivityAt: string | null): string {
  return lastActivityAt ? `última conexión ${formatRelativeTime(lastActivityAt).toLowerCase()}` : "nunca ha iniciado sesión";
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon size={14} />;
  if (mimeType === "application/pdf") return <FileText size={14} />;
  return <Paperclip size={14} />;
}

function branchesForUser(user: { allBranches: boolean; branches: Branch[] } | null, all: MessagingBranch[]): MessagingBranch[] {
  if (!user) return [];
  if (user.allBranches) return all;
  return user.branches.map((b) => ({ id: b.id, name: b.name }));
}

export function MessagesPage() {
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [conversationsStatus, setConversationsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [messagingBranches, setMessagingBranches] = useState<MessagingBranch[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BranchMessage[] | null>(null);
  const [messagesStatus, setMessagesStatus] = useState<"loading" | "ready" | "error">("loading");

  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [composeFromBranchId, setComposeFromBranchId] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [newConvToBranchId, setNewConvToBranchId] = useState("");
  const [newConvFromBranchId, setNewConvFromBranchId] = useState("");
  const [newConvError, setNewConvError] = useState<string | null>(null);
  const [creatingConv, setCreatingConv] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageService.listConversations()
      .then((list) => { setConversations(list); setConversationsStatus("ready"); })
      .catch(() => setConversationsStatus("error"));
    messageService.listMessagingBranches().then(setMessagingBranches).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setMessagesStatus("loading");
    messageService.listMessages(selectedId)
      .then((msgs) => { setMessages(msgs); setMessagesStatus("ready"); })
      .catch(() => setMessagesStatus("error"));
  }, [selectedId]);

  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const accessibleBranches = useMemo(() => branchesForUser(user, messagingBranches), [user, messagingBranches]);

  const selectedConversation = conversations?.find((c) => c.id === selectedId) ?? null;

  const accessibleForSelected = useMemo(() => {
    if (!selectedConversation) return [];
    const candidates = [selectedConversation.branchA, selectedConversation.branchB];
    if (user?.allBranches) return candidates;
    const ownIds = new Set((user?.branches ?? []).map((b) => b.id));
    return candidates.filter((b) => ownIds.has(b.id));
  }, [selectedConversation, user]);

  function selectConversation(conv: Conversation) {
    setSelectedId(conv.id);
    const candidates = [conv.branchA, conv.branchB];
    const accessible = user?.allBranches
      ? candidates
      : candidates.filter((b) => (user?.branches ?? []).some((ub) => ub.id === b.id));
    setComposeFromBranchId(accessible[0]?.id ?? "");
    setComposeBody("");
    setComposeFiles([]);
    setComposeError(null);
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    setComposeError(null);

    const combined = [...composeFiles, ...incoming];
    if (combined.length > MAX_FILES) {
      setComposeError(`Solo puedes adjuntar hasta ${MAX_FILES} archivos por mensaje.`);
      return;
    }
    for (const f of incoming) {
      if (!ACCEPTED_MIME.includes(f.type)) {
        setComposeError(`Formato no permitido para "${f.name}". Solo JPG, PNG, WEBP o PDF.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        setComposeError(`El archivo "${f.name}" supera el límite de 10MB.`);
        return;
      }
    }
    setComposeFiles(combined);
  }

  function removeComposeFile(index: number) {
    setComposeFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !composeFromBranchId) return;
    if (composeBody.trim().length === 0 && composeFiles.length === 0) return;

    setSending(true);
    setComposeError(null);
    try {
      const sent = await messageService.sendMessage(selectedId, {
        fromBranchId: composeFromBranchId,
        body: composeBody,
        files: composeFiles,
      });
      setMessages((prev) => (prev ? [...prev, sent] : [sent]));
      setComposeBody("");
      setComposeFiles([]);
      setConversations((prev) => {
        if (!prev) return prev;
        const updated = prev.map((c) =>
          c.id === selectedId ? { ...c, updatedAt: sent.createdAt, messages: [sent] } : c
        );
        return [...updated].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    } catch (err) {
      setComposeError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  function handleComposeKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e as unknown as FormEvent);
    }
  }

  function openNewConversationModal() {
    setNewConvToBranchId("");
    setNewConvFromBranchId(accessibleBranches.length === 1 ? accessibleBranches[0].id : "");
    setNewConvError(null);
    setModalOpen(true);
  }

  async function handleCreateConversation(e: FormEvent) {
    e.preventDefault();
    const fromId = accessibleBranches.length > 1 ? newConvFromBranchId : accessibleBranches[0]?.id;
    if (!fromId || !newConvToBranchId) return;

    setCreatingConv(true);
    setNewConvError(null);
    try {
      const conv = await messageService.startConversation(fromId, newConvToBranchId);
      const refreshed = await messageService.listConversations();
      setConversations(refreshed);
      const full = refreshed.find((c) => c.id === conv.id) ?? { ...conv, messages: [] };
      selectConversation(full);
      setModalOpen(false);
    } catch (err) {
      setNewConvError(err instanceof ApiError ? err.message : "No se pudo iniciar la conversación.");
    } finally {
      setCreatingConv(false);
    }
  }

  const effectiveNewConvFromBranchId = accessibleBranches.length > 1 ? newConvFromBranchId : accessibleBranches[0]?.id ?? "";
  const composeDisabled = sending || (composeBody.trim().length === 0 && composeFiles.length === 0) || !composeFromBranchId;

  return (
    <div className="messages-page">
      <div className="messages-page__header">
        <h1>Mensajes</h1>
        <button onClick={openNewConversationModal}><Plus size={16} /> Nueva conversación</button>
      </div>

      <div className="messages-layout">
        <aside className="messages-list">
          {conversationsStatus === "loading" && <StatusState kind="loading" compact />}
          {conversationsStatus === "error" && (
            <StatusState kind="error" compact message="No se pudieron cargar las conversaciones." />
          )}
          {conversationsStatus === "ready" && conversations?.length === 0 && (
            <StatusState kind="empty" compact message="Todavía no hay conversaciones." />
          )}
          {conversationsStatus === "ready" && conversations && conversations.length > 0 && (
            <ul className="messages-list__items">
              {conversations.map((conv) => {
                const last = conv.messages?.[0];
                const preview = last
                  ? last.body || (last.attachments.length > 0 ? `${last.attachments.length} archivo(s) adjunto(s)` : "")
                  : "Sin mensajes todavía";
                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      className={`messages-list__item${conv.id === selectedId ? " messages-list__item--active" : ""}`}
                      onClick={() => selectConversation(conv)}
                    >
                      <p className="messages-list__pair">{conversationLabel(conv)}</p>
                      <p className="messages-list__lastseen">
                        {conv.branchA.name}: {lastSeenText(conv.branchA.lastActivityAt)} · {conv.branchB.name}: {lastSeenText(conv.branchB.lastActivityAt)}
                      </p>
                      <p className="messages-list__preview">{preview}</p>
                      <span className="messages-list__time">{formatRelativeTime(conv.updatedAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="messages-thread">
          {!selectedId && (
            <div className="messages-thread__empty">
              <StatusState kind="empty" message="Selecciona una conversación para ver los mensajes." />
            </div>
          )}

          {selectedId && (
            <>
              <div className="messages-thread__scroll" ref={threadScrollRef}>
                {messagesStatus === "loading" && <StatusState kind="loading" />}
                {messagesStatus === "error" && <StatusState kind="error" message="No se pudieron cargar los mensajes." />}
                {messagesStatus === "ready" && messages && messages.length === 0 && (
                  <StatusState kind="empty" message="Todavía no hay mensajes en esta conversación." />
                )}
                {messagesStatus === "ready" &&
                  messages?.map((m) => (
                    <div key={m.id} className="message-bubble">
                      <div className="message-bubble__meta">
                        <Avatar
                          avatarStyle={m.author?.avatarStyle ?? "adventurer"}
                          avatarSeed={m.author?.avatarSeed ?? m.id}
                          displayName={m.author?.displayName ?? "Usuario"}
                          size="sm"
                        />
                        <div className="message-bubble__meta-text">
                          <span className="message-bubble__author">{m.author?.displayName ?? "Usuario eliminado"}</span>
                          <span className="message-bubble__sep">·</span>
                          <span className="message-bubble__branch">{m.fromBranch.name}</span>
                          <span className="message-bubble__sep">·</span>
                          <span className="message-bubble__time">{formatRelativeTime(m.createdAt)}</span>
                        </div>
                      </div>
                      {m.body && <p className="message-bubble__body">{m.body}</p>}
                      {m.attachments.length > 0 && (
                        <div className="message-bubble__attachments">
                          {m.attachments.map((a) => (
                            <a key={a.id} href={buildAttachmentUrl(a.url)} download className="attachment-chip">
                              <AttachmentIcon mimeType={a.mimeType} />
                              <span>{a.fileName}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              <form className="messages-compose" onSubmit={handleSend}>
                {accessibleForSelected.length > 1 && (
                  <select
                    className="messages-compose__from"
                    value={composeFromBranchId}
                    onChange={(e) => setComposeFromBranchId(e.target.value)}
                  >
                    {accessibleForSelected.map((b) => (
                      <option key={b.id} value={b.id}>Enviar como {b.name}</option>
                    ))}
                  </select>
                )}

                {composeError && <p className="messages-compose__error">{composeError}</p>}

                {composeFiles.length > 0 && (
                  <ul className="messages-compose__files">
                    {composeFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`}>
                        <span>{f.name}</span>
                        <button type="button" onClick={() => removeComposeFile(i)} aria-label={`Quitar ${f.name}`}>
                          <X size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="messages-compose__row">
                  <button
                    type="button"
                    className="messages-compose__attach"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Adjuntar archivo"
                    disabled={composeFiles.length >= MAX_FILES}
                  >
                    <Paperclip size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => { handleFilesSelected(e.target.files); e.target.value = ""; }}
                  />
                  <textarea
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    onKeyDown={handleComposeKeyDown}
                    placeholder="Escribe un mensaje..."
                    rows={1}
                  />
                  <button type="submit" className="messages-compose__send" disabled={composeDisabled} aria-label="Enviar mensaje">
                    <Send size={16} />
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva conversación">
        <form onSubmit={handleCreateConversation}>
          {accessibleBranches.length > 1 && (
            <label>
              Enviar como
              <select
                value={newConvFromBranchId}
                onChange={(e) => setNewConvFromBranchId(e.target.value)}
                required
              >
                <option value="">Selecciona tu sucursal</option>
                {accessibleBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Sucursal destino
            <select value={newConvToBranchId} onChange={(e) => setNewConvToBranchId(e.target.value)} required>
              <option value="">Selecciona una sucursal</option>
              {messagingBranches
                .filter((b) => b.id !== effectiveNewConvFromBranchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>{b.name} — {lastSeenText(b.lastActivityAt)}</option>
                ))}
            </select>
          </label>
          {newConvError && <p className="messages-page__modal-error">{newConvError}</p>}
          <button type="submit" disabled={creatingConv || !newConvToBranchId || !effectiveNewConvFromBranchId}>
            {creatingConv ? "Creando..." : "Iniciar conversación"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
