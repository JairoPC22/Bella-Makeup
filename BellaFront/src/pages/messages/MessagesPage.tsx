import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, Paperclip, Send, X, FileText, Image as ImageIcon, Search } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { StatusState } from "../../components/common/StatusState";
import { Avatar } from "../../components/common/Avatar";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import * as messageService from "../../services/messageService";
import { buildAttachmentUrl } from "../../services/messageService";
import type { Conversation, Message, MessagingParty } from "../../types/api";
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

// Reuses formatRelativeTime (same helper used for message timestamps) so
// "last seen" and message times read consistently instead of introducing a
// second relative-time implementation.
function lastSeenText(lastLoginAt: string | null): string {
  return lastLoginAt ? `última conexión ${formatRelativeTime(lastLoginAt).toLowerCase()}` : "nunca ha iniciado sesión";
}

// Branch is now purely display context for "the other person" — computed
// live from their own allBranches/branches, never stored per-message.
function branchCaption(party: Pick<MessagingParty, "allBranches" | "branches">): string {
  if (party.allBranches) return "Todas las sucursales";
  if (party.branches.length === 0) return "Sin sucursal asignada";
  return party.branches.map((b) => b.name).join(", ");
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon size={14} />;
  if (mimeType === "application/pdf") return <FileText size={14} />;
  return <Paperclip size={14} />;
}

export function MessagesPage() {
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [conversationsStatus, setConversationsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [messagingUsers, setMessagingUsers] = useState<MessagingParty[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [messagesStatus, setMessagesStatus] = useState<"loading" | "ready" | "error">("loading");

  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [newConvError, setNewConvError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageService.listConversations()
      .then((list) => { setConversations(list); setConversationsStatus("ready"); })
      .catch(() => setConversationsStatus("error"));
    messageService.listMessagingUsers().then(setMessagingUsers).catch(() => {});
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

  const selectedConversation = conversations?.find((c) => c.id === selectedId) ?? null;

  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return messagingUsers;
    return messagingUsers.filter((p) => {
      const haystack = [p.displayName, p.role.name, ...p.branches.map((b) => b.name)].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [messagingUsers, peopleSearch]);

  function selectConversation(conv: Conversation) {
    setSelectedId(conv.id);
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
    if (!selectedId) return;
    if (composeBody.trim().length === 0 && composeFiles.length === 0) return;

    setSending(true);
    setComposeError(null);
    try {
      const sent = await messageService.sendMessage(selectedId, {
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
    setPeopleSearch("");
    setNewConvError(null);
    setModalOpen(true);
  }

  async function handleStartConversation(person: MessagingParty) {
    setStartingUserId(person.id);
    setNewConvError(null);
    try {
      const conv = await messageService.startConversation(person.id);
      const refreshed = await messageService.listConversations();
      setConversations(refreshed);
      const full = refreshed.find((c) => c.id === conv.id) ?? { ...conv, messages: [] };
      selectConversation(full);
      setModalOpen(false);
    } catch (err) {
      setNewConvError(err instanceof ApiError ? err.message : "No se pudo iniciar la conversación.");
    } finally {
      setStartingUserId(null);
    }
  }

  const composeDisabled = sending || (composeBody.trim().length === 0 && composeFiles.length === 0);

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
                const other = conv.otherUser;
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
                      <Avatar avatarStyle={other.avatarStyle} avatarSeed={other.avatarSeed} displayName={other.displayName} size="md" />
                      <div className="messages-list__item-text">
                        <div className="messages-list__item-row">
                          <p className="messages-list__name">{other.displayName}</p>
                          <span className="messages-list__time">{formatRelativeTime(conv.updatedAt)}</span>
                        </div>
                        <p className="messages-list__caption">
                          <span className="messages-list__role-badge">{other.role.name}</span>
                          <span className="messages-list__dot">·</span>
                          <span className="messages-list__caption-branch">{branchCaption(other)}</span>
                        </p>
                        <p className="messages-list__preview">{preview}</p>
                      </div>
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

          {selectedId && selectedConversation && (
            <>
              <div className="messages-thread__header">
                <Avatar
                  avatarStyle={selectedConversation.otherUser.avatarStyle}
                  avatarSeed={selectedConversation.otherUser.avatarSeed}
                  displayName={selectedConversation.otherUser.displayName}
                  size="sm"
                />
                <div className="messages-thread__header-text">
                  <p className="messages-thread__header-name">{selectedConversation.otherUser.displayName}</p>
                  <p className="messages-thread__header-caption">
                    <span className="messages-list__role-badge">{selectedConversation.otherUser.role.name}</span>
                    <span className="messages-list__dot">·</span>
                    {branchCaption(selectedConversation.otherUser)}
                    <span className="messages-list__dot">·</span>
                    {lastSeenText(selectedConversation.otherUser.lastLoginAt)}
                  </p>
                </div>
              </div>

              <div className="messages-thread__scroll" ref={threadScrollRef}>
                {messagesStatus === "loading" && <StatusState kind="loading" />}
                {messagesStatus === "error" && <StatusState kind="error" message="No se pudieron cargar los mensajes." />}
                {messagesStatus === "ready" && messages && messages.length === 0 && (
                  <StatusState kind="empty" message="Todavía no hay mensajes en esta conversación." />
                )}
                {messagesStatus === "ready" &&
                  messages?.map((m) => {
                    const mine = m.author.id === user?.id;
                    return (
                      <div key={m.id} className={`message-row${mine ? " message-row--mine" : " message-row--theirs"}`}>
                        {!mine && (
                          <Avatar
                            avatarStyle={m.author.avatarStyle}
                            avatarSeed={m.author.avatarSeed}
                            displayName={m.author.displayName}
                            size="sm"
                          />
                        )}
                        <div className={`message-bubble${mine ? " message-bubble--mine" : " message-bubble--theirs"}`}>
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
                          <span className="message-bubble__time">{formatRelativeTime(m.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <form className="messages-compose" onSubmit={handleSend}>
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
        <div className="people-picker">
          <div className="people-picker__search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar por nombre, rol o sucursal..."
              value={peopleSearch}
              onChange={(e) => setPeopleSearch(e.target.value)}
              autoFocus
            />
          </div>

          {newConvError && <p className="messages-page__modal-error">{newConvError}</p>}

          <ul className="people-picker__list">
            {filteredPeople.length === 0 && (
              <li className="people-picker__empty">Nadie coincide con tu búsqueda.</li>
            )}
            {filteredPeople.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="people-picker__row"
                  onClick={() => handleStartConversation(person)}
                  disabled={startingUserId !== null}
                >
                  <Avatar avatarStyle={person.avatarStyle} avatarSeed={person.avatarSeed} displayName={person.displayName} size="md" />
                  <div className="people-picker__row-text">
                    <p className="people-picker__name">{person.displayName}</p>
                    <p className="people-picker__caption">
                      <span className="messages-list__role-badge">{person.role.name}</span>
                      <span className="messages-list__dot">·</span>
                      {branchCaption(person)}
                    </p>
                    <p className="people-picker__lastseen">{lastSeenText(person.lastLoginAt)}</p>
                  </div>
                  {startingUserId === person.id && <span className="people-picker__spinner" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
