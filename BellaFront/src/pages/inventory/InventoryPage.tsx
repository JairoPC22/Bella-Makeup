import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PackageSearch, SlidersHorizontal, History, Search, Info, AlertTriangle, PackageX } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { ReportExportButtons } from "../../components/common/ReportExportButtons";
import { usePermission } from "../../hooks/usePermission";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import * as branchService from "../../services/branchService";
import * as categoryService from "../../services/categoryService";
import * as inventoryService from "../../services/inventoryService";
import type { Branch, Category, InventoryRow } from "../../types/api";
import type { ReportColumn } from "../../utils/reportExport";
import { InventoryAdjustModal } from "./InventoryAdjustModal";
import { KardexModal } from "./KardexModal";
import "./InventoryPage.css";
import { staggerStyle } from "../../utils/staggerStyle";
import { INVENTORY_STATUS_LABEL as STATUS_LABEL } from "../../utils/inventoryStatus";

const STATUS_OPTIONS: InventoryRow["status"][] = ["AVAILABLE", "LOW", "CRITICAL", "OUT"];

type FetchStatus = "loading" | "ready" | "error";

export function InventoryPage() {
  // Igual patrón que discounts.authorize/sales.cancel: si el rol ya tiene
  // inventory.adjust, el botón "Ajustar" siempre aparece. Si no, solo
  // aparece cuando CompanySettings.allowPinForInventoryAdjust está activo
  // (su default es false, igual de restrictivo que antes de esta función).
  const canAdjustDirectly = usePermission("inventory.adjust");
  const companySettings = useCompanySettings();
  const allowPinForInventoryAdjust = companySettings?.allowPinForInventoryAdjust ?? false;
  const canAttemptAdjust = canAdjustDirectly || allowPinForInventoryAdjust;

  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState<InventoryRow["status"] | "">("");
  const [search, setSearch] = useState("");

  // Fila y abierto/cerrado van en estado separado: la fila solo se actualiza
  // al abrir el modal, nunca se limpia al cerrar, para que la animación de
  // cierre siga teniendo datos válidos que renderizar mientras desaparece.
  const [adjustRow, setAdjustRow] = useState<InventoryRow | undefined>(undefined);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [kardexRow, setKardexRow] = useState<InventoryRow | undefined>(undefined);
  const [kardexOpen, setKardexOpen] = useState(false);

  useEffect(() => {
    branchService.listBranches().then(setBranches).catch(() => {});
    categoryService.listCategories().then(setCategories).catch(() => {});
  }, []);

  const loadInventory = useCallback(() => {
    setStatus("loading");
    inventoryService
      .listInventory({
        branchId: branchId || undefined,
        categoryId: categoryId || undefined,
        status: statusFilter || undefined,
      })
      .then((r) => { setRows(r); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [branchId, categoryId, statusFilter]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  // Fetch separado y sin filtrar a propósito: si reusara `rows`, filtrar por
  // estado o sucursal pondría en cero las demás categorías y la alerta
  // just being filtered out of view. Reloaded after every adjustment
  // (passed into InventoryAdjustModal's onAdjusted below) so restocking an
  // item clears its own alert without needing a manual refresh.
  const [alertRows, setAlertRows] = useState<InventoryRow[] | null>(null);
  const loadAlertSummary = useCallback(() => {
    inventoryService.listInventory({}).then(setAlertRows).catch(() => {});
  }, []);
  useEffect(() => { loadAlertSummary(); }, [loadAlertSummary]);

  const stockAlert = useMemo(() => {
    const rows = alertRows ?? [];
    return {
      out: rows.filter((r) => r.status === "OUT").length,
      critical: rows.filter((r) => r.status === "CRITICAL").length,
      low: rows.filter((r) => r.status === "LOW").length,
    };
  }, [alertRows]);

  function viewStatus(target: InventoryRow["status"]) {
    setStatusFilter(target);
    setBranchId("");
    setCategoryId("");
  }

  const query = search.trim().toLowerCase();
  const visibleRows = (rows ?? []).filter((row) => {
    if (!query) return true;
    return (
      row.product.name.toLowerCase().includes(query) ||
      row.product.sku.toLowerCase().includes(query) ||
      (row.variant?.name.toLowerCase().includes(query) ?? false) ||
      (row.variant?.sku.toLowerCase().includes(query) ?? false)
    );
  });

  // One-line description of whatever filters are currently active, shown
  // under the title in the exported report — omitted entirely (not an
  // empty string) when nothing is filtered, per this export utility's
  // ReportOptions contract.
  const activeFilterParts: string[] = [];
  if (branchId) activeFilterParts.push(`Sucursal: ${branches.find((b) => b.id === branchId)?.name ?? branchId}`);
  if (categoryId) activeFilterParts.push(`Categoría: ${categories.find((c) => c.id === categoryId)?.name ?? categoryId}`);
  if (statusFilter) activeFilterParts.push(`Estado: ${STATUS_LABEL[statusFilter]}`);
  if (query) activeFilterParts.push(`Búsqueda: "${search.trim()}"`);
  const filtersSummary = activeFilterParts.length > 0 ? activeFilterParts.join(" · ") : undefined;

  const reportColumns: ReportColumn<InventoryRow>[] = [
    { header: "Producto", accessor: (row) => `${row.product.name} (${row.product.sku})` },
    { header: "Variante", accessor: (row) => (row.variant ? row.variant.name : "—") },
    { header: "Sucursal", accessor: (row) => row.branch.name },
    { header: "Stock", accessor: (row) => row.stock },
    { header: "Estado", accessor: (row) => STATUS_LABEL[row.status] },
  ];

  return (
    <div className="inventory-page">
      <div className="inventory-page__header">
        <div className="inventory-page__title">
          <PackageSearch size={22} />
          <h1>Inventario</h1>
        </div>
      </div>

      <p className="inventory-page__subtitle">
        El inventario muestra el stock de cada producto por sucursal. Para crear o editar productos, ve a{" "}
        <PermissionGate code="products.view" fallback="Productos">
          <Link to="/admin/productos">Productos</Link>
        </PermissionGate>
        .
      </p>

      {/* Always-on health summary — separate from the per-row status
          column below it, which only shows up once you're already looking
          at a (possibly filtered) table. This surfaces the same
          out-of-stock/low-stock condition the moment the page opens,
          across every branch/category, whether or not the table itself is
          currently filtered to something else. Nothing renders once both
          counts are 0 — no need to show an empty "all good" banner taking
          up space every time inventory is healthy. */}
      {(stockAlert.out > 0 || stockAlert.critical > 0 || stockAlert.low > 0) && (
        <div className="inventory-alerts animate-in">
          {stockAlert.out > 0 && (
            <div className="inventory-alert inventory-alert--out">
              <span className="inventory-alert__icon"><PackageX size={17} /></span>
              <p>
                <strong>{stockAlert.out}</strong> {stockAlert.out === 1 ? "producto agotado" : "productos agotados"}
              </p>
              <button type="button" onClick={() => viewStatus("OUT")}>Ver agotados</button>
            </div>
          )}
          {(stockAlert.critical > 0 || stockAlert.low > 0) && (
            <div className="inventory-alert inventory-alert--low">
              <span className="inventory-alert__icon"><AlertTriangle size={17} /></span>
              <p>
                {stockAlert.critical > 0 && (
                  <>
                    <strong>{stockAlert.critical}</strong> en nivel crítico
                    {stockAlert.low > 0 ? " · " : ""}
                  </>
                )}
                {stockAlert.low > 0 && (
                  <>
                    <strong>{stockAlert.low}</strong> con stock bajo
                  </>
                )}
              </p>
              {/* Un solo botón que solo filtraba a CRITICAL escondía en
                  silencio los productos LOW cuando ambos conteos eran
                  mayores a 0 — el texto de arriba anunciaba los dos, pero
                  solo se podía ver uno de los dos grupos. Con ambos
                  presentes se muestran dos botones, cada uno a su propio
                  filtro. */}
              {stockAlert.critical > 0 && stockAlert.low > 0 ? (
                <div className="inventory-alert__buttons">
                  <button type="button" onClick={() => viewStatus("CRITICAL")}>Ver crítico</button>
                  <button type="button" onClick={() => viewStatus("LOW")}>Ver bajo</button>
                </div>
              ) : (
                <button type="button" onClick={() => viewStatus(stockAlert.critical > 0 ? "CRITICAL" : "LOW")}>
                  Ver stock bajo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="inventory-filters">
        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InventoryRow["status"] | "")}>
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <label className="inventory-filters__search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar producto o variante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <ReportExportButtons
          title="Reporte de Inventario"
          columns={reportColumns}
          rows={visibleRows}
          filtersSummary={filtersSummary}
          fileBaseName="inventario"
        />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar el inventario." />}
      {status === "ready" && visibleRows.length === 0 && (
        <StatusState kind="empty" message="No hay inventario que coincida con estos filtros." />
      )}

      {status === "ready" && visibleRows.length > 0 && (
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Variante</th>
              <th>Sucursal</th>
              <th>Stock</th>
              <th>
                <span className="inventory-table__th-info">
                  Estado
                  <span
                    className="inventory-table__info-icon"
                    tabIndex={0}
                    title="Disponible: stock por encima del mínimo. Bajo: stock igual o menor al mínimo. Crítico: stock igual o menor a la mitad del mínimo. Agotado: sin existencias."
                    aria-label="Cómo se calcula el estado del stock: Disponible (por encima del mínimo), Bajo (en el mínimo o por debajo), Crítico (en la mitad del mínimo o por debajo), Agotado (sin existencias)."
                  >
                    <Info size={14} />
                  </span>
                </span>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={row.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td>
                  <p className="inventory-table__product-name">{row.product.name}</p>
                  <p className="inventory-table__product-sku">{row.product.sku}</p>
                </td>
                <td>{row.variant ? row.variant.name : "—"}</td>
                <td>{row.branch.name}</td>
                <td className="inventory-table__stock">{row.stock}</td>
                <td>
                  <span className={`stock-badge stock-badge--${row.status.toLowerCase()}`}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td>
                  <div className="inventory-table__actions">
                    {canAttemptAdjust && (
                      <button onClick={() => { setAdjustRow(row); setAdjustOpen(true); }} title="Ajustar" aria-label="Ajustar inventario">
                        <SlidersHorizontal size={16} /> Ajustar
                      </button>
                    )}
                    <button onClick={() => { setKardexRow(row); setKardexOpen(true); }} title="Ver movimientos" aria-label="Ver movimientos">
                      <History size={16} /> Ver movimientos
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Prefixed keys — both modals fall back to the same "none" sentinel
          before either has ever been opened, and (as this page's own smoke
          test caught) once one row has been adjusted and then re-selected
          for its kardex, both key expressions can resolve to the exact
          same InventoryRow id. Without a per-modal prefix the two
          <key>-remount elements collide as React siblings, which trips
          "Encountered two children with the same key" and risks the wrong
          one's mount/unmount state getting reused. */}
      <InventoryAdjustModal
        key={`adjust-${adjustRow?.id ?? "none"}`}
        row={adjustRow}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onAdjusted={() => { loadInventory(); loadAlertSummary(); }}
        requiresPin={!canAdjustDirectly}
      />

      <KardexModal
        key={`kardex-${kardexRow?.id ?? "none"}`}
        row={kardexRow}
        open={kardexOpen}
        onClose={() => setKardexOpen(false)}
      />
    </div>
  );
}
