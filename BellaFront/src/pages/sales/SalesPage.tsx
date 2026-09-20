import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { Receipt, Eye, AlertTriangle, Loader2, Ban } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { Modal } from "../../components/common/Modal";
import { SaleReceipt } from "../../components/common/SaleReceipt";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { ReportExportButtons } from "../../components/common/ReportExportButtons";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as saleService from "../../services/saleService";
import type { Branch, Sale } from "../../types/api";
import type { ReportColumn } from "../../utils/reportExport";
import "./SalesPage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const STATUS_LABEL: Record<Sale["status"], string> = {
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

type FetchStatus = "loading" | "ready" | "error";

// Same --stagger-delay convention as InventoryPage/ProductsPage/UsersPage.
function staggerStyle(ms: number): CSSProperties {
  return { "--stagger-delay": `${ms}ms` } as unknown as CSSProperties;
}

export function SalesPage() {
  const { user } = useAuth();

  const [sales, setSales] = useState<Sale[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState<Sale["status"] | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    if (!user) return;
    if (user.allBranches) {
      branchService.listBranches().then(setBranches).catch(() => {});
    } else {
      setBranches(user.branches);
    }
  }, [user]);

  // Only worth showing when there's an actual choice — a single-branch
  // user filtering "by branch" against their one accessible branch is a
  // no-op control that just adds clutter.
  const showBranchFilter = !!user?.allBranches || (user?.branches.length ?? 0) > 1;

  const loadSales = useCallback(() => {
    setStatus("loading");
    saleService
      .listSales({
        branchId: branchId || undefined,
        status: statusFilter || undefined,
        // "to" is an inclusive `lte` on createdAt server-side (see
        // saleRepository.ts's listSales) — a bare "YYYY-MM-DD" would coerce
        // to that day's UTC midnight and silently exclude every sale made
        // later that same day, so the end of day is appended here.
        from: fromDate ? `${fromDate}T00:00:00.000` : undefined,
        to: toDate ? `${toDate}T23:59:59.999` : undefined,
      })
      .then((rows) => { setSales(rows); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [branchId, statusFilter, fromDate, toDate]);

  useEffect(() => { loadSales(); }, [loadSales]);

  // ---------- Detail / receipt modal ----------
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openDetail(sale: Sale) {
    setSelectedSale(sale);
    setDetailOpen(true);
    setConfirmCancel(false);
    setCancelReason("");
    setCancelError(null);
  }

  async function handleConfirmCancel() {
    if (!selectedSale) return;
    if (cancelReason.trim().length < 3) {
      setCancelError("El motivo debe tener al menos 3 caracteres.");
      return;
    }
    setCancelSaving(true);
    setCancelError(null);
    try {
      const updated = await saleService.cancelSale(selectedSale.id, cancelReason.trim());
      setSelectedSale(updated);
      setSales((prev) => (prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev));
      setConfirmCancel(false);
      setCancelReason("");
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "No se pudo cancelar la venta.");
    } finally {
      setCancelSaving(false);
    }
  }

  const reportColumns: ReportColumn<Sale>[] = [
    { header: "Folio", accessor: (s) => s.ticketNumber },
    { header: "Fecha", accessor: (s) => new Date(s.createdAt).toLocaleString("es-MX") },
    { header: "Sucursal", accessor: (s) => s.branch.name },
    { header: "Cliente", accessor: (s) => s.customerName },
    { header: "Cajero", accessor: (s) => s.user.displayName },
    { header: "Total", accessor: (s) => currencyFormatter.format(Number(s.total)) },
    { header: "Estado", accessor: (s) => STATUS_LABEL[s.status] },
  ];

  const activeFilterParts: string[] = [];
  if (branchId) activeFilterParts.push(`Sucursal: ${branches.find((b) => b.id === branchId)?.name ?? branchId}`);
  if (statusFilter) activeFilterParts.push(`Estado: ${STATUS_LABEL[statusFilter]}`);
  if (fromDate) activeFilterParts.push(`Desde: ${fromDate}`);
  if (toDate) activeFilterParts.push(`Hasta: ${toDate}`);
  const filtersSummary = activeFilterParts.length > 0 ? activeFilterParts.join(" · ") : undefined;

  const rows = sales ?? [];

  return (
    <div className="sales-page">
      <div className="sales-page__header">
        <div className="sales-page__title">
          <Receipt size={22} />
          <h1>Ventas</h1>
        </div>
      </div>

      <div className="sales-filters">
        {showBranchFilter && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Sale["status"] | "")}>
          <option value="">Todos los estados</option>
          <option value="COMPLETED">Completada</option>
          <option value="CANCELLED">Cancelada</option>
        </Select>
        <label className="sales-filters__date">
          Desde
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="sales-filters__date">
          Hasta
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <ReportExportButtons
          title="Reporte de Ventas"
          columns={reportColumns}
          rows={rows}
          filtersSummary={filtersSummary}
          fileBaseName="ventas"
        />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar el historial de ventas." />}
      {status === "ready" && rows.length === 0 && (
        <StatusState kind="empty" message="No hay ventas que coincidan con estos filtros." />
      )}

      {status === "ready" && rows.length > 0 && (
        <table className="sales-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Sucursal</th>
              <th>Cliente</th>
              <th>Cajero</th>
              <th>Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((sale, i) => (
              <tr key={sale.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td className="sales-table__folio">{sale.ticketNumber}</td>
                <td>{new Date(sale.createdAt).toLocaleString("es-MX")}</td>
                <td>{sale.branch.name}</td>
                <td>{sale.customerName}</td>
                <td>{sale.user.displayName}</td>
                <td className="sales-table__total">{currencyFormatter.format(Number(sale.total))}</td>
                <td>
                  <span className={`sale-status-badge sale-status-badge--${sale.status.toLowerCase()}`}>
                    {STATUS_LABEL[sale.status]}
                  </span>
                </td>
                <td>
                  <button type="button" className="sales-table__view" onClick={() => openDetail(sale)}>
                    <Eye size={15} /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedSale ? `Venta ${selectedSale.ticketNumber}` : "Venta"}
        className="sales-detail-modal"
      >
        {selectedSale && (
          <div className="sales-detail">
            <SaleReceipt sale={selectedSale} />

            {selectedSale.status === "COMPLETED" && (
              <PermissionGate code="sales.cancel">
                <div className="sales-detail__cancel">
                  {!confirmCancel ? (
                    <button type="button" className="sales-detail__cancel-trigger" onClick={() => setConfirmCancel(true)}>
                      <Ban size={14} /> Cancelar venta
                    </button>
                  ) : (
                    <div className="sales-detail__cancel-confirm">
                      <label>
                        Motivo de la cancelación
                        <textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Ej. Cliente se arrepintió de la compra"
                          rows={2}
                          autoFocus
                        />
                      </label>
                      {cancelError && <p className="sales-detail__cancel-error"><AlertTriangle size={13} /> {cancelError}</p>}
                      <div className="sales-detail__cancel-actions">
                        <button
                          type="button"
                          className="sales-detail__cancel-confirm-btn"
                          onClick={handleConfirmCancel}
                          disabled={cancelSaving}
                        >
                          {cancelSaving ? <Loader2 size={13} className="spin" /> : "Sí, cancelar venta"}
                        </button>
                        <button
                          type="button"
                          className="sales-detail__cancel-cancel-btn"
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
