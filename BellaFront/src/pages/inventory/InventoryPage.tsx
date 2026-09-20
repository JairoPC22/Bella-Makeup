import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PackageSearch, SlidersHorizontal, History, Search, Info } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { ReportExportButtons } from "../../components/common/ReportExportButtons";
import * as branchService from "../../services/branchService";
import * as categoryService from "../../services/categoryService";
import * as inventoryService from "../../services/inventoryService";
import type { Branch, Category, InventoryRow } from "../../types/api";
import type { ReportColumn } from "../../utils/reportExport";
import { InventoryAdjustModal } from "./InventoryAdjustModal";
import { KardexModal } from "./KardexModal";
import "./InventoryPage.css";

const STATUS_LABEL: Record<InventoryRow["status"], string> = {
  AVAILABLE: "Disponible",
  LOW: "Bajo",
  CRITICAL: "Crítico",
  OUT: "Agotado",
};

const STATUS_OPTIONS: InventoryRow["status"][] = ["AVAILABLE", "LOW", "CRITICAL", "OUT"];

type FetchStatus = "loading" | "ready" | "error";

export function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState<InventoryRow["status"] | "">("");
  const [search, setSearch] = useState("");

  // Row data and open/closed are deliberately separate pieces of state
  // (mirrors UserFormModal's key={editingUser?.id ?? "new"} pattern) — the
  // row is only ever updated at the moment a modal opens, never cleared
  // when it closes, so the modal's own close-fade animation still has
  // valid row data to render while it transitions out instead of losing it
  // mid-animation.
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
          <Link to="/productos">Productos</Link>
        </PermissionGate>
        .
      </p>

      <div className="inventory-filters">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InventoryRow["status"] | "")}>
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
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
            {visibleRows.map((row) => (
              <tr key={row.id}>
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
                    <PermissionGate code="inventory.adjust">
                      <button onClick={() => { setAdjustRow(row); setAdjustOpen(true); }} title="Ajustar" aria-label="Ajustar inventario">
                        <SlidersHorizontal size={16} /> Ajustar
                      </button>
                    </PermissionGate>
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
        onAdjusted={loadInventory}
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
