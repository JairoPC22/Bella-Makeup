import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { PermissionGate } from "../auth/PermissionGate";
import { useAuth } from "../../hooks/useAuth";
import * as orderService from "../../services/orderService";
import type { OnlineOrder } from "../../types/api";
import { StatusState } from "../common/StatusState";
import "./NotificationBell.css";

const POLL_INTERVAL_MS = 30000;
const MAX_PREVIEW = 5;

import { currencyFormatter } from "../../utils/currency";

const FULFILLMENT_LABEL: Record<OnlineOrder["fulfillmentType"], string> = {
  PICKUP: "Recoger en tienda",
  DELIVERY: "Entrega a domicilio",
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Justo ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `Hace ${diffHr} h`;
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function NotificationBellInner() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  // Se define hasta que resuelve el primer sondeo, para que esa carga inicial
  // no dispare la animación de "nuevo pedido" (solo un aumento real entre sondeos).
  const previousCountRef = useRef<number | null>(null);
  const [justArrived, setJustArrived] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      const branchId = !user?.allBranches && user?.branches.length === 1 ? user.branches[0].id : undefined;
      orderService
        .listOrders({ status: "PENDING", branchId })
        .then((res) => {
          if (cancelled) return;
          const previous = previousCountRef.current;
          if (previous !== null && res.length > previous) {
            setJustArrived(true);
          }
          previousCountRef.current = res.length;
          setOrders(res);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  // Cierra al hacer clic afuera, igual que UserMenu.tsx / DateRangePicker.tsx.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const count = orders.length;
  const hasPending = count > 0;
  const displayCount = count > 9 ? "9+" : String(count);
  const preview = orders.slice(0, MAX_PREVIEW);

  function handleAnimationEnd() {
    setJustArrived(false);
  }

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        type="button"
        className={`notification-bell__trigger${justArrived ? " notification-bell__trigger--pulse" : ""}`}
        onClick={() => setOpen((o) => !o)}
        onAnimationEnd={handleAnimationEnd}
        aria-label={hasPending ? `Notificaciones, ${count} pedido${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"}` : "Notificaciones"}
      >
        <Bell size={19} />
        {hasPending && <span className="notification-bell__badge">{displayCount}</span>}
      </button>

      {open && (
        <div className="notification-bell__dropdown" role="dialog" aria-label="Pedidos pendientes">
          <div className="notification-bell__header">
            <span>Pedidos pendientes</span>
          </div>

          {loading && orders.length === 0 ? (
            <StatusState kind="loading" compact message="Buscando pedidos..." />
          ) : !hasPending ? (
            <StatusState kind="empty" compact message="No hay pedidos pendientes" />
          ) : (
            <ul className="notification-bell__list">
              {preview.map((order) => (
                <li key={order.id}>
                  <Link to="/admin/pedidos" className="notification-bell__item" onClick={() => setOpen(false)}>
                    <div className="notification-bell__item-row">
                      <span className="notification-bell__item-number">{order.orderNumber}</span>
                      <span className="notification-bell__item-total">{currencyFormatter.format(Number(order.total))}</span>
                    </div>
                    <div className="notification-bell__item-row">
                      <span className="notification-bell__item-customer">{order.customerName}</span>
                      <span className="notification-bell__item-time">{formatRelativeTime(order.createdAt)}</span>
                    </div>
                    <span className="notification-bell__item-fulfillment">{FULFILLMENT_LABEL[order.fulfillmentType]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link to="/admin/pedidos" className="notification-bell__view-all" onClick={() => setOpen(false)}>
            Ver todos los pedidos
          </Link>
        </div>
      )}
    </div>
  );
}

// Un usuario sin orders.view (la mayoría de roles de caja/almacén) no debe
// ver nada aquí, mismo patrón de PermissionGate usado en toda la app.
export function NotificationBell() {
  return (
    <PermissionGate code="orders.view">
      <NotificationBellInner />
    </PermissionGate>
  );
}
