import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Eye,
  Plus,
  Search,
  Minus,
  X,
  AlertTriangle,
  Loader2,
  Ban,
  PackageCheck,
} from "lucide-react";
import { staggerStyle } from "../../utils/staggerStyle";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { DateRangePicker } from "../../components/common/DateRangePicker";
import { Modal } from "../../components/common/Modal";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { useAuth } from "../../hooks/useAuth";
import { usePermission } from "../../hooks/usePermission";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as productService from "../../services/productService";
import * as transferService from "../../services/transferService";
import type { Branch, Product, ProductVariant, Transfer } from "../../types/api";
import "./TransfersPage.css";

const STATUS_LABEL: Record<Transfer["status"], string> = {
  PENDING: "Pendiente",
  IN_TRANSIT: "En tránsito",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

type FetchStatus = "loading" | "ready" | "error";

interface TransferLine {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
}

function userHasBranchAccess(
  user: { allBranches: boolean; branches: Branch[] } | null,
  branchId: string
): boolean {
  if (!user) return false;
  if (user.allBranches) return true;
  return user.branches.some((b) => b.id === branchId);
}

export function TransfersPage() {
  const { user } = useAuth();
  const canReceive = usePermission("transfers.receive");
  const canCancel = usePermission("transfers.cancel");

  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

  // Catálogo completo de sucursales, necesario siempre (no solo para
  // allBranches) porque el selector de destino debe ofrecer todas las
  // sucursales activas, y el modal de detalle lo usa para mostrar
  // direcciones de origen/destino.
  const [allBranchList, setAllBranchList] = useState<Branch[]>([]);
  useEffect(() => {
    branchService.listBranches().then(setAllBranchList).catch(() => {});
  }, []);

  const accessibleBranches = user?.allBranches ? allBranchList : (user?.branches ?? []);

  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState<Transfer["status"] | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Misma lógica que showBranchFilter de SalesPage.tsx: solo se muestra si en verdad hay opción.
  const showBranchFilter = !!user?.allBranches || (user?.branches.length ?? 0) > 1;

  const loadTransfers = useCallback(() => {
    setStatus("loading");
    transferService
      .listTransfers({
        branchId: branchId || undefined,
        status: statusFilter || undefined,
        // Misma convención de fin de día inclusivo que SalesPage.tsx.
        from: fromDate ? `${fromDate}T00:00:00.000` : undefined,
        to: toDate ? `${toDate}T23:59:59.999` : undefined,
      })
      .then((rows) => { setTransfers(rows); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [branchId, statusFilter, fromDate, toDate]);

  useEffect(() => { loadTransfers(); }, [loadTransfers]);

  function branchAddress(branchIdToFind: string): string | null {
    return allBranchList.find((b) => b.id === branchIdToFind)?.address ?? null;
  }

  // ---------- Modal de creación ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TransferLine[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Un selector solo tiene sentido si en verdad hay opción, igual que
  // showBranchPicker de PosPage.tsx.
  const showSourcePicker = !!user?.allBranches || accessibleBranches.length > 1;
  const selectedSourceBranch = accessibleBranches.find((b) => b.id === sourceBranchId) ?? null;

  const destinationOptions = allBranchList.filter(
    (b) => b.status === "ACTIVE" && b.id !== sourceBranchId
  );

  // Limpia el destino si queda inválido al cambiar el origen (el backend
  // rechaza una transferencia a la misma sucursal).
  useEffect(() => {
    setDestinationBranchId((prev) => (prev === sourceBranchId ? "" : prev));
  }, [sourceBranchId]);

  function openCreateModal() {
    setSourceBranchId(accessibleBranches[0]?.id ?? "");
    setDestinationBranchId("");
    setNotes("");
    setItems([]);
    setCreateError(null);
    setProductSearchInput("");
    setProductQuery("");
    setProductResults([]);
    setCreateOpen(true);
  }

  // ---------- Búsqueda de productos (mismo patrón de debounce y clic para
  // agregar que el selector de PosPage.tsx) ----------
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productSearching, setProductSearching] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setProductQuery(productSearchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [productSearchInput]);

  useEffect(() => {
    if (!productQuery) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    setProductSearching(true);
    productService
      .listProducts({ search: productQuery, status: "ACTIVE" })
      .then((list) => { if (!cancelled) setProductResults(list); })
      .catch(() => { if (!cancelled) setProductResults([]); })
      .finally(() => { if (!cancelled) setProductSearching(false); });
    return () => { cancelled = true; };
  }, [productQuery]);

  function addItem(product: Product, variant?: ProductVariant) {
    setCreateError(null);
    const key = variant ? `${product.id}:${variant.id}` : product.id;
    setItems((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      const line: TransferLine = {
        key,
        productId: product.id,
        variantId: variant?.id,
        name: variant ? `${product.name} — ${variant.name}` : product.name,
        sku: variant?.sku ?? product.sku,
        quantity: 1,
      };
      return [...prev, line];
    });
  }

  function updateItemQuantity(key: string, quantity: number) {
    if (quantity < 1) return;
    setItems((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }
  function removeItem(key: string) {
    setItems((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleCreateTransfer() {
    if (!sourceBranchId || !destinationBranchId || items.length === 0 || submitting) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await transferService.createTransfer({
        sourceBranchId,
        destinationBranchId,
        notes: notes.trim() || undefined,
        items: items.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
      });
      setTransfers((prev) => (prev ? [created, ...prev] : [created]));
      setCreateOpen(false);
    } catch (err) {
      // Se muestra el mensaje exacto del backend, igual que en el cobro de
      // PosPage.tsx (ej. el mensaje real de stock insuficiente nombra el
      // producto y las cantidades disponible/solicitada).
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear la transferencia.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Modal de detalle ----------
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [confirmReceive, setConfirmReceive] = useState(false);
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openDetail(transfer: Transfer) {
    setSelectedTransfer(transfer);
    setDetailOpen(true);
    setConfirmReceive(false);
    setReceiveError(null);
    setConfirmCancel(false);
    setCancelReason("");
    setCancelError(null);
  }

  async function handleConfirmReceive() {
    if (!selectedTransfer) return;
    setReceiveSaving(true);
    setReceiveError(null);
    try {
      const updated = await transferService.receiveTransfer(selectedTransfer.id);
      setSelectedTransfer(updated);
      setTransfers((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
      setConfirmReceive(false);
    } catch (err) {
      setReceiveError(err instanceof ApiError ? err.message : "No se pudo recibir la transferencia.");
    } finally {
      setReceiveSaving(false);
    }
  }

  // Igual que handleConfirmCancel de SalesPage.tsx.
  async function handleConfirmCancel() {
    if (!selectedTransfer) return;
    if (cancelReason.trim().length < 3) {
      setCancelError("El motivo debe tener al menos 3 caracteres.");
      return;
    }
    setCancelSaving(true);
    setCancelError(null);
    try {
      const updated = await transferService.cancelTransfer(selectedTransfer.id, cancelReason.trim());
      setSelectedTransfer(updated);
      setTransfers((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
      setConfirmCancel(false);
      setCancelReason("");
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "No se pudo cancelar la transferencia.");
    } finally {
      setCancelSaving(false);
    }
  }

  const rows = transfers ?? [];

  const canShowReceiveAction =
    !!selectedTransfer &&
    selectedTransfer.status === "IN_TRANSIT" &&
    canReceive &&
    userHasBranchAccess(user, selectedTransfer.destinationBranchId);

  const canShowCancelAction =
    !!selectedTransfer && selectedTransfer.status === "IN_TRANSIT" && canCancel;

  return (
    <div className="transfers-page">
      <Link to="/admin/productos" className="transfers-page__back-link">
        <ArrowLeft size={15} /> Volver a Productos
      </Link>
      <div className="transfers-page__header">
        <div className="transfers-page__title">
          <ArrowLeftRight size={22} />
          <h1>Transferencias</h1>
        </div>
        <PermissionGate code="transfers.create">
          <button type="button" className="transfers-page__new-btn" onClick={openCreateModal}>
            <Plus size={16} /> Nueva transferencia
          </button>
        </PermissionGate>
      </div>

      <div className="transfers-filters">
        {showBranchFilter && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {accessibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Transfer["status"] | "")}>
          <option value="">Todos los estados</option>
          <option value="IN_TRANSIT">En tránsito</option>
          <option value="COMPLETED">Completada</option>
          <option value="CANCELLED">Cancelada</option>
        </Select>
        <DateRangePicker from={fromDate} to={toDate} onChange={(r) => { setFromDate(r.from); setToDate(r.to); }} />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar el historial de transferencias." />}
      {status === "ready" && rows.length === 0 && (
        <StatusState kind="empty" message="No hay transferencias que coincidan con estos filtros." />
      )}

      {status === "ready" && rows.length > 0 && (
        <table className="transfers-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Origen → Destino</th>
              <th>Artículos</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td className="transfers-table__folio">{t.transferNumber}</td>
                <td>{new Date(t.dispatchedAt ?? t.createdAt).toLocaleString("es-MX")}</td>
                <td>
                  <span className="transfers-table__route">
                    {t.sourceBranch.name} <ArrowRight size={13} /> {t.destinationBranch.name}
                  </span>
                </td>
                <td>{t.itemCount}</td>
                <td>
                  <span className={`transfer-status-badge transfer-status-badge--${t.status.toLowerCase()}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </td>
                <td>
                  <button type="button" className="transfers-table__view" onClick={() => openDetail(t)}>
                    <Eye size={15} /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- Create modal ---------- */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva transferencia" className="transfer-create-modal">
        <div className="transfer-create">
          <div className="transfer-create__branches">
            <div className="transfer-create__branch-field">
              <span className="transfer-create__branch-label">Origen</span>
              {showSourcePicker ? (
                <Select value={sourceBranchId} onChange={(e) => setSourceBranchId(e.target.value)}>
                  {accessibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              ) : selectedSourceBranch ? (
                <p className="transfer-create__branch-static">{selectedSourceBranch.name}</p>
              ) : (
                <p className="transfer-create__branch-static transfer-create__branch-static--empty">
                  No tienes sucursales asignadas.
                </p>
              )}
            </div>
            <div className="transfer-create__branch-field">
              <span className="transfer-create__branch-label">Destino</span>
              <Select value={destinationBranchId} onChange={(e) => setDestinationBranchId(e.target.value)}>
                <option value="">Selecciona sucursal destino</option>
                {destinationOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="transfer-create__picker">
            <label className="transfer-create__search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Buscar producto por nombre, SKU o código de barras..."
                value={productSearchInput}
                onChange={(e) => setProductSearchInput(e.target.value)}
              />
            </label>

            {productSearching && <StatusState kind="loading" compact />}
            {!productSearching && productQuery && productResults.length === 0 && (
              <StatusState kind="empty" compact message="No se encontraron productos." />
            )}

            {productQuery && productResults.length > 0 && (
              <ul className="transfer-create__results">
                {productResults.map((p) => {
                  const activeVariants = p.variants.filter((v) => v.status === "ACTIVE");
                  return (
                    <li key={p.id} className="transfer-create__result-product">
                      {activeVariants.length === 0 ? (
                        <button type="button" className="transfer-create__result-row" onClick={() => addItem(p)}>
                          <span className="transfer-create__result-name">{p.name}</span>
                          <span className="transfer-create__result-sku">{p.sku}</span>
                        </button>
                      ) : (
                        <>
                          <p className="transfer-create__result-label">{p.name}</p>
                          {activeVariants.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className="transfer-create__result-row transfer-create__result-row--variant"
                              onClick={() => addItem(p, v)}
                            >
                              <span className="transfer-create__result-name">{v.name}</span>
                              <span className="transfer-create__result-sku">{v.sku}</span>
                            </button>
                          ))}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="transfer-create__lines">
            {items.length === 0 && (
              <StatusState kind="empty" compact message="Busca un producto para agregarlo a la transferencia." />
            )}
            {items.map((l) => (
              <div key={l.key} className="transfer-create__line">
                <div className="transfer-create__line-info">
                  <p className="transfer-create__line-name">{l.name}</p>
                  <p className="transfer-create__line-sku">{l.sku}</p>
                </div>
                <div className="transfer-create__line-qty">
                  <button type="button" onClick={() => updateItemQuantity(l.key, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="Disminuir cantidad">
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => updateItemQuantity(l.key, Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                  />
                  <button type="button" onClick={() => updateItemQuantity(l.key, l.quantity + 1)} aria-label="Aumentar cantidad">
                    <Plus size={13} />
                  </button>
                </div>
                <button type="button" className="transfer-create__line-remove" onClick={() => removeItem(l.key)} aria-label={`Quitar ${l.name}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <label className="transfer-create__notes">
            Notas (opcional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Reabastecimiento de temporada"
              rows={2}
            />
          </label>

          {createError && <p className="transfer-create__error"><AlertTriangle size={14} /> {createError}</p>}

          <button
            type="button"
            className="transfer-create__submit"
            onClick={handleCreateTransfer}
            disabled={!sourceBranchId || !destinationBranchId || items.length === 0 || submitting}
          >
            {submitting ? <Loader2 size={16} className="spin" /> : <ArrowLeftRight size={16} />}
            {submitting ? "Creando..." : "Crear transferencia"}
          </button>
        </div>
      </Modal>

      {/* ---------- Detail modal ---------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedTransfer ? `Transferencia ${selectedTransfer.transferNumber}` : "Transferencia"}
        className="transfer-detail-modal"
      >
        {selectedTransfer && (
          <div className="transfer-detail">
            <div className="transfer-detail__status-row">
              <span className={`transfer-status-badge transfer-status-badge--${selectedTransfer.status.toLowerCase()}`}>
                {STATUS_LABEL[selectedTransfer.status]}
              </span>
              <span className="transfer-detail__date">
                {new Date(selectedTransfer.dispatchedAt ?? selectedTransfer.createdAt).toLocaleString("es-MX")}
              </span>
            </div>

            <div className="transfer-detail__branches">
              <div className="transfer-detail__branch">
                <span className="transfer-detail__branch-label">Origen</span>
                <p className="transfer-detail__branch-name">{selectedTransfer.sourceBranch.name}</p>
                {branchAddress(selectedTransfer.sourceBranchId) && (
                  <p className="transfer-detail__branch-address">{branchAddress(selectedTransfer.sourceBranchId)}</p>
                )}
              </div>
              <ArrowRight size={18} className="transfer-detail__branch-arrow" />
              <div className="transfer-detail__branch">
                <span className="transfer-detail__branch-label">Destino</span>
                <p className="transfer-detail__branch-name">{selectedTransfer.destinationBranch.name}</p>
                {branchAddress(selectedTransfer.destinationBranchId) && (
                  <p className="transfer-detail__branch-address">{branchAddress(selectedTransfer.destinationBranchId)}</p>
                )}
              </div>
            </div>

            <div className="transfer-detail__items">
              <p className="transfer-detail__section-label">Artículos ({selectedTransfer.itemCount})</p>
              {selectedTransfer.items.map((item) => (
                <div key={item.id} className="transfer-detail__item">
                  <div>
                    <p className="transfer-detail__item-name">
                      {item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name}
                    </p>
                    <p className="transfer-detail__item-sku">{item.variant?.sku ?? item.product.sku}</p>
                  </div>
                  <span className="transfer-detail__item-qty">x{item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="transfer-detail__people">
              <p><span>Solicitado por</span> {selectedTransfer.requestedBy.displayName}</p>
              {selectedTransfer.receivedBy && <p><span>Recibido por</span> {selectedTransfer.receivedBy.displayName}</p>}
            </div>

            {selectedTransfer.notes && (
              <div className="transfer-detail__notes">
                <p className="transfer-detail__section-label">Notas</p>
                <p>{selectedTransfer.notes}</p>
              </div>
            )}

            {selectedTransfer.status === "CANCELLED" && selectedTransfer.cancelReason && (
              <div className="transfer-detail__cancel-reason">
                <p className="transfer-detail__section-label">Motivo de cancelación</p>
                <p>{selectedTransfer.cancelReason}</p>
              </div>
            )}

            {canShowReceiveAction && (
              <div className="transfer-detail__action">
                {!confirmReceive ? (
                  <button type="button" className="transfer-detail__receive-trigger" onClick={() => setConfirmReceive(true)}>
                    <PackageCheck size={14} /> Recibir transferencia
                  </button>
                ) : (
                  <div className="transfer-detail__receive-confirm">
                    <p>¿Confirmar la recepción de esta transferencia en {selectedTransfer.destinationBranch.name}?</p>
                    {receiveError && <p className="transfer-detail__action-error"><AlertTriangle size={13} /> {receiveError}</p>}
                    <div className="transfer-detail__action-buttons">
                      <button type="button" className="transfer-detail__confirm-btn" onClick={handleConfirmReceive} disabled={receiveSaving}>
                        {receiveSaving ? <Loader2 size={13} className="spin" /> : "Sí, recibir"}
                      </button>
                      <button
                        type="button"
                        className="transfer-detail__dismiss-btn"
                        onClick={() => { setConfirmReceive(false); setReceiveError(null); }}
                        disabled={receiveSaving}
                      >
                        No, cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canShowCancelAction && (
              <div className="transfer-detail__action">
                {!confirmCancel ? (
                  <button type="button" className="transfer-detail__cancel-trigger" onClick={() => setConfirmCancel(true)}>
                    <Ban size={14} /> Cancelar transferencia
                  </button>
                ) : (
                  <div className="transfer-detail__cancel-confirm">
                    <label>
                      Motivo de la cancelación
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Ej. Error al capturar la sucursal destino"
                        rows={2}
                        autoFocus
                      />
                    </label>
                    {cancelError && <p className="transfer-detail__action-error"><AlertTriangle size={13} /> {cancelError}</p>}
                    <div className="transfer-detail__action-buttons">
                      <button
                        type="button"
                        className="transfer-detail__cancel-confirm-btn"
                        onClick={handleConfirmCancel}
                        disabled={cancelSaving}
                      >
                        {cancelSaving ? <Loader2 size={13} className="spin" /> : "Sí, cancelar transferencia"}
                      </button>
                      <button
                        type="button"
                        className="transfer-detail__dismiss-btn"
                        onClick={() => { setConfirmCancel(false); setCancelError(null); }}
                        disabled={cancelSaving}
                      >
                        No, mantener
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
