import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import {
  Plus,
  Paperclip,
  Send,
  X,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Search,
  Check,
  Trash2,
  Loader2,
  Users as UsersIcon,
} from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { AttachmentPreviewModal } from "../../components/common/AttachmentPreviewModal";
import { StatusState } from "../../components/common/StatusState";
import { Avatar } from "../../components/common/Avatar";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import * as messageService from "../../services/messageService";
import type { Conversation, ConversationParticipant, Message, MessageAttachment, MessagingParty } from "../../types/api";
import "./MessagesPage.css";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const EXCEL_MIME = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const GROUP_NAME_LABEL_LIMIT = 2;

// Same --stagger-delay custom-property pattern used across
// ProductsPage/InventoryPage/UsersPage/DashboardPage — the conversation
// list previously had no entrance animation at all (individual message
// bubbles already fade in via .message-row's own animation).
function staggerStyle(ms: number): CSSProperties {
  return { "--stagger-delay": `${ms}ms` } as unknown as CSSProperties;
}

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

// Branch is purely display context for "the other person" — computed live
// from their own allBranches/branches, never stored per-message.
function branchCaption(party: Pick<MessagingParty, "allBranches" | "branches">): string {
  if (party.allBranches) return "Todas las sucursales";
  if (party.branches.length === 0) return "Sin sucursal asignada";
  return party.branches.map((b) => b.name).join(", ");
}

function otherParticipant(conv: Conversation, myUserId: string | undefined): ConversationParticipant | null {
  if (conv.isGroup) return null;
  return conv.participants.find((p) => p.user.id !== myUserId) ?? null;
}

// "Ana, Luis +2 más" — the fallback display for a group with no `name` set.
function groupParticipantsLabel(conv: Conversation, myUserId: string | undefined): string {
  const others = conv.participants.filter((p) => p.user.id !== myUserId).map((p) => p.user.displayName);
  if (others.length <= GROUP_NAME_LABEL_LIMIT) return others.join(", ") || "Grupo";
  const shown = others.slice(0, GROUP_NAME_LABEL_LIMIT).join(", ");
  return `${shown} +${others.length - GROUP_NAME_LABEL_LIMIT} más`;
}

