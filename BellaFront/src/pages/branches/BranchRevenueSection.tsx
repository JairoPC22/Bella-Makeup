import { Fragment, useEffect, useMemo, useState } from "react";
import { Wallet, ChevronDown, X, Loader2 } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { ReportExportButtons } from "../../components/common/ReportExportButtons";
import { DateRangePicker } from "../../components/common/DateRangePicker";
import RubberSegment from "../../components/common/RubberSegment";
import * as branchService from "../../services/branchService";
import * as saleService from "../../services/saleService";
import type { BranchRevenueRow, Sale } from "../../types/api";

import { currencyFormatter } from "../../utils/currency";

type Period = "today" | "yesterday" | "last30" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  last30: "Últimos 30 días",
  custom: "Rango de fechas",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Convierte el periodo elegido en el par [from, to] ISO que espera el backend.
function resolveRange(period: Period, customFrom: string, customTo: string): { from?: string; to?: string } {
  const today = new Date();
  if (period === "today") {
    const d = isoDate(today);
    return { from: `${d}T00:00:00`, to: `${d}T23:59:59` };
  }
  if (period === "yesterday") {
    const d = isoDate(addDays(today, -1));
    return { from: `${d}T00:00:00`, to: `${d}T23:59:59` };
  }
  if (period === "last30") {
    return { from: `${isoDate(addDays(today, -29))}T00:00:00`, to: `${isoDate(today)}T23:59:59` };
  }
  // custom
  if (!customFrom && !customTo) return {};
  return { from: customFrom ? `${customFrom}T00:00:00` : undefined, to: customTo ? `${customTo}T23:59:59` : undefined };
}

