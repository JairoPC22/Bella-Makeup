import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { PermissionGate } from "../auth/PermissionGate";
import * as messageService from "../../services/messageService";
import "./FloatingMessagesButton.css";

const POLL_INTERVAL_MS = 30000;

function FloatingMessagesButtonInner() {
  const [count, setCount] = useState(0);
  // Patrón mounted/visible (igual que Modal.tsx): el nodo se elimina del DOM
  // por completo al terminar la transición de salida, no solo se oculta.
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

  // Vuelve a consultar al salir de /mensajes, para reflejar la lectura de
  // inmediato en vez de esperar hasta 30s al siguiente sondeo.
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

// Un usuario sin messages.view no debe ver esto, mismo patrón de
// PermissionGate que usan los ítems de navegación del Sidebar.
export function FloatingMessagesButton() {
  return (
    <PermissionGate code="messages.view">
      <FloatingMessagesButtonInner />
    </PermissionGate>
  );
}