function conversationDisplayName(conv: Conversation, myUserId: string | undefined): string {
  if (!conv.isGroup) return otherParticipant(conv, myUserId)?.user.displayName ?? "Usuario";
  return conv.name?.trim() || groupParticipantsLabel(conv, myUserId);
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon size={14} />;
  if (mimeType === "application/pdf") return <FileText size={14} />;
  if (EXCEL_MIME.has(mimeType)) return <FileSpreadsheet size={14} />;
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
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [startingConversation, setStartingConversation] = useState(false);
  const [newConvError, setNewConvError] = useState<string | null>(null);

  const [confirmHideId, setConfirmHideId] = useState<string | null>(null);
  const [hidingId, setHidingId] = useState<string | null>(null);

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
      .then(({ conversation, messages: msgs }) => {
        setMessages(msgs);
        setMessagesStatus("ready");
        // Viewing IS reading (server-side side effect of the same GET) —
        // reflect that immediately in local state: refresh this
        // conversation's participants (so the "Visto" indicator and any
        // group participant list use fresh data) and zero its unread
        // badge, without waiting for a full list refetch.
        setConversations((prev) =>
          prev
            ? prev.map((c) =>
                c.id === selectedId ? { ...c, participants: conversation.participants, unreadCount: 0 } : c
              )
            : prev
        );
      })
      .catch(() => setMessagesStatus("error"));
  }, [selectedId]);

  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const selectedConversation = conversations?.find((c) => c.id === selectedId) ?? null;
  const selectedOtherParticipant = selectedConversation ? otherParticipant(selectedConversation, user?.id) : null;

  // The id of the LAST message I sent in the open thread — "Visto" only
  // ever renders under this one, never older messages of mine, and never
  // in a group.
  const lastMineMessageId = useMemo(() => {
    if (!messages || selectedConversation?.isGroup) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].author.id === user?.id) return messages[i].id;
    }
    return null;
  }, [messages, selectedConversation?.isGroup, user?.id]);

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
        setComposeError(`Formato no permitido para "${f.name}". Solo JPG, PNG, WEBP, PDF o Excel.`);
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
    setSelectedPeopleIds([]);
    setGroupName("");
    setNewConvError(null);
    setModalOpen(true);
  }

  function togglePerson(personId: string) {
    setSelectedPeopleIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    );
  }

  async function handleStartConversation() {
    if (selectedPeopleIds.length === 0) return;
    setStartingConversation(true);
    setNewConvError(null);
    try {
      const isGroup = selectedPeopleIds.length >= 2;
      const conv = await messageService.startConversation(
        selectedPeopleIds,
        isGroup ? groupName.trim() || null : null
      );
      const refreshed = await messageService.listConversations();
      setConversations(refreshed);
      const full = refreshed.find((c) => c.id === conv.id) ?? conv;
      selectConversation(full);
      setModalOpen(false);
    } catch (err) {
      setNewConvError(err instanceof ApiError ? err.message : "No se pudo iniciar la conversación.");
    } finally {
      setStartingConversation(false);
    }
  }

  async function handleHideConversation(conversationId: string) {
    setHidingId(conversationId);
    try {
      await messageService.hideConversation(conversationId);
      setConversations((prev) => (prev ? prev.filter((c) => c.id !== conversationId) : prev));
      if (selectedId === conversationId) {
        setSelectedId(null);
        setMessages(null);
      }
    } catch {
      // Non-fatal — leave the row in place, the confirm state resets below
      // so the user can just try again.
    } finally {
      setHidingId(null);
      setConfirmHideId(null);
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
              {conversations.map((conv, i) => {
                const other = otherParticipant(conv, user?.id);
                const displayName = conversationDisplayName(conv, user?.id);
                const last = conv.messages?.[0];
                const preview = last
                  ? last.body || (last.attachments.length > 0 ? `${last.attachments.length} archivo(s) adjunto(s)` : "")
                  : "Sin mensajes todavía";
                const isConfirming = confirmHideId === conv.id;
                return (
                  <li
                    key={conv.id}
                    className="messages-list__row animate-in-stagger"
                    style={staggerStyle(Math.min(i, 12) * 35)}
                  >
                    <button
                      type="button"
                      className={`messages-list__item${conv.id === selectedId ? " messages-list__item--active" : ""}`}
                      onClick={() => selectConversation(conv)}
                    >
                      {conv.isGroup ? (
                        <span className="messages-list__group-avatar" aria-hidden="true"><UsersIcon size={18} /></span>
                      ) : (
                        <Avatar
                          avatarStyle={other?.user.avatarStyle ?? "adventurer"}
                          avatarSeed={other?.user.avatarSeed ?? conv.id}
                          displayName={displayName}
                          size="md"
                        />
                      )}
                      <div className="messages-list__item-text">
                        <div className="messages-list__item-row">
                          <p className="messages-list__name">{displayName}</p>
                          <span className="messages-list__time">{formatRelativeTime(conv.updatedAt)}</span>
                        </div>
                        <p className="messages-list__caption">
                          {conv.isGroup ? (
                            <span className="messages-list__role-badge">{conv.participants.length} participantes</span>
                          ) : (
                            <>
                              <span className="messages-list__role-badge">{other?.user.role.name}</span>
                              <span className="messages-list__dot">·</span>
                              <span className="messages-list__caption-branch">{other ? branchCaption(other.user) : ""}</span>
                            </>
                          )}
                        </p>
                        <p className="messages-list__preview">{preview}</p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="messages-list__unread-badge" aria-label={`${conv.unreadCount} sin leer`}>
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      )}
                    </button>

                    <div className="messages-list__row-actions">
                      {isConfirming ? (
                        <>
                          <button
                            type="button"
                            className="messages-list__hide-confirm messages-list__hide-confirm--yes"
                            onClick={() => handleHideConversation(conv.id)}
                            disabled={hidingId === conv.id}
                          >
                            {hidingId === conv.id ? <Loader2 size={12} className="spin" /> : "Sí"}
                          </button>
                          <button
                            type="button"
                            className="messages-list__hide-confirm messages-list__hide-confirm--no"
                            onClick={() => setConfirmHideId(null)}
                            disabled={hidingId === conv.id}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="messages-list__hide-trigger"
                          onClick={() => setConfirmHideId(conv.id)}
                          title="Eliminar para mí"
                          aria-label="Eliminar para mí"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
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
                {selectedConversation.isGroup ? (
                  <span className="messages-list__group-avatar" aria-hidden="true"><UsersIcon size={18} /></span>
                ) : (
                  <Avatar
                    avatarStyle={selectedOtherParticipant?.user.avatarStyle ?? "adventurer"}
                    avatarSeed={selectedOtherParticipant?.user.avatarSeed ?? selectedConversation.id}
                    displayName={conversationDisplayName(selectedConversation, user?.id)}
                    size="sm"
                  />
                )}
                <div className="messages-thread__header-text">
                  <p className="messages-thread__header-name">{conversationDisplayName(selectedConversation, user?.id)}</p>
                  <p className="messages-thread__header-caption">
                    {selectedConversation.isGroup ? (
                      <span>
                        {selectedConversation.participants
                          .filter((p) => p.user.id !== user?.id)
                          .map((p) => p.user.displayName)
                          .join(", ")}
                      </span>
                    ) : (
                      selectedOtherParticipant && (
                        <>
                          <span className="messages-list__role-badge">{selectedOtherParticipant.user.role.name}</span>
                          <span className="messages-list__dot">·</span>
                          {branchCaption(selectedOtherParticipant.user)}
                          <span className="messages-list__dot">·</span>
                          {lastSeenText(selectedOtherParticipant.user.lastLoginAt)}
                        </>
                      )
                    )}
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
                    const showSeen =
                      mine &&
                      !selectedConversation.isGroup &&
                      m.id === lastMineMessageId &&
                      !!selectedOtherParticipant?.lastReadAt &&
                      new Date(m.createdAt).getTime() <= new Date(selectedOtherParticipant.lastReadAt).getTime();
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
                        <div className="message-row__stack">
                          <div className={`message-bubble${mine ? " message-bubble--mine" : " message-bubble--theirs"}`}>
                            {!mine && selectedConversation.isGroup && (
                              <span className="message-bubble__author">{m.author.displayName}</span>
                            )}
                            {m.body && <p className="message-bubble__body">{m.body}</p>}
                            {m.attachments.length > 0 && (
                              <div className="message-bubble__attachments">
                                {m.attachments.map((a) => (
                                  <button
                                    key={a.id}
                                    type="button"
                                    className="attachment-chip"
                                    onClick={() => setPreviewAttachment(a)}
                                  >
                                    <AttachmentIcon mimeType={a.mimeType} />
                                    <span>{a.fileName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <span className="message-bubble__time">{formatRelativeTime(m.createdAt)}</span>
                          </div>
                          {showSeen && <span className="message-row__seen">Visto</span>}
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
                    accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            {filteredPeople.map((person) => {
              const selected = selectedPeopleIds.includes(person.id);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    className={`people-picker__row${selected ? " people-picker__row--selected" : ""}`}
                    onClick={() => togglePerson(person.id)}
                    aria-pressed={selected}
                    disabled={startingConversation}
                  >
                    <span className={`people-picker__checkbox${selected ? " people-picker__checkbox--checked" : ""}`} aria-hidden="true">
                      {selected && <Check size={12} />}
                    </span>
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
                  </button>
                </li>
              );
            })}
          </ul>

          {selectedPeopleIds.length >= 2 && (
            <div className="people-picker__group-name">
              <label htmlFor="messages-group-name">Nombre del grupo (opcional)</label>
              <input
                id="messages-group-name"
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ej. Equipo Sucursal Norte"
                maxLength={120}
              />
            </div>
          )}

          <div className="people-picker__footer">
            <span className="people-picker__selected-count">
              {selectedPeopleIds.length === 0
                ? "Selecciona al menos una persona"
                : `${selectedPeopleIds.length} seleccionado${selectedPeopleIds.length === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              className="people-picker__submit"
              onClick={handleStartConversation}
              disabled={selectedPeopleIds.length === 0 || startingConversation}
            >
              {startingConversation && <Loader2 size={14} className="spin" />}
              Iniciar conversación
            </button>
          </div>
        </div>
      </Modal>

      <AttachmentPreviewModal
        attachment={previewAttachment}
        open={previewAttachment !== null}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
}
