import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  Eye,
  Plus,
  Search,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Ban,
  PackageCheck,
  Users,
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
import * as purchaseService from "../../services/purchaseService";
import * as supplierService from "../../services/supplierService";
import type { Branch, Product, ProductVariant, Purchase, Supplier } from "../../types/api";
import "./PurchasesPage.css";

import { currencyFormatter } from "../../utils/currency";

const STATUS_LABEL: Record<Purchase["status"], string> = {
  PENDING: "Pendiente",
  COMPLETED: "Completada",
  // Redacción neutral a propósito: una diferencia es un hecho normal al
  // recibir mercancía de un tercero, no un estado de error.
  RECEIVED_WITH_DISCREPANCIES: "Con diferencias",
  CANCELLED: "Cancelada",
};

type FetchStatus = "loading" | "ready" | "error";

// Una línea de compra en borrador. Cantidad y costo se guardan como string
// para no interrumpir un valor a medio escribir; se parsean solo al enviar.
// A diferencia de TransfersPage, aquí cada línea sí lleva un costo (lo
// facturado por el proveedor).
interface PurchaseLine {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  expectedQuantity: string;
  unitCost: string;
}

function userHasBranchAccess(
  user: { allBranches: boolean; branches: Branch[] } | null,
  branchId: string
): boolean {
  if (!user) return false;
  if (user.allBranches) return true;
  return user.branches.some((b) => b.id === branchId);
}

