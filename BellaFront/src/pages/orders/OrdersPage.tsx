import { useCallback, useEffect, useState } from "react";
import {
  ShoppingBag,
  Eye,
  AlertTriangle,
  Loader2,
  Ban,
  Clock,
  Truck,
  Store,
  CheckCircle2,
  XCircle,
  User,
  Phone,
  Mail,
  ArrowRight,
} from "lucide-react";
import { staggerStyle } from "../../utils/staggerStyle";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { DateRangePicker } from "../../components/common/DateRangePicker";
import { Modal } from "../../components/common/Modal";
import { Badge } from "../../components/common/Badge";
import CodeSlots from "../../components/common/CodeSlots";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { ReportExportButtons } from "../../components/common/ReportExportButtons";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as orderService from "../../services/orderService";
import type { OnlineOrder, OnlineOrderStatus } from "../../types/api";
import type { ReportColumn } from "../../utils/reportExport";
import "./OrdersPage.css";

import { currencyFormatter } from "../../utils/currency";

const STATUS_LABEL: Record<OnlineOrderStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  READY: "Listo",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

// READY/COMPLETED se leen distinto según cómo sale el pedido de la tienda
// (recoger vs entregar). Los demás estados no dependen del tipo de entrega.
function statusLabelFor(status: OnlineOrderStatus, fulfillmentType: OnlineOrder["fulfillmentType"]): string {
  if (status === "READY") return fulfillmentType === "DELIVERY" ? "Enviado" : "Listo para recoger";
  if (status === "COMPLETED") return fulfillmentType === "DELIVERY" ? "Recibido" : "Recogido";
  return STATUS_LABEL[status];
}

// Badge.tsx solo soporta estos tres tonos; los seis estados se mapean a
// ellos y se distinguen los intermedios (CONFIRMED/PREPARING/READY) con
// texto e ícono aunque compartan el tono "neutral".
const STATUS_TONE: Record<OnlineOrderStatus, "success" | "neutral" | "danger"> = {
  PENDING: "neutral",
  CONFIRMED: "neutral",
  PREPARING: "neutral",
  READY: "neutral",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const FULFILLMENT_LABEL: Record<OnlineOrder["fulfillmentType"], string> = {
  PICKUP: "Recoger en tienda",
  DELIVERY: "A domicilio",
};

const PAYMENT_METHOD_LABEL: Record<OnlineOrder["paymentMethod"], string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
};

// Pipeline fijo de un paso a la vez: el backend rechaza saltarse pasos, así
// que la UI solo ofrece el siguiente estado, nunca un selector libre.
const STATUS_SEQUENCE: OnlineOrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

function nextStatusActionLabel(status: OnlineOrderStatus, fulfillmentType: OnlineOrder["fulfillmentType"]): string | undefined {
  if (status === "PENDING") return "Confirmar pedido";
  if (status === "CONFIRMED") return "Empezar a preparar";
  if (status === "PREPARING") return fulfillmentType === "DELIVERY" ? "Marcar como enviado" : "Marcar como listo para recoger";
  if (status === "READY") return fulfillmentType === "DELIVERY" ? "Marcar como recibido (genera venta)" : "Marcar como recogido (genera venta)";
  return undefined;
}

function nextStatus(status: OnlineOrderStatus): OnlineOrderStatus | null {
  const idx = STATUS_SEQUENCE.indexOf(status);
  if (idx === -1 || idx === STATUS_SEQUENCE.length - 1) return null;
  return STATUS_SEQUENCE[idx + 1];
}

// No hay proveedor de email/SMS configurado en el proyecto, así que una
// notificación "automática" por correo no sería real. WhatsApp sí es un
// canal real (el número de la empresa está en Configuración y wa.me no
// necesita backend). Esto arma el mensaje y lo deja a un clic de enviarse.
function buildWhatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function statusChangeMessage(order: OnlineOrder): string {
  const name = order.customerName.trim().split(" ")[0] || order.customerName;
  if (order.status === "CANCELLED") {
    return `Hola ${name}, tu pedido ${order.orderNumber} en Bella Makeup fue cancelado.${order.cancelReason ? ` Motivo: ${order.cancelReason}.` : ""} Si tienes dudas, con gusto te ayudamos.`;
  }
  if (order.status === "READY") {
    if (order.fulfillmentType === "DELIVERY") {
      return `Hola ${name}, tu pedido ${order.orderNumber} en Bella Makeup ya salió para entrega. ¡Gracias por tu compra!`;
    }
    // Los pedidos de recoger llevan su código de verificación en el mismo
    // mensaje; el cliente lo entrega al personal, que lo captura con CodeSlots.
    const codeLine = order.pickupCode ? ` Tu código para recoger es ${order.pickupCode}.` : "";
    return `Hola ${name}, tu pedido ${order.orderNumber} en Bella Makeup ya está listo para recoger en ${order.branch.name}.${codeLine}`;
  }
  if (order.status === "COMPLETED") {
    return `Hola ${name}, tu pedido ${order.orderNumber} en Bella Makeup fue entregado. ¡Gracias por tu compra!`;
  }
  if (order.status === "CONFIRMED") {
    return `Hola ${name}, confirmamos tu pedido ${order.orderNumber} en Bella Makeup. Te avisaremos cuando esté listo.`;
  }
  return `Hola ${name}, tu pedido ${order.orderNumber} en Bella Makeup está en preparación.`;
}

