import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Search, X, Check, AlertTriangle, Loader2, Ban, CheckCircle2, EyeOff } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { Modal } from "../../components/common/Modal";
import { Badge } from "../../components/common/Badge";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as categoryService from "../../services/categoryService";
import * as brandService from "../../services/brandService";
import * as productService from "../../services/productService";
import * as inventoryCountService from "../../services/inventoryCountService";
import type { Branch, Brand, Category, InventoryCount, Product } from "../../types/api";
import "./InventoryCountsPage.css";
import { staggerStyle } from "../../utils/staggerStyle";

type FetchStatus = "loading" | "ready" | "error";

const STATUS_LABEL: Record<InventoryCount["status"], string> = {
  OPEN: "En progreso",
  COMPLETED: "Cerrado",
  CANCELLED: "Cancelado",
};
const STATUS_TONE: Record<InventoryCount["status"], "success" | "neutral" | "danger"> = {
  OPEN: "neutral",
  COMPLETED: "success",
  CANCELLED: "danger",
};

function scopeLabel(count: InventoryCount): string {
  if (count.category) return `Categoría: ${count.category.name}`;
  if (count.brand) return `Marca: ${count.brand.name}`;
  return "Selección manual";
}

type ScopeMode = "category" | "brand" | "manual";

interface DraftLine { productId: string; variantId?: string; name: string; sku: string; }