export function PurchasesPage() {
  const { user } = useAuth();
  const canReceive = usePermission("purchases.receive");
  const canCancel = usePermission("purchases.cancel");
  const canManageSuppliers = usePermission("suppliers.manage");

  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

  // Catálogo completo de sucursales, necesario para usuarios allBranches
  // (igual que en TransfersPage).
  const [allBranchList, setAllBranchList] = useState<Branch[]>([]);
  useEffect(() => {
    branchService.listBranches().then(setAllBranchList).catch(() => {});
  }, []);

  const accessibleBranches = user?.allBranches ? allBranchList : (user?.branches ?? []);

  // Los proveedores alimentan tanto el filtro como el selector del modal de
  // creación, por eso se cargan una sola vez aquí. GET /api/suppliers solo
  // requiere purchases.view (no suppliers.manage) para que cualquiera que
  // pueda generar una compra vea este dropdown.
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => {
    supplierService.listSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState<Purchase["status"] | "">("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Misma lógica que showBranchFilter de TransfersPage: solo se muestra si en verdad hay opción.
  const showBranchFilter = !!user?.allBranches || (user?.branches.length ?? 0) > 1;

  const loadPurchases = useCallback(() => {
    setStatus("loading");
    purchaseService
      .listPurchases({
        branchId: branchId || undefined,
        status: statusFilter || undefined,
        supplierId: supplierFilter || undefined,
        // Misma convención de fin de día inclusivo que TransfersPage/SalesPage.
        from: fromDate ? `${fromDate}T00:00:00.000` : undefined,
        to: toDate ? `${toDate}T23:59:59.999` : undefined,
      })
      .then((rows) => { setPurchases(rows); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [branchId, statusFilter, supplierFilter, fromDate, toDate]);

  useEffect(() => { loadPurchases(); }, [loadPurchases]);

  // ---------- Modal de creación ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [createSupplierId, setCreateSupplierId] = useState("");
  const [createBranchId, setCreateBranchId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseLine[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Un selector solo tiene sentido si en verdad hay opción, igual que
  // showBranchPicker de PosPage.tsx.
  const showBranchPicker = !!user?.allBranches || accessibleBranches.length > 1;
  const selectedCreateBranch = accessibleBranches.find((b) => b.id === createBranchId) ?? null;

  // Solo se puede comprar a proveedores ACTIVOS (createPurchase rechaza uno
  // inactivo). El filtro de arriba sí lista todos, para poder encontrar
  // compras históricas de un proveedor ya desactivado.
  const activeSuppliers = suppliers.filter((s) => s.status === "ACTIVE");

  function openCreateModal() {
    setCreateSupplierId("");
    setCreateBranchId(accessibleBranches[0]?.id ?? "");
    setReference("");
    setNotes("");
    setItems([]);
    setCreateError(null);
    setProductSearchInput("");
    setProductQuery("");
    setProductResults([]);
    setCreatingSupplier(false);
    setNewSupplierName("");
    setSupplierError(null);
    setCreateOpen(true);
  }

  // Sincroniza la sucursal por defecto si el catálogo llega después de
  // abrir el modal (para un usuario allBranches).
  useEffect(() => {
    if (createOpen && !createBranchId && accessibleBranches.length > 0) {
      setCreateBranchId(accessibleBranches[0].id);
    }
  }, [createOpen, createBranchId, accessibleBranches]);

  // ---------- Creación rápida inline de "proveedor nuevo" ----------
  // Cambia el <select> por un input de texto + confirmar/cancelar en el
  // mismo lugar, en vez de un modal dentro de otro modal (igual que
  // ProductFormModal hace con categorías/marcas).
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  async function handleCreateSupplierInline() {
    const name = newSupplierName.trim();
    if (!name) return;
    setSupplierSaving(true);
    setSupplierError(null);
    try {
      const created = await supplierService.createSupplier({ name });
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCreateSupplierId(created.id);
      setCreatingSupplier(false);
      setNewSupplierName("");
    } catch (err) {
      setSupplierError(err instanceof ApiError ? err.message : "No se pudo crear el proveedor.");
    } finally {
      setSupplierSaving(false);
    }
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
        return prev.map((l) =>
          l.key === key ? { ...l, expectedQuantity: String((Number(l.expectedQuantity) || 0) + 1) } : l
        );
      }
      const line: PurchaseLine = {
        key,
        productId: product.id,
        variantId: variant?.id,
        name: variant ? `${product.name} — ${variant.name}` : product.name,
        sku: variant?.sku ?? product.sku,
        expectedQuantity: "1",
        // Se inicializa con el costo registrado del producto para ahorrar
        // escritura en un reorden, pero queda totalmente editable, ya que
        // el costo debe reflejar lo realmente facturado en ESTA entrega.
        unitCost: product.cost ?? "0",
      };
      return [...prev, line];
    });
  }

  function updateLine(key: string, patch: Partial<PurchaseLine>) {
    setItems((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((l) => l.key !== key));
  }

  const draftTotal = items.reduce(
    (sum, l) => sum + (Number(l.expectedQuantity) || 0) * (Number(l.unitCost) || 0),
    0
  );

  const createDisabled =
    !createSupplierId ||
    !createBranchId ||
    items.length === 0 ||
    submitting ||
    // Refleja las validaciones del backend por ítem para evitar un viaje al
    // servidor con casos obvios; los casos más sutiles los reporta el servidor.
    items.some((l) => !(Number(l.expectedQuantity) > 0) || !(Number(l.unitCost) >= 0));

  async function handleCreatePurchase() {
    if (createDisabled) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await purchaseService.createPurchase({
        supplierId: createSupplierId,
        branchId: createBranchId,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          expectedQuantity: Math.floor(Number(l.expectedQuantity)),
          unitCost: Number(l.unitCost),
        })),
      });
      setPurchases((prev) => (prev ? [created, ...prev] : [created]));
      setCreateOpen(false);
    } catch (err) {
      // Se muestra el mensaje exacto del backend en vez de uno genérico,
      // igual que en PosPage/TransfersPage.
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear la compra.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Modal de detalle ----------
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Recibir requiere un formulario real (no un simple confirmar): el
  // encargado captura lo que realmente llegó, línea por línea. Se
  // pre-llena con la cantidad pedida pero es totalmente editable.
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function prefillReceive(purchase: Purchase) {
    const next: Record<string, string> = {};
    for (const item of purchase.items) next[item.id] = String(item.expectedQuantity);
    setReceiveQuantities(next);
  }

  function openDetail(purchase: Purchase) {
    setSelectedPurchase(purchase);
    setDetailOpen(true);
    setReceiveOpen(false);
    setReceiveError(null);
    prefillReceive(purchase);
    setConfirmCancel(false);
    setCancelReason("");
    setCancelError(null);
  }

  // Actualización en el propio estado para reflejar el nuevo estatus en el
  // modal y en la fila de la lista sin recargar, igual que TransfersPage.
  function applyUpdated(updated: Purchase) {
    setSelectedPurchase(updated);
    setPurchases((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
  }

  async function handleConfirmReceive() {
    if (!selectedPurchase) return;
    const lines = selectedPurchase.items.map((item) => {
      const raw = receiveQuantities[item.id];
      const parsed = raw === undefined || raw.trim() === "" ? 0 : Math.floor(Number(raw));
      return { purchaseItemId: item.id, receivedQuantity: parsed };
    });
    if (lines.some((l) => Number.isNaN(l.receivedQuantity) || l.receivedQuantity < 0)) {
      setReceiveError("Las cantidades recibidas deben ser números enteros no negativos.");
      return;
    }
    setReceiveSaving(true);
    setReceiveError(null);
    try {
      const updated = await purchaseService.receivePurchase(selectedPurchase.id, { items: lines });
      applyUpdated(updated);
      setReceiveOpen(false);
    } catch (err) {
      setReceiveError(err instanceof ApiError ? err.message : "No se pudo registrar la recepción.");
    } finally {
      setReceiveSaving(false);
    }
  }

  // Igual que handleConfirmCancel de TransfersPage.tsx.
  async function handleConfirmCancel() {
    if (!selectedPurchase) return;
    if (cancelReason.trim().length < 3) {
      setCancelError("El motivo debe tener al menos 3 caracteres.");
      return;
    }
    setCancelSaving(true);
    setCancelError(null);
    try {
      const updated = await purchaseService.cancelPurchase(selectedPurchase.id, cancelReason.trim());
      applyUpdated(updated);
      setConfirmCancel(false);
      setCancelReason("");
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "No se pudo cancelar la compra.");
    } finally {
      setCancelSaving(false);
    }
  }

  const rows = purchases ?? [];

  // Valor real de la compra: el valor pedido mientras está pendiente, y el
  // de lo realmente recibido una vez completada.
  function purchaseTotal(purchase: Purchase): number {
    return purchase.items.reduce((sum, i) => {
      const qty = i.receivedQuantity ?? i.expectedQuantity;
      return sum + qty * Number(i.unitCost);
    }, 0);
  }

  const isPending = !!selectedPurchase && selectedPurchase.status === "PENDING";
  const canShowReceiveAction =
    isPending && canReceive && userHasBranchAccess(user, selectedPurchase.branchId);
  const canShowCancelAction = isPending && canCancel;

  const receivePreviewDiffers =
    !!selectedPurchase &&
    selectedPurchase.items.some((i) => {
      const raw = receiveQuantities[i.id];
      const parsed = raw === undefined || raw.trim() === "" ? 0 : Math.floor(Number(raw));
      return parsed !== i.expectedQuantity;
    });

  return (
    <div className="purchases-page">
      <div className="purchases-page__header">
        <div className="purchases-page__title">
          <ShoppingBag size={22} />
          <h1>Compras</h1>
        </div>
        <div className="purchases-page__header-actions">
          {/* Suppliers have no sidebar entry of their own — they're secondary
              master data, reached from here, keeping the main nav uncluttered. */}
          {canManageSuppliers && (
            <Link to="/admin/proveedores" className="purchases-page__suppliers-link">
              <Users size={15} /> Gestionar proveedores
            </Link>
          )}
          <PermissionGate code="purchases.create">
            <button type="button" className="purchases-page__new-btn" onClick={openCreateModal}>
              <Plus size={16} /> Nueva compra
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="purchases-filters">
        {showBranchFilter && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {accessibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Purchase["status"] | "")}>
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="COMPLETED">Completada</option>
          <option value="RECEIVED_WITH_DISCREPANCIES">Con diferencias</option>
          <option value="CANCELLED">Cancelada</option>
        </Select>
        <Select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {/* Real bug found on a phone-width audit: a raw native <input
            type="date"> pair renders the OS's own unstyled date picker
            ("dd/mm/aaaa" placeholder, browser-default popover) sitting
            right next to the app's custom-styled Select dropdowns — a
            visibly out-of-place mismatch, and cramped on a narrow screen.
            Swapped for the same DateRangePicker every other filtered list
            page already uses (Pedidos, Mermas, Caja, Auditoría...). */}
        <DateRangePicker from={fromDate} to={toDate} onChange={(r) => { setFromDate(r.from); setToDate(r.to); }} />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar el historial de compras." />}
      {status === "ready" && rows.length === 0 && (
        <StatusState kind="empty" message="No hay compras que coincidan con estos filtros." />
      )}

      {status === "ready" && rows.length > 0 && (
        <table className="purchases-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Sucursal</th>
              <th>Artículos</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td className="purchases-table__folio">{p.purchaseNumber}</td>
                <td>{new Date(p.createdAt).toLocaleString("es-MX")}</td>
                <td>{p.supplier.name}</td>
                <td>{p.branch.name}</td>
                <td>{p.itemCount}</td>
                <td>
                  <span className={`purchase-status-badge purchase-status-badge--${p.status.toLowerCase()}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                  {p.discrepancyCount > 0 && (
                    <span className="purchases-table__diff-count">
                      {p.discrepancyCount} {p.discrepancyCount === 1 ? "línea" : "líneas"}
                    </span>
                  )}
                </td>
                <td>
                  <button type="button" className="purchases-table__view" onClick={() => openDetail(p)}>
                    <Eye size={15} /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- Create modal ---------- */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva compra" className="purchase-create-modal">
        <div className="purchase-create">
          <div className="purchase-create__head">
            <div className="purchase-create__field">
              <span className="purchase-create__field-label">Proveedor</span>
              {!creatingSupplier ? (
                <div className="product-form__select-with-add">
                  <Select value={createSupplierId} onChange={(e) => setCreateSupplierId(e.target.value)}>
                    <option value="">Selecciona un proveedor</option>
                    {activeSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  {canManageSuppliers && (
                    <button
                      type="button"
                      className="product-form__add-inline"
                      onClick={() => { setCreatingSupplier(true); setNewSupplierName(""); setSupplierError(null); }}
                      aria-label="Proveedor nuevo"
                      title="Proveedor nuevo"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="product-form__inline-create">
                  <input
                    autoFocus
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="Nombre del proveedor"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleCreateSupplierInline(); }
                      if (e.key === "Escape") { e.preventDefault(); setCreatingSupplier(false); setSupplierError(null); }
                    }}
                  />
                  <button
                    type="button"
                    className="product-form__inline-confirm"
                    onClick={handleCreateSupplierInline}
                    disabled={supplierSaving || !newSupplierName.trim()}
                    aria-label="Confirmar proveedor nuevo"
                    title="Confirmar"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="product-form__inline-cancel"
                    onClick={() => { setCreatingSupplier(false); setSupplierError(null); }}
                    aria-label="Cancelar"
                    title="Cancelar"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {supplierError && <span className="product-form__inline-error">{supplierError}</span>}
            </div>

            <div className="purchase-create__field">
              <span className="purchase-create__field-label">Sucursal receptora</span>
              {showBranchPicker ? (
                <Select value={createBranchId} onChange={(e) => setCreateBranchId(e.target.value)}>
                  {accessibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              ) : selectedCreateBranch ? (
                <p className="purchase-create__field-static">{selectedCreateBranch.name}</p>
              ) : (
                <p className="purchase-create__field-static purchase-create__field-static--empty">
                  No tienes sucursales asignadas.
                </p>
              )}
            </div>
          </div>

          <div className="purchase-create__picker">
            <label className="purchase-create__search">
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
              <ul className="purchase-create__results">
                {productResults.map((p) => {
                  const activeVariants = p.variants.filter((v) => v.status === "ACTIVE");
                  return (
                    <li key={p.id} className="purchase-create__result-product">
                      {activeVariants.length === 0 ? (
                        <button type="button" className="purchase-create__result-row" onClick={() => addItem(p)}>
                          <span className="purchase-create__result-name">{p.name}</span>
                          <span className="purchase-create__result-sku">{p.sku}</span>
                        </button>
                      ) : (
                        <>
                          <p className="purchase-create__result-label">{p.name}</p>
                          {activeVariants.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className="purchase-create__result-row purchase-create__result-row--variant"
                              onClick={() => addItem(p, v)}
                            >
                              <span className="purchase-create__result-name">{v.name}</span>
                              <span className="purchase-create__result-sku">{v.sku}</span>
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

          <div className="purchase-create__lines">
            {items.length === 0 && (
              <StatusState kind="empty" compact message="Busca un producto para agregarlo a la compra." />
            )}
            {items.length > 0 && (
              <div className="purchase-create__lines-head">
                <span>Artículo</span>
                <span>Cantidad</span>
                <span>Costo unit.</span>
                <span>Importe</span>
                <span />
              </div>
            )}
            {items.map((l) => {
              const lineTotal = (Number(l.expectedQuantity) || 0) * (Number(l.unitCost) || 0);
              return (
                <div key={l.key} className="purchase-create__line">
                  <div className="purchase-create__line-info">
                    <p className="purchase-create__line-name">{l.name}</p>
                    <p className="purchase-create__line-sku">{l.sku}</p>
                  </div>
                  <input
                    className="purchase-create__line-qty"
                    type="number"
                    min={1}
                    step={1}
                    value={l.expectedQuantity}
                    onChange={(e) => updateLine(l.key, { expectedQuantity: e.target.value })}
                    aria-label={`Cantidad esperada de ${l.name}`}
                  />
                  <input
                    className="purchase-create__line-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitCost}
                    onChange={(e) => updateLine(l.key, { unitCost: e.target.value })}
                    aria-label={`Costo unitario de ${l.name}`}
                  />
                  <span className="purchase-create__line-total">{currencyFormatter.format(lineTotal)}</span>
                  <button
                    type="button"
                    className="purchase-create__line-remove"
                    onClick={() => removeItem(l.key)}
                    aria-label={`Quitar ${l.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
            {items.length > 0 && (
              <p className="purchase-create__total">
                Total estimado <strong>{currencyFormatter.format(draftTotal)}</strong>
              </p>
            )}
          </div>

          <label className="purchase-create__text-field">
            Referencia (factura o remisión del proveedor)
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej. FAC-A-10482"
            />
          </label>

          <label className="purchase-create__text-field">
            Notas (opcional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Pedido de reabasto para temporada alta"
              rows={2}
            />
          </label>

          {createError && <p className="purchase-create__error"><AlertTriangle size={14} /> {createError}</p>}

          <button
            type="button"
            className="purchase-create__submit"
            onClick={handleCreatePurchase}
            disabled={createDisabled}
          >
            {submitting ? <Loader2 size={16} className="spin" /> : <ShoppingBag size={16} />}
            {submitting ? "Creando..." : "Crear compra"}
          </button>
        </div>
      </Modal>

      {/* ---------- Detail modal ---------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedPurchase ? `Compra ${selectedPurchase.purchaseNumber}` : "Compra"}
        className="purchase-detail-modal"
      >
        {selectedPurchase && (
          <div className="purchase-detail">
            <div className="purchase-detail__status-row">
              <span className={`purchase-status-badge purchase-status-badge--${selectedPurchase.status.toLowerCase()}`}>
                {STATUS_LABEL[selectedPurchase.status]}
              </span>
              <span className="purchase-detail__date">
                {new Date(selectedPurchase.createdAt).toLocaleString("es-MX")}
              </span>
            </div>

            <div className="purchase-detail__meta">
              <div>
                <span className="purchase-detail__meta-label">Proveedor</span>
                <p className="purchase-detail__meta-value">{selectedPurchase.supplier.name}</p>
                {selectedPurchase.supplier.contactName && (
                  <p className="purchase-detail__meta-sub">{selectedPurchase.supplier.contactName}</p>
                )}
                {selectedPurchase.supplier.phone && (
                  <p className="purchase-detail__meta-sub">{selectedPurchase.supplier.phone}</p>
                )}
              </div>
              <div>
                <span className="purchase-detail__meta-label">Sucursal receptora</span>
                <p className="purchase-detail__meta-value">{selectedPurchase.branch.name}</p>
                {selectedPurchase.reference && (
                  <p className="purchase-detail__meta-sub">Ref. {selectedPurchase.reference}</p>
                )}
              </div>
            </div>

            <div className="purchase-detail__items">
              <p className="purchase-detail__section-label">
                Artículos ({selectedPurchase.itemCount})
                {selectedPurchase.discrepancyCount > 0 && (
                  <span className="purchase-detail__diff-summary">
                    <AlertTriangle size={12} /> {selectedPurchase.discrepancyCount} con diferencia
                  </span>
                )}
              </p>
              {selectedPurchase.items.map((item) => {
                const received = item.receivedQuantity;
                const differs = received !== null && received !== item.expectedQuantity;
                return (
                  <div
                    key={item.id}
                    className={`purchase-detail__item${differs ? " purchase-detail__item--diff" : ""}`}
                  >
                    <div className="purchase-detail__item-info">
                      <p className="purchase-detail__item-name">
                        {item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name}
                      </p>
                      <p className="purchase-detail__item-sku">{item.variant?.sku ?? item.product.sku}</p>
                    </div>
                    <div className="purchase-detail__item-numbers">
                      <span className="purchase-detail__item-num">
                        <em>Pedido</em> {item.expectedQuantity}
                      </span>
                      <span className={`purchase-detail__item-num${differs ? " purchase-detail__item-num--diff" : ""}`}>
                        <em>Recibido</em> {received === null ? "—" : received}
                      </span>
                      <span className="purchase-detail__item-num">
                        <em>Costo</em> {currencyFormatter.format(Number(item.unitCost))}
                      </span>
                    </div>
                    {differs && (
                      <span className="purchase-detail__item-flag">
                        <AlertTriangle size={12} />
                        {received > item.expectedQuantity
                          ? `+${received - item.expectedQuantity}`
                          : `−${item.expectedQuantity - received}`}
                      </span>
                    )}
                  </div>
                );
              })}
              <p className="purchase-detail__total">
                Total <strong>{currencyFormatter.format(purchaseTotal(selectedPurchase))}</strong>
              </p>
            </div>

            <div className="purchase-detail__people">
              <p><span>Creada por</span> {selectedPurchase.createdBy.displayName}</p>
              {selectedPurchase.receivedBy && (
                <p><span>Recibida por</span> {selectedPurchase.receivedBy.displayName}</p>
              )}
            </div>

            {selectedPurchase.notes && (
              <div className="purchase-detail__notes">
                <p className="purchase-detail__section-label">Notas</p>
                <p>{selectedPurchase.notes}</p>
              </div>
            )}

            {selectedPurchase.status === "CANCELLED" && selectedPurchase.cancelReason && (
              <div className="purchase-detail__cancel-reason">
                <p className="purchase-detail__section-label">Motivo de cancelación</p>
                <p>{selectedPurchase.cancelReason}</p>
              </div>
            )}

            {canShowReceiveAction && (
              <div className="purchase-detail__action">
                {!receiveOpen ? (
                  <button
                    type="button"
                    className="purchase-detail__receive-trigger"
                    onClick={() => { prefillReceive(selectedPurchase); setReceiveOpen(true); setReceiveError(null); }}
                  >
                    <PackageCheck size={14} /> Recibir mercancía
                  </button>
                ) : (
                  <div className="purchase-detail__receive-form">
                    <p className="purchase-detail__receive-intro">
                      Captura lo que realmente llegó. Viene precargado con lo pedido; ajústalo línea por línea si hubo
                      diferencias.
                    </p>
                    {selectedPurchase.items.map((item) => {
                      const value = receiveQuantities[item.id] ?? "";
                      const parsed = value.trim() === "" ? 0 : Math.floor(Number(value));
                      const differs = parsed !== item.expectedQuantity;
                      return (
                        <div key={item.id} className="purchase-detail__receive-line">
                          <div className="purchase-detail__receive-line-info">
                            <p className="purchase-detail__item-name">
                              {item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name}
                            </p>
                            <p className="purchase-detail__item-sku">Pedido: {item.expectedQuantity}</p>
                          </div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={value}
                            onChange={(e) =>
                              setReceiveQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className={differs ? "purchase-detail__receive-input--diff" : undefined}
                            aria-label={`Cantidad recibida de ${item.product.name}`}
                          />
                        </div>
                      );
                    })}
                    {receivePreviewDiffers && (
                      <p className="purchase-detail__receive-warning">
                        <AlertTriangle size={13} /> Hay líneas con diferencia contra lo pedido. La compra quedará como
                        &ldquo;Con diferencias&rdquo; y el inventario subirá solo por lo recibido.
                      </p>
                    )}
                    {receiveError && (
                      <p className="purchase-detail__action-error"><AlertTriangle size={13} /> {receiveError}</p>
                    )}
                    <div className="purchase-detail__action-buttons">
                      <button
                        type="button"
                        className="purchase-detail__confirm-btn"
                        onClick={handleConfirmReceive}
                        disabled={receiveSaving}
                      >
                        {receiveSaving ? <Loader2 size={13} className="spin" /> : "Confirmar recepción"}
                      </button>
                      <button
                        type="button"
                        className="purchase-detail__dismiss-btn"
                        onClick={() => { setReceiveOpen(false); setReceiveError(null); }}
                        disabled={receiveSaving}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canShowCancelAction && (
              <div className="purchase-detail__action">
                {!confirmCancel ? (
                  <button type="button" className="purchase-detail__cancel-trigger" onClick={() => setConfirmCancel(true)}>
                    <Ban size={14} /> Cancelar compra
                  </button>
                ) : (
                  <div className="purchase-detail__cancel-confirm">
                    <label>
                      Motivo de la cancelación
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Ej. El proveedor no pudo surtir el pedido"
                        rows={2}
                        autoFocus
                      />
                    </label>
                    {cancelError && <p className="purchase-detail__action-error"><AlertTriangle size={13} /> {cancelError}</p>}
                    <div className="purchase-detail__action-buttons">
                      <button
                        type="button"
                        className="purchase-detail__cancel-confirm-btn"
                        onClick={handleConfirmCancel}
                        disabled={cancelSaving}
                      >
                        {cancelSaving ? <Loader2 size={13} className="spin" /> : "Sí, cancelar compra"}
                      </button>
                      <button
                        type="button"
                        className="purchase-detail__dismiss-btn"
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