type FetchStatus = "loading" | "ready" | "error";

// Los inputs `datetime-local` necesitan "YYYY-MM-DDTHH:mm" en hora local,
// sin sufijo de zona horaria; toISOString() mostraría la hora en UTC.
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OrdersPage() {
  const { user } = useAuth();

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!user) return;
    if (user.allBranches) {
      branchService.listBranches().then(setBranches).catch(() => {});
    } else {
      setBranches(user.branches);
    }
  }, [user]);

  // Misma lógica que showBranchFilter en SalesPage/TransfersPage: solo se
  // muestra si en verdad hay opción de elegir.
  const showBranchFilter = !!user?.allBranches || (user?.branches.length ?? 0) > 1;

  const [orders, setOrders] = useState<OnlineOrder[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState<OnlineOrderStatus | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadOrders = useCallback(() => {
    setStatus("loading");
    orderService
      .listOrders({
        branchId: branchId || undefined,
        status: statusFilter || undefined,
        // Misma convención de fin de día inclusivo que SalesPage/TransfersPage.
        from: fromDate ? `${fromDate}T00:00:00.000` : undefined,
        to: toDate ? `${toDate}T23:59:59.999` : undefined,
      })
      .then((rows) => { setOrders(rows); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [branchId, statusFilter, fromDate, toDate]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const rows = orders ?? [];

  const reportColumns: ReportColumn<OnlineOrder>[] = [
    { header: "Folio", accessor: (o) => o.orderNumber },
    { header: "Fecha", accessor: (o) => new Date(o.createdAt).toLocaleString("es-MX") },
    { header: "Sucursal", accessor: (o) => o.branch.name },
    { header: "Cliente", accessor: (o) => o.customerName },
    { header: "Entrega", accessor: (o) => FULFILLMENT_LABEL[o.fulfillmentType] },
    { header: "Total", accessor: (o) => currencyFormatter.format(Number(o.total)) },
    { header: "Estado", accessor: (o) => statusLabelFor(o.status, o.fulfillmentType) },
    { header: "Venta final", accessor: (o) => o.saleNumber ?? "—" },
  ];

  const activeFilterParts: string[] = [];
  if (branchId) activeFilterParts.push(`Sucursal: ${branches.find((b) => b.id === branchId)?.name ?? branchId}`);
  if (statusFilter) activeFilterParts.push(`Estado: ${STATUS_LABEL[statusFilter]}`);
  if (fromDate) activeFilterParts.push(`Desde: ${fromDate}`);
  if (toDate) activeFilterParts.push(`Hasta: ${toDate}`);
  const filtersSummary = activeFilterParts.length > 0 ? activeFilterParts.join(" · ") : undefined;

  // ---------- Modal de detalle ----------
  const [selectedOrder, setSelectedOrder] = useState<OnlineOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  // Solo se pide al avanzar un pedido PICKUP a COMPLETED (el backend valida
  // si realmente se requiere el código).
  const [pickupCodeInput, setPickupCodeInput] = useState("");

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [etaValue, setEtaValue] = useState("");
  const [etaSaving, setEtaSaving] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);

  // Se activa justo después de un cambio de estado exitoso (avanzar o
  // cancelar), para mostrar el aviso de WhatsApp solo cuando hay algo nuevo
  // que comunicar; no se muestra al guardar solo el ETA.
  const [notifyStatusChange, setNotifyStatusChange] = useState(false);

  function openDetail(order: OnlineOrder) {
    setSelectedOrder(order);
    setDetailOpen(true);
    setAdvanceError(null);
    setConfirmCancel(false);
    setCancelReason("");
    setCancelError(null);
    setEtaValue(toDatetimeLocalValue(order.estimatedReadyAt));
    setEtaError(null);
    setNotifyStatusChange(false);
    setPickupCodeInput("");
  }

  function applyUpdatedOrder(updated: OnlineOrder, statusChanged = false) {
    setSelectedOrder(updated);
    setOrders((prev) => (prev ? prev.map((o) => (o.id === updated.id ? updated : o)) : prev));
    if (statusChanged) setNotifyStatusChange(true);
  }

  // Un pedido PICKUP necesita su código de 6 dígitos antes de pasar a
  // COMPLETED; esta bandera solo decide si mostrar el CodeSlots y bloquear
  // el botón, la validación real la hace el backend.
  const needsPickupCode = selectedOrder?.fulfillmentType === "PICKUP" && nextStatus(selectedOrder.status) === "COMPLETED";

  async function handleAdvance() {
    if (!selectedOrder) return;
    const next = nextStatus(selectedOrder.status);
    if (!next || next === "PENDING") return;
    if (needsPickupCode && pickupCodeInput.length !== 6) return;
    setAdvanceSaving(true);
    setAdvanceError(null);
    try {
      const updated = await orderService.updateOrderStatus(selectedOrder.id, next, undefined, needsPickupCode ? pickupCodeInput : undefined);
      applyUpdatedOrder(updated, true);
      setPickupCodeInput("");
    } catch (err) {
      setAdvanceError(err instanceof ApiError ? err.message : "No se pudo actualizar el pedido.");
    } finally {
      setAdvanceSaving(false);
    }
  }

  // Igual que handleConfirmCancel en SalesPage.tsx.
  async function handleConfirmCancel() {
    if (!selectedOrder) return;
    if (cancelReason.trim().length < 3) {
      setCancelError("El motivo debe tener al menos 3 caracteres.");
      return;
    }
    setCancelSaving(true);
    setCancelError(null);
    try {
      const updated = await orderService.updateOrderStatus(selectedOrder.id, "CANCELLED", cancelReason.trim());
      applyUpdatedOrder(updated, true);
      setConfirmCancel(false);
      setCancelReason("");
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "No se pudo cancelar el pedido.");
    } finally {
      setCancelSaving(false);
    }
  }

  async function handleSaveEta() {
    if (!selectedOrder || !etaValue) return;
    setEtaSaving(true);
    setEtaError(null);
    try {
      // datetime-local no lleva sufijo de zona horaria, el constructor Date
      // lo interpreta como hora local, igual que se mostraba en el input.
      const iso = new Date(etaValue).toISOString();
      const updated = await orderService.setOrderEta(selectedOrder.id, iso);
      applyUpdatedOrder(updated);
    } catch (err) {
      setEtaError(err instanceof ApiError ? err.message : "No se pudo guardar el tiempo estimado.");
    } finally {
      setEtaSaving(false);
    }
  }

  async function handleClearEta() {
    if (!selectedOrder) return;
    setEtaSaving(true);
    setEtaError(null);
    try {
      const updated = await orderService.setOrderEta(selectedOrder.id, null);
      applyUpdatedOrder(updated);
      setEtaValue("");
    } catch (err) {
      setEtaError(err instanceof ApiError ? err.message : "No se pudo quitar el tiempo estimado.");
    } finally {
      setEtaSaving(false);
    }
  }

  const isTerminal = selectedOrder ? selectedOrder.status === "COMPLETED" || selectedOrder.status === "CANCELLED" : true;
  const next = selectedOrder ? nextStatus(selectedOrder.status) : null;
  const advanceLabel = selectedOrder ? nextStatusActionLabel(selectedOrder.status, selectedOrder.fulfillmentType) : undefined;

  return (
    <div className="orders-page">
      <div className="orders-page__header">
        <div className="orders-page__title">
          <ShoppingBag size={22} />
          <h1>Pedidos</h1>
        </div>
      </div>
      <p className="orders-page__subtitle">
        Administra los pedidos realizados por clientes en la tienda en línea: confírmalos, prepáralos y márcalos
        como listos hasta completar la venta.
      </p>

      <div className="orders-filters">
        {showBranchFilter && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OnlineOrderStatus | "")}>
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="PREPARING">Preparando</option>
          <option value="READY">Listo</option>
          <option value="COMPLETED">Completado</option>
          <option value="CANCELLED">Cancelado</option>
        </Select>
        <DateRangePicker from={fromDate} to={toDate} onChange={(r) => { setFromDate(r.from); setToDate(r.to); }} />
        <ReportExportButtons
          title="Reporte de Pedidos"
          columns={reportColumns}
          rows={rows}
          filtersSummary={filtersSummary}
          fileBaseName="pedidos"
        />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar el historial de pedidos." />}
      {status === "ready" && rows.length === 0 && (
        <StatusState kind="empty" message="No hay pedidos que coincidan con estos filtros." />
      )}

      {status === "ready" && rows.length > 0 && (
        <table className="orders-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Sucursal</th>
              <th>Entrega</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Tiempo estimado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order, i) => (
              <tr key={order.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td className="orders-table__folio">{order.orderNumber}</td>
                <td>{new Date(order.createdAt).toLocaleString("es-MX")}</td>
                <td>{order.customerName}</td>
                <td>{order.branch.name}</td>
                <td>
                  <span className="orders-table__fulfillment">
                    {order.fulfillmentType === "DELIVERY" ? <Truck size={14} /> : <Store size={14} />}
                    {FULFILLMENT_LABEL[order.fulfillmentType]}
                  </span>
                </td>
                <td className="orders-table__total">{currencyFormatter.format(Number(order.total))}</td>
                <td>
                  <Badge tone={STATUS_TONE[order.status]}>{statusLabelFor(order.status, order.fulfillmentType)}</Badge>
                </td>
                <td className="orders-table__eta">
                  {order.estimatedReadyAt ? new Date(order.estimatedReadyAt).toLocaleString("es-MX") : "Sin definir"}
                </td>
                <td>
                  <button type="button" className="orders-table__view" onClick={() => openDetail(order)}>
                    <Eye size={15} /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- Detail modal ---------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedOrder ? `Pedido ${selectedOrder.orderNumber}` : "Pedido"}
        className="order-detail-modal"
      >
        {selectedOrder && (
          <div className="order-detail">
            <div className="order-detail__status-row">
              <Badge tone={STATUS_TONE[selectedOrder.status]}>{statusLabelFor(selectedOrder.status, selectedOrder.fulfillmentType)}</Badge>
              <span className="order-detail__date">{new Date(selectedOrder.createdAt).toLocaleString("es-MX")}</span>
            </div>

            {selectedOrder.status === "COMPLETED" && selectedOrder.saleNumber && (
              <div className="order-detail__sale-banner">
                <CheckCircle2 size={18} />
                <span>Venta generada: <strong>{selectedOrder.saleNumber}</strong></span>
              </div>
            )}

            {selectedOrder.status === "CANCELLED" && selectedOrder.cancelReason && (
              <div className="order-detail__cancel-banner">
                <XCircle size={18} />
                <span>Motivo de cancelación: {selectedOrder.cancelReason}</span>
              </div>
            )}

            {/* No hay proveedor de correo/SMS configurado en el sistema, así
                que el aviso automático real hoy es por WhatsApp — el mensaje
                ya viene redactado, solo falta un clic para enviarlo. */}
            {notifyStatusChange && (
              <div className="order-detail__notify-banner">
                <span>El estado cambió — avisa al cliente:</span>
                <a
                  href={buildWhatsAppLink(selectedOrder.customerPhone, statusChangeMessage(selectedOrder))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="order-detail__notify-btn"
                  onClick={() => setNotifyStatusChange(false)}
                >
                  <Phone size={14} /> Avisar por WhatsApp
                </a>
              </div>
            )}

            {/* Customer info — kept prominent so staff can immediately see
                who to call/contact. */}
            <div className="order-detail__customer">
              <p className="order-detail__section-label">Datos del cliente</p>
              <p className="order-detail__customer-row"><User size={14} /> {selectedOrder.customerName}</p>
              <p className="order-detail__customer-row"><Phone size={14} /> {selectedOrder.customerPhone}</p>
              {selectedOrder.customerEmail && (
                <p className="order-detail__customer-row"><Mail size={14} /> {selectedOrder.customerEmail}</p>
              )}
            </div>

            <div className="order-detail__fulfillment">
              <p className="order-detail__section-label">Entrega</p>
              {selectedOrder.fulfillmentType === "PICKUP" ? (
                <p className="order-detail__fulfillment-row">
                  <Store size={14} /> Recoger en {selectedOrder.branch.name}
                  {selectedOrder.branch.address ? ` — ${selectedOrder.branch.address}` : ""}
                </p>
              ) : (
                <p className="order-detail__fulfillment-row">
                  <Truck size={14} /> A domicilio: {selectedOrder.deliveryAddress ?? "Sin dirección registrada"}
                </p>
              )}
              <p className="order-detail__payment-row">Método de pago: {PAYMENT_METHOD_LABEL[selectedOrder.paymentMethod]}</p>
              {selectedOrder.notes && <p className="order-detail__notes-row">Notas: {selectedOrder.notes}</p>}
            </div>

            <div className="order-detail__items">
              <p className="order-detail__section-label">Productos</p>
              {selectedOrder.items.map((item) => (
                <div key={item.id} className="order-detail__item">
                  <div className="order-detail__item-info">
                    <p className="order-detail__item-name">
                      {item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name}
                    </p>
                    <p className="order-detail__item-sku">{item.variant?.sku ?? item.product.sku}</p>
                  </div>
                  <span className="order-detail__item-qty">x{item.quantity}</span>
                  <span className="order-detail__item-price">{currencyFormatter.format(Number(item.unitPrice))}</span>
                  <span className="order-detail__item-total">{currencyFormatter.format(Number(item.lineTotal))}</span>
                </div>
              ))}
            </div>

            <div className="order-detail__totals">
              <div className="order-detail__totals-row">
                <span>Subtotal</span>
                <span>{currencyFormatter.format(Number(selectedOrder.subtotal))}</span>
              </div>
              <div className="order-detail__totals-row">
                <span>Impuestos</span>
                <span>{currencyFormatter.format(Number(selectedOrder.taxTotal))}</span>
              </div>
              <div className="order-detail__totals-row order-detail__totals-row--total">
                <span>Total</span>
                <span>{currencyFormatter.format(Number(selectedOrder.total))}</span>
              </div>
            </div>

            {/* ---------- ETA control ---------- */}
            {!isTerminal && (
              <PermissionGate code="orders.update">
                <div className="order-detail__eta">
                  <p className="order-detail__section-label"><Clock size={13} /> Tiempo estimado de entrega</p>
                  <p className="order-detail__eta-hint">El cliente verá esta hora al dar seguimiento a su pedido.</p>
                  <div className="order-detail__eta-controls">
                    <input
                      type="datetime-local"
                      value={etaValue}
                      onChange={(e) => setEtaValue(e.target.value)}
                    />
                    <button
                      type="button"
                      className="order-detail__eta-save"
                      onClick={handleSaveEta}
                      disabled={etaSaving || !etaValue}
                    >
                      {etaSaving ? <Loader2 size={14} className="spin" /> : "Guardar tiempo estimado"}
                    </button>
                    {selectedOrder.estimatedReadyAt && (
                      <button
                        type="button"
                        className="order-detail__eta-clear"
                        onClick={handleClearEta}
                        disabled={etaSaving}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  {etaError && <p className="order-detail__action-error"><AlertTriangle size={13} /> {etaError}</p>}
                </div>
              </PermissionGate>
            )}

            {/* ---------- Status pipeline control ---------- */}
            {!isTerminal && next && advanceLabel && (
              <PermissionGate code="orders.update">
                <div className="order-detail__action">
                  {needsPickupCode && (
                    <div className="order-detail__pickup-code">
                      <p className="order-detail__pickup-code-label">
                        Pide al cliente su código de retiro (se le envió por WhatsApp) e ingrésalo aquí:
                      </p>
                      <CodeSlots value={pickupCodeInput} onChange={setPickupCodeInput} disabled={advanceSaving} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="order-detail__advance-btn"
                    onClick={handleAdvance}
                    disabled={advanceSaving || (needsPickupCode && pickupCodeInput.length !== 6)}
                  >
                    {advanceSaving ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                    {advanceSaving ? "Actualizando..." : advanceLabel}
                  </button>
                  {advanceError && <p className="order-detail__action-error"><AlertTriangle size={13} /> {advanceError}</p>}
                </div>
              </PermissionGate>
            )}

            {/* ---------- Cancel control ---------- */}
            {!isTerminal && (
              <PermissionGate code="orders.update">
                <div className="order-detail__action">
                  {!confirmCancel ? (
                    <button type="button" className="order-detail__cancel-trigger" onClick={() => setConfirmCancel(true)}>
                      <Ban size={14} /> Cancelar pedido
                    </button>
                  ) : (
                    <div className="order-detail__cancel-confirm">
                      <label>
                        Motivo de la cancelación
                        <textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Ej. Cliente ya no desea el pedido"
                          rows={2}
                          autoFocus
                        />
                      </label>
                      {cancelError && <p className="order-detail__action-error"><AlertTriangle size={13} /> {cancelError}</p>}
                      <div className="order-detail__action-buttons">
                        <button
                          type="button"
                          className="order-detail__cancel-confirm-btn"
                          onClick={handleConfirmCancel}
                          disabled={cancelSaving}
                        >
                          {cancelSaving ? <Loader2 size={13} className="spin" /> : "Sí, cancelar pedido"}
                        </button>
                        <button
                          type="button"
                          className="order-detail__dismiss-btn"
                          onClick={() => { setConfirmCancel(false); setCancelError(null); }}
                          disabled={cancelSaving}
                        >
                          No, mantener
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </PermissionGate>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