// Panel de ingresos por sucursal (solo admin), debajo de la grilla de
// sucursales. Componente aparte porque maneja su propio estado de periodo,
// ajeno al CRUD de sucursales; obtiene sus propias filas ya agregadas.
export function BranchRevenueSection() {
  const [period, setPeriod] = useState<Period>("last30");
  const [customFrom, setCustomFrom] = useState(isoDate(addDays(new Date(), -6)));
  const [customTo, setCustomTo] = useState(isoDate(new Date()));
  const [rows, setRows] = useState<BranchRevenueRow[] | null>(null);
  const [grandTotal, setGrandTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Desglose por sucursal: expandir una fila trae las ventas individuales
  // de esa sucursal dentro del mismo rango de fechas ya aplicado — se pide
  // bajo demanda (no todas de una vez) para no disparar N peticiones por
  // cada refresco de la tabla.
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [branchSales, setBranchSales] = useState<Sale[] | null>(null);
  const [branchSalesStatus, setBranchSalesStatus] = useState<"loading" | "ready" | "error">("loading");

  const range = useMemo(() => resolveRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const hasCustomFilter = period !== "last30";

  function clearFilters() {
    setPeriod("last30");
    setCustomFrom(isoDate(addDays(new Date(), -6)));
    setCustomTo(isoDate(new Date()));
    setExpandedBranchId(null);
  }

  function toggleBranch(branchId: string) {
    if (expandedBranchId === branchId) { setExpandedBranchId(null); return; }
    setExpandedBranchId(branchId);
    setBranchSalesStatus("loading");
    saleService
      .listSales({ branchId, status: "COMPLETED", from: range.from, to: range.to })
      .then((sales) => { setBranchSales(sales); setBranchSalesStatus("ready"); })
      .catch(() => setBranchSalesStatus("error"));
  }

  // Si cambia el rango mientras hay una sucursal expandida, su desglose
  // queda desactualizado — se vuelve a cargar en lugar de dejar ventas de
  // un filtro anterior a la vista.
  useEffect(() => {
    if (!expandedBranchId) return;
    setBranchSalesStatus("loading");
    saleService
      .listSales({ branchId: expandedBranchId, status: "COMPLETED", from: range.from, to: range.to })
      .then((sales) => { setBranchSales(sales); setBranchSalesStatus("ready"); })
      .catch(() => setBranchSalesStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => {
    setStatus("loading");
    branchService.getBranchRevenue(range.from, range.to)
      .then((r) => { setRows(r.rows); setGrandTotal(r.grandTotal); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [range.from, range.to]);

  const filtersSummary = `${PERIOD_LABELS[period]}: ${range.from?.slice(0, 10) ?? "—"} a ${range.to?.slice(0, 10) ?? "—"}`;

  const reportColumns = [
    { header: "Sucursal", accessor: (r: BranchRevenueRow) => r.branchName },
    { header: "Ventas", accessor: (r: BranchRevenueRow) => r.saleCount },
    { header: "Ingresos", accessor: (r: BranchRevenueRow) => currencyFormatter.format(r.revenue) },
  ];

  return (
    <section className="branches-revenue">
      <header className="branches-revenue__header">
        <div className="branches-revenue__title">
          <Wallet size={18} />
          <div>
            <h2>Ingresos por sucursal</h2>
            <p>Solo visible para administradores. Suma las ventas completadas de cada sucursal.</p>
          </div>
        </div>
      </header>

      <div className="branches-revenue__filters">
        {/* Replaces the old plain pill-button row (React Bits' RubberSegment,
            adapted into components/common) — a real rubber-band thumb slides
            and stretches between "Hoy/Ayer/Últimos 30 días/Rango de fechas"
            instead of just swapping a background color per click. */}
        <RubberSegment
          items={(Object.keys(PERIOD_LABELS) as Period[]).map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
          value={period}
          onChange={(p) => setPeriod(p as Period)}
          trackColor="var(--color-bg)"
          thumbColor="var(--color-pink-deep)"
          textColor="var(--color-text-secondary)"
          activeTextColor="var(--color-white)"
          size="sm"
          radius={999}
          equalSlots={false}
          aria-label="Periodo de ingresos por sucursal"
        />

        {period === "custom" && (
          <DateRangePicker
            from={customFrom}
            to={customTo}
            onChange={(r) => { setCustomFrom(r.from); setCustomTo(r.to); }}
          />
        )}

        {hasCustomFilter && (
          <button type="button" className="branches-revenue__clear-filters" onClick={clearFilters}>
            <X size={13} /> Borrar filtros
          </button>
        )}

        <ReportExportButtons
          title="Ingresos por sucursal"
          columns={reportColumns}
          rows={rows ?? []}
          filtersSummary={filtersSummary}
          fileBaseName="ingresos-sucursales"
        />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudieron cargar los ingresos." />}
      {status === "ready" && rows && rows.length === 0 && <StatusState kind="empty" message="No hay sucursales registradas." />}

      {status === "ready" && rows && rows.length > 0 && (
        <div className="branches-revenue__table-wrap">
          <table className="branches-revenue__table">
            <thead>
              <tr><th /><th>Sucursal</th><th>Ventas</th><th>Ingresos</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isExpanded = expandedBranchId === r.branchId;
                return (
                  <Fragment key={r.branchId}>
                    <tr
                      className={`branches-revenue__row${r.saleCount > 0 ? " is-clickable" : ""}${isExpanded ? " is-expanded" : ""}`}
                      onClick={() => r.saleCount > 0 && toggleBranch(r.branchId)}
                    >
                      <td className="branches-revenue__chevron-cell">
                        {r.saleCount > 0 && (
                          <ChevronDown size={14} className={isExpanded ? "is-open" : ""} />
                        )}
                      </td>
                      <td>{r.branchName}</td>
                      <td>{r.saleCount}</td>
                      <td>{currencyFormatter.format(r.revenue)}</td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${r.branchId}-detail`} className="branches-revenue__detail-row">
                        <td colSpan={4}>
                          {branchSalesStatus === "loading" && (
                            <div className="branches-revenue__detail-loading"><Loader2 size={14} className="spin" /> Cargando ventas…</div>
                          )}
                          {branchSalesStatus === "error" && (
                            <StatusState kind="error" compact message="No se pudieron cargar las ventas de esta sucursal." />
                          )}
                          {branchSalesStatus === "ready" && branchSales && branchSales.length === 0 && (
                            <StatusState kind="empty" compact message="Sin ventas en este rango." />
                          )}
                          {branchSalesStatus === "ready" && branchSales && branchSales.length > 0 && (
                            <table className="branches-revenue__detail-table">
                              <thead>
                                <tr><th>Ticket</th><th>Fecha</th><th>Cajero/a</th><th>Cliente</th><th>Artículos</th><th>Total</th></tr>
                              </thead>
                              <tbody>
                                {branchSales.map((s) => (
                                  <tr key={s.id}>
                                    <td>{s.ticketNumber}</td>
                                    <td>{new Date(s.createdAt).toLocaleString("es-MX")}</td>
                                    <td>{s.user.displayName}</td>
                                    <td>{s.customerName || "Público general"}</td>
                                    <td>{s.itemCount}</td>
                                    <td>{currencyFormatter.format(Number(s.total))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td /><td>Total</td><td>{rows.reduce((s, r) => s + r.saleCount, 0)}</td><td>{currencyFormatter.format(grandTotal)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