export function InventoryCountsPage() {
  const { user } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const showBranchFilter = !!user?.allBranches || (user?.branches.length ?? 0) > 1;

  useEffect(() => {
    if (!user) return;
    if (user.allBranches) {
      branchService.listBranches().then((list) => {
        const active = list.filter((b) => b.status === "ACTIVE");
        setBranches(active);
        setBranchId((prev) => prev || active[0]?.id || "");
      }).catch(() => {});
    } else {
      setBranches(user.branches);
      setBranchId(user.branches[0]?.id ?? "");
    }
  }, [user]);

  // ---------- Listado ----------
  const [counts, setCounts] = useState<InventoryCount[] | null>(null);
  const [listStatus, setListStatus] = useState<FetchStatus>("loading");
  const [statusFilter, setStatusFilter] = useState<InventoryCount["status"] | "">("");
  const [filterBranchId, setFilterBranchId] = useState("");

  const loadCounts = useCallback(() => {
    setListStatus("loading");
    inventoryCountService
      .listInventoryCounts({ branchId: filterBranchId || undefined, status: statusFilter || undefined })
      .then((rows) => { setCounts(rows); setListStatus("ready"); })
      .catch(() => setListStatus("error"));
  }, [filterBranchId, statusFilter]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  function upsertCount(count: InventoryCount) {
    setCounts((prev) => {
      if (!prev) return [count];
      const exists = prev.some((c) => c.id === count.id);
      return exists ? prev.map((c) => (c.id === count.id ? count : c)) : [count, ...prev];
    });
  }

  // ---------- Modal de creación ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("category");
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<Product[]>([]);
  const [manualLines, setManualLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    categoryService.listCategories().then(setCategories).catch(() => {});
    brandService.listBrands().then(setBrands).catch(() => {});
  }, [createOpen]);

  useEffect(() => {
    const q = manualQuery.trim();
    if (!q || scopeMode !== "manual") { setManualResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      productService.listProducts({ search: q, status: "ACTIVE" })
        .then((list) => { if (!cancelled) setManualResults(list); })
        .catch(() => { if (!cancelled) setManualResults([]); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [manualQuery, scopeMode]);

  function addManualLine(p: Product) {
    if (manualLines.some((l) => l.productId === p.id)) return;
    setManualLines((prev) => [...prev, { productId: p.id, name: p.name, sku: p.sku }]);
  }
  function removeManualLine(productId: string) {
    setManualLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function resetCreateForm() {
    setScopeMode("category");
    setCategoryId(""); setBrandId(""); setManualQuery(""); setManualResults([]); setManualLines([]);
    setNotes(""); setCreateError(null);
  }

  const [openedCount, setOpenedCount] = useState<InventoryCount | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  async function handleCreate() {
    if (!branchId) { setCreateError("Selecciona una sucursal."); return; }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const created = await inventoryCountService.createInventoryCount({
        branchId,
        categoryId: scopeMode === "category" ? categoryId || undefined : undefined,
        brandId: scopeMode === "brand" ? brandId || undefined : undefined,
        productIds: scopeMode === "manual" ? manualLines.map((l) => l.productId) : undefined,
        notes: notes.trim() || undefined,
      });
      upsertCount(created);
      setCreateOpen(false);
      resetCreateForm();
      setOpenedCount(created);
      setDetailOpen(true);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear el conteo.");
    } finally {
      setCreateSaving(false);
    }
  }

  const canCreate = branchId && (
    (scopeMode === "category" && categoryId) ||
    (scopeMode === "brand" && brandId) ||
    (scopeMode === "manual" && manualLines.length > 0)
  );

  // ---------- Detalle / sesión de conteo ----------
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  function openDetail(count: InventoryCount) {
    setOpenedCount(count);
    setDetailOpen(true);
    setProgressError(null);
    setCompleteError(null);
    const draft: Record<string, string> = {};
    count.items.forEach((item) => {
      if (item.countedStock != null) draft[item.id] = String(item.countedStock);
    });
    setDraftCounts(draft);
  }

  const pendingLines = useMemo(() => {
    if (!openedCount) return [];
    return openedCount.items
      .filter((item) => {
        const raw = draftCounts[item.id];
        return raw !== undefined && raw !== "" && item.countedStock == null;
      })
      .map((item) => ({ itemId: item.id, countedStock: Math.max(0, Math.floor(Number(draftCounts[item.id]))) }));
  }, [openedCount, draftCounts]);

  async function handleSaveProgress() {
    if (!openedCount || pendingLines.length === 0) return;
    setSavingProgress(true);
    setProgressError(null);
    try {
      const updated = await inventoryCountService.saveCountedItems(openedCount.id, pendingLines);
      setOpenedCount(updated);
      upsertCount(updated);
    } catch (err) {
      setProgressError(err instanceof ApiError ? err.message : "No se pudo guardar el avance.");
    } finally {
      setSavingProgress(false);
    }
  }

  const allCounted = openedCount ? openedCount.items.every((item) => {
    const raw = draftCounts[item.id];
    return item.countedStock != null || (raw !== undefined && raw !== "");
  }) : false;

  async function handleComplete() {
    if (!openedCount) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      // Guarda primero las líneas sin persistir para no perder lo capturado.
      if (pendingLines.length > 0) {
        await inventoryCountService.saveCountedItems(openedCount.id, pendingLines);
      }
      const updated = await inventoryCountService.completeInventoryCount(openedCount.id);
      setOpenedCount(updated);
      upsertCount(updated);
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : "No se pudo cerrar el conteo.");
    } finally {
      setCompleting(false);
    }
  }

  async function handleCancel() {
    if (!openedCount) return;
    setCancelling(true);
    try {
      const updated = await inventoryCountService.cancelInventoryCount(openedCount.id);
      setOpenedCount(updated);
      upsertCount(updated);
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : "No se pudo cancelar el conteo.");
    } finally {
      setCancelling(false);
    }
  }

  const rows = counts ?? [];

  return (
    <div className="counts-page">
      <div className="counts-page__header">
        <div className="counts-page__title">
          <ClipboardList size={22} />
          <h1>Inventarios físicos</h1>
        </div>
        <PermissionGate code="inventory.count">
          <button type="button" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
            <Plus size={16} /> Nuevo conteo
          </button>
        </PermissionGate>
      </div>
      <p className="counts-page__subtitle">
        Cuenta el inventario por categoría, marca o una selección manual de productos — sin necesidad de cerrar toda la sucursal.
      </p>

      <div className="counts-filters">
        {showBranchFilter && (
          <Select value={filterBranchId} onChange={(e) => setFilterBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InventoryCount["status"] | "")}>
          <option value="">Todos los estados</option>
          <option value="OPEN">En progreso</option>
          <option value="COMPLETED">Cerrado</option>
          <option value="CANCELLED">Cancelado</option>
        </Select>
      </div>

      {listStatus === "loading" && <StatusState kind="loading" />}
      {listStatus === "error" && <StatusState kind="error" message="No se pudieron cargar los conteos." />}
      {listStatus === "ready" && rows.length === 0 && <StatusState kind="empty" message="Todavía no hay conteos registrados." />}

      {listStatus === "ready" && rows.length > 0 && (
        <table className="counts-table">
          <thead>
            <tr><th>Folio</th><th>Sucursal</th><th>Ámbito</th><th>Progreso</th><th>Estado</th><th>Inició</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td className="counts-table__folio">{c.countNumber}</td>
                <td>{c.branch.name}</td>
                <td>{scopeLabel(c)}</td>
                <td>
                  <div className="counts-table__progress" title={`${c.countedItemCount} de ${c.itemCount} productos contados`}>
                    <div className="counts-table__progress-track">
                      <div
                        className="counts-table__progress-fill"
                        style={{ width: `${c.itemCount === 0 ? 0 : (c.countedItemCount / c.itemCount) * 100}%` }}
                      />
                    </div>
                    <span className="counts-table__progress-text">{c.countedItemCount}/{c.itemCount}</span>
                  </div>
                </td>
                <td><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge></td>
                <td>{c.startedBy.displayName}</td>
                <td><button type="button" className="counts-table__view" onClick={() => openDetail(c)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- Modal de creación ---------- */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo conteo físico" className="counts-create-modal">
        <div className="counts-create">
          {showBranchFilter && (
            <label className="counts-create__field">
              Sucursal
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </label>
          )}

          <div className="counts-create__scope-tabs">
            <button type="button" className={scopeMode === "category" ? "is-active" : ""} onClick={() => setScopeMode("category")}>Por categoría</button>
            <button type="button" className={scopeMode === "brand" ? "is-active" : ""} onClick={() => setScopeMode("brand")}>Por marca</button>
            <button type="button" className={scopeMode === "manual" ? "is-active" : ""} onClick={() => setScopeMode("manual")}>Selección manual</button>
          </div>

          {scopeMode === "category" && (
            <label className="counts-create__field">
              Categoría
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Selecciona una categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
          )}
          {scopeMode === "brand" && (
            <label className="counts-create__field">
              Marca
              <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">Selecciona una marca</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </label>
          )}
          {scopeMode === "manual" && (
            <div className="counts-create__manual">
              <label className="counts-create__search">
                <Search size={14} />
                <input type="text" placeholder="Buscar producto por nombre o SKU..." value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} />
              </label>
              {manualResults.length > 0 && (
                <ul className="counts-create__results">
                  {manualResults.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addManualLine(p)}>
                        <span>{p.name}</span><span className="counts-create__results-sku">{p.sku}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {manualLines.length > 0 && (
                <ul className="counts-create__lines">
                  {manualLines.map((l) => (
                    <li key={l.productId}>
                      <span>{l.name}</span>
                      <button type="button" onClick={() => removeManualLine(l.productId)} aria-label={`Quitar ${l.name}`}><X size={13} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <label className="counts-create__field">
            Notas (opcional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Conteo mensual de labiales" />
          </label>

          {createError && <p className="counts-create__error"><AlertTriangle size={13} /> {createError}</p>}

          <button type="button" className="counts-create__submit" onClick={handleCreate} disabled={!canCreate || createSaving}>
            {createSaving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} {createSaving ? "Creando..." : "Crear conteo"}
          </button>
        </div>
      </Modal>

      {/* ---------- Modal de detalle / conteo ---------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={openedCount ? `Conteo ${openedCount.countNumber}` : "Conteo"}
        className="counts-detail-modal"
      >
        {openedCount && (
          <div className="counts-detail">
            <div className="counts-detail__meta">
              <span>{openedCount.branch.name}</span>
              <span>{scopeLabel(openedCount)}</span>
              <Badge tone={STATUS_TONE[openedCount.status]}>{STATUS_LABEL[openedCount.status]}</Badge>
            </div>
            {openedCount.notes && <p className="counts-detail__notes">{openedCount.notes}</p>}

            {openedCount.status === "OPEN" && (
              <p className="counts-detail__blind-notice">
                <EyeOff size={13} /> No verás el inventario registrado en el sistema mientras cuentas — anota exactamente lo que ves físicamente.
              </p>
            )}

            <ul className="counts-detail__items">
              {openedCount.items.map((item) => {
                const isCounted = item.countedStock != null;
                const label = item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name;
                const sku = item.variant?.sku ?? item.product.sku;
                return (
                  <li key={item.id} className="counts-detail__item">
                    <div className="counts-detail__item-info">
                      <p className="counts-detail__item-name">{label}</p>
                      <p className="counts-detail__item-sku">{sku}</p>
                    </div>
                    {openedCount.status === "OPEN" ? (
                      isCounted ? (
                        <span className="counts-detail__item-done"><CheckCircle2 size={14} /> Contado: {item.countedStock}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          placeholder="Cantidad física"
                          className="counts-detail__item-input"
                          value={draftCounts[item.id] ?? ""}
                          onChange={(e) => setDraftCounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      )
                    ) : (
                      <div className="counts-detail__item-result">
                        <span>Sistema: {item.systemStock ?? "—"}</span>
                        <span>Contado: {item.countedStock ?? "—"}</span>
                        {item.difference != null && item.difference !== 0 && (
                          <span className={`counts-detail__diff ${item.difference > 0 ? "is-positive" : "is-negative"}`}>
                            {item.difference > 0 ? "+" : ""}{item.difference}
                          </span>
                        )}
                        {item.difference === 0 && <span className="counts-detail__diff is-exact">Exacto</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {openedCount.status === "OPEN" && (
              <div className="counts-detail__actions">
                {progressError && <p className="counts-create__error"><AlertTriangle size={13} /> {progressError}</p>}
                {completeError && <p className="counts-create__error"><AlertTriangle size={13} /> {completeError}</p>}
                <div className="counts-detail__actions-row">
                  <button type="button" className="counts-detail__save" onClick={handleSaveProgress} disabled={pendingLines.length === 0 || savingProgress}>
                    {savingProgress ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Guardar avance
                  </button>
                  <button type="button" className="counts-detail__complete" onClick={handleComplete} disabled={!allCounted || completing}>
                    {completing ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Cerrar conteo
                  </button>
                  <button type="button" className="counts-detail__cancel" onClick={handleCancel} disabled={cancelling}>
                    <Ban size={14} /> Cancelar conteo
                  </button>
                </div>
                {!allCounted && <p className="counts-detail__hint">Debes contar todos los productos antes de cerrar el conteo.</p>}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
