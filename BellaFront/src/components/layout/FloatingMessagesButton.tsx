import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { PermissionGate } from "../auth/PermissionGate";
import * as messageService from "../../services/messageService";
import "./FloatingMessagesButton.css";

const POLL_INTERVAL_MS = 30000;

function FloatingMessagesButtonInner() {
  const [count, setCount] = useState(0);
  // mounted/visible split mirrors Modal.tsx's own pattern: the DOM node is
  // fully removed (not just visually hidden) once the fade/scale-out
  // transition finishes, so an unread badge of 0 never leaves a dead node
  // sitting in the page.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      messageService
        .getUnreadCount()
        .then((res) => { if (!cancelled) setCount(res.count); })
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Refetch promptly whenever navigating AWAY from /mensajes, so reading
  // messages there is reflected right away instead of waiting up to 30s
  // for the next poll tick.
  useEffect(() => {
    if (location.pathname === "/admin/mensajes") return;
    messageService.getUnreadCount().then((res) => setCount(res.count)).catch(() => {});
  }, [location.pathname]);

  const hasUnread = count > 0;

  useEffect(() => {
    if (hasUnread) {
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hasUnread]);

  function handleTransitionEnd(e: React.TransitionEvent<HTMLButtonElement>) {
    if (e.target !== e.currentTarget) return;
    if (!hasUnread) setMounted(false);
  }

  if (!mounted) return null;

  const displayCount = count > 9 ? "9+" : String(count);

  return (
    <button
      type="button"
      className={`floating-messages-button${visible ? " floating-messages-button--visible" : ""}`}
      onClick={() => navigate("/admin/mensajes")}
      onTransitionEnd={handleTransitionEnd}
      aria-label={`Ir a Mensajes, ${count} conversación${count === 1 ? "" : "es"} sin leer`}
    >
      <MessageSquare size={22} />
      <span className="floating-messages-button__badge">{displayCount}</span>
    </button>
  );
}

// A user without messages.view shouldn't see this at all — same
// PermissionGate pattern used by Sidebar's nav items.
export function FloatingMessagesButton() {
  return (
    <PermissionGate code="messages.view">
      <FloatingMessagesButtonInner />
    </PermissionGate>
  );
}
