import { useCallback, useEffect, useState } from "react";
import {
  Receipt,
  Eye,
  AlertTriangle,
  Loader2,
  Ban,
  RotateCcw,
  ArrowLeft,
  Plus,
  Minus,
  Search,
  X,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import { staggerStyle } from "../../utils/staggerStyle";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { DateRangePicker } from "../../components/common/DateRangePicker";
import { Modal } from "../../components/common/Modal";
import { SaleReceipt } from "../../components/common/SaleReceipt";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { PinAuthPrompt } from "../../components/common/PinAuthPrompt";
import { ReportExportButtons } from "../../components/common/ReportExportButtons";
import { useAuth } from "../../hooks/useAuth";
import { usePermission } from "../../hooks/usePermission";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as saleService from "../../services/saleService";
import * as productService from "../../services/productService";
import * as returnService from "../../services/returnService";
import type { CreateReturnInput, ReturnNewItemInput, ReturnedItemInput } from "../../services/returnService";
import type { Branch, Product, ProductVariant, Return, Sale } from "../../types/api";
import type { ReportColumn } from "../../utils/reportExport";
import "./SalesPage.css";

import { currencyFormatter } from "../../utils/currency";

const STATUS_LABEL: Record<Sale["status"], string> = {
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const RESOLUTION_LABEL: Record<Return["resolution"], string> = {
  EXACT_EXCHANGE: "Cambio exacto",
  CUSTOMER_OWES: "Cliente paga diferencia",
  REFUND_OWED: "Reembolso al cliente",
};

const PAYMENT_METHOD_LABEL: Record<NonNullable<Return["paymentMethod"]>, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const PAYMENT_METHODS: NonNullable<Return["paymentMethod"]>[] = ["CASH", "CARD", "TRANSFER", "OTHER"];

type FetchStatus = "loading" | "ready" | "error";
type PageTab = "ventas" | "devoluciones";

// Mirrors BellaBack's saleService.ts's resolveUnitPrice (same helper as
// PosPage.tsx uses) — a variant's own price wins outright; otherwise the
// product's promoPrice is used only when it's actually lower than the
// regular price. Client-side estimate only for the exchange preview.
function resolveUnitPrice(product: Product, variant?: ProductVariant): number {
  if (variant?.price != null) return Number(variant.price);
  const price = Number(product.price);
  const promo = product.promoPrice != null ? Number(product.promoPrice) : null;
  if (promo != null && promo < price) return promo;
  return price;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------- Return-creation state for one sale ----------
interface ReturnLineState {
  saleItemId: string;
  productName: string;
  variantName?: string | null;
  sku: string;
  originalQuantity: number;
  unitPrice: number;
  included: boolean;
  quantity: number;
  // undefined until the cashier makes an explicit choice — never defaulted,
  // per returnService.ts's own doc-comment on `restock`.
  restock: boolean | undefined;
}

interface NewLineState {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
}

function buildReturnLines(sale: Sale): ReturnLineState[] {
  return sale.items.map((item) => ({
    saleItemId: item.id,
    productName: item.product.name,
    variantName: item.variant?.name,
    sku: item.variant?.sku ?? item.product.sku,
    originalQuantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    included: false,
    quantity: item.quantity,
    restock: undefined,
  }));
}

export function SalesPage() {
  const { user } = useAuth();
  const hasReturnsView = usePermission("returns.view");
  const companySettings = useCompanySettings();
  const requirePinForReturns = companySettings?.requirePinForReturns ?? true;
  // Igual que discounts.authorize en el POS: si el rol ya tiene sales.cancel,
  // nunca se pide PIN. Si no lo tiene, solo se ofrece la opción de PIN
  // cuando CompanySettings.allowPinForSaleCancel está activo (su default es
  // false: sin él, cancelar sigue siendo exclusivo de quien tiene el permiso).
  const canCancelSaleDirectly = usePermission("sales.cancel");
  const allowPinForSaleCancel = companySettings?.allowPinForSaleCancel ?? false;
  const canAttemptCancelSale = canCancelSaleDirectly || allowPinForSaleCancel;

  const [activeTab, setActiveTab] = useState<PageTab>("ventas");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");

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

  // ---------- Ventas tab (unchanged) ----------
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [statusFilter, setStatusFilter] = useState<Sale["status"] | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadSales = useCallback(() => {
    setStatus("loading");
    saleService
      .listSales({
        branchId: branchId || undefined,
        status: statusFilter || undefined,
        // "to" es un `lte` inclusivo en el backend; se agrega fin de día
        // para no excluir ventas del mismo día por coerción a medianoche UTC.
        from: fromDate ? `${fromDate}T00:00:00.000` : undefined,
        to: toDate ? `${toDate}T23:59:59.999` : undefined,
      })
      .then((rows) => { setSales(rows); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [branchId, statusFilter, fromDate, toDate]);

  useEffect(() => { if (activeTab === "ventas") loadSales(); }, [loadSales, activeTab]);

  // ---------- Detail / receipt modal ----------
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailView, setDetailView] = useState<"receipt" | "return">("receipt");

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPin, setCancelPin] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openDetail(sale: Sale) {
    setSelectedSale(sale);
    setDetailOpen(true);
    setDetailView("receipt");
    setConfirmCancel(false);
    setCancelReason("");
    setCancelPin("");
    setCancelError(null);
    resetReturnBuilder(sale);
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
      const updated = await saleService.cancelSale(
        selectedSale.id,
        cancelReason.trim(),
        canCancelSaleDirectly ? undefined : cancelPin
      );
      setSelectedSale(updated);
      setSales((prev) => (prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev));
      setConfirmCancel(false);
      setCancelReason("");
      setCancelPin("");
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

  // ================= Return-creation flow =================
  const [returnLines, setReturnLines] = useState<ReturnLineState[]>([]);
  const [newLines, setNewLines] = useState<NewLineState[]>([]);
  const [isExchange, setIsExchange] = useState(false);
  const [exchangeSearchInput, setExchangeSearchInput] = useState("");
  const [exchangeQuery, setExchangeQuery] = useState("");
  const [exchangeResults, setExchangeResults] = useState<Product[]>([]);
  const [exchangeSearching, setExchangeSearching] = useState(false);
  const [returnPaymentMethod, setReturnPaymentMethod] = useState<NonNullable<Return["paymentMethod"]>>("CASH");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnPin, setReturnPin] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [completedReturn, setCompletedReturn] = useState<Return | null>(null);

  function resetReturnBuilder(sale: Sale) {
    setReturnLines(buildReturnLines(sale));
    setNewLines([]);
    setIsExchange(false);
    setExchangeSearchInput("");
    setExchangeQuery("");
    setExchangeResults([]);
    setReturnPaymentMethod("CASH");
    setReturnNotes("");
    setReturnPin("");
    setReturnSubmitting(false);
    setReturnError(null);
    setCompletedReturn(null);
  }

  // Same 350ms debounce convention as PosPage.tsx's own product search.
  useEffect(() => {
    const t = setTimeout(() => setExchangeQuery(exchangeSearchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [exchangeSearchInput]);

  useEffect(() => {
    if (!exchangeQuery) { setExchangeResults([]); return; }
    let cancelled = false;
    setExchangeSearching(true);
    productService
      .listProducts({ search: exchangeQuery, status: "ACTIVE" })
      .then((list) => { if (!cancelled) setExchangeResults(list); })
      .catch(() => { if (!cancelled) setExchangeResults([]); })
      .finally(() => { if (!cancelled) setExchangeSearching(false); });
    return () => { cancelled = true; };
  }, [exchangeQuery]);

  function toggleIncluded(saleItemId: string, included: boolean) {
    setReturnLines((prev) =>
      prev.map((l) => (l.saleItemId === saleItemId ? { ...l, included, restock: included ? l.restock : undefined } : l))
    );
  }
  function setLineQuantity(saleItemId: string, quantity: number) {
    setReturnLines((prev) =>
      prev.map((l) =>
        l.saleItemId === saleItemId
          ? { ...l, quantity: Math.min(Math.max(1, quantity), l.originalQuantity) }
          : l
      )
    );
  }
  function setLineRestock(saleItemId: string, restock: boolean) {
    setReturnLines((prev) => prev.map((l) => (l.saleItemId === saleItemId ? { ...l, restock } : l)));
  }

  function addExchangeLine(product: Product, variant?: ProductVariant) {
    const key = variant ? `${product.id}:${variant.id}` : product.id;
    setNewLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      const line: NewLineState = {
        key,
        productId: product.id,
        variantId: variant?.id,
        name: variant ? `${product.name} — ${variant.name}` : product.name,
        sku: variant?.sku ?? product.sku,
        unitPrice: resolveUnitPrice(product, variant),
        quantity: 1,
      };
      return [...prev, line];
    });
  }
  function setExchangeQuantity(key: string, quantity: number) {
    setNewLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, quantity) } : l)));
  }
  function removeExchangeLine(key: string) {
    setNewLines((prev) => prev.filter((l) => l.key !== key));
  }

  const includedLines = returnLines.filter((l) => l.included);
  const returnedEstimate = round2(includedLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));
  const newEstimate = round2(newLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));
  const balanceEstimate = round2(newEstimate - returnedEstimate);

  const missingRestockChoice = includedLines.some((l) => l.restock === undefined);
  const canSubmitReturn = includedLines.length > 0 && !missingRestockChoice;
  // Se muestra si hay al menos una línea de cambio: el estimado del cliente
  // puede no coincidir exacto con los impuestos del servidor.
  const showPaymentMethod = newLines.length > 0;

  async function handleSubmitReturn() {
    if (!selectedSale || !canSubmitReturn) return;
    setReturnSubmitting(true);
    setReturnError(null);
    try {
      const returnedItems: ReturnedItemInput[] = includedLines.map((l) => ({
        saleItemId: l.saleItemId,
        quantity: l.quantity,
        restock: l.restock as boolean,
      }));
      const newItems: ReturnNewItemInput[] = newLines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
      }));
      const input: CreateReturnInput = {
        originalSaleId: selectedSale.id,
        returnedItems,
      };
      if (requirePinForReturns) input.pinCode = returnPin;
      if (newItems.length > 0) input.newItems = newItems;
      if (showPaymentMethod) input.paymentMethod = returnPaymentMethod;
      if (returnNotes.trim()) input.notes = returnNotes.trim();

      const created = await returnService.createReturn(input);
      setCompletedReturn(created);
    } catch (err) {
      setReturnError(err instanceof ApiError ? err.message : "No se pudo registrar la devolución.");
    } finally {
      setReturnSubmitting(false);
    }
  }

  function closeAfterReturn() {
    setDetailOpen(false);
    if (activeTab === "devoluciones") loadReturns();
  }

  // ================= Devoluciones tab =================
  const [returns, setReturns] = useState<Return[] | null>(null);
  const [returnsStatus, setReturnsStatus] = useState<FetchStatus>("loading");
  const [returnsBranchId, setReturnsBranchId] = useState("");
  const [returnsFrom, setReturnsFrom] = useState("");
  const [returnsTo, setReturnsTo] = useState("");

  const loadReturns = useCallback(() => {
    setReturnsStatus("loading");
    returnService
      .listReturns({
        branchId: returnsBranchId || undefined,
        from: returnsFrom ? `${returnsFrom}T00:00:00.000` : undefined,
        to: returnsTo ? `${returnsTo}T23:59:59.999` : undefined,
      })
      .then((rows) => { setReturns(rows); setReturnsStatus("ready"); })
      .catch(() => setReturnsStatus("error"));
  }, [returnsBranchId, returnsFrom, returnsTo]);

  useEffect(() => { if (activeTab === "devoluciones") loadReturns(); }, [loadReturns, activeTab]);

  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [returnDetailOpen, setReturnDetailOpen] = useState(false);

  function openReturnDetail(ret: Return) {
    setSelectedReturn(ret);
    setReturnDetailOpen(true);
  }

  const returnReportColumns: ReportColumn<Return>[] = [
    { header: "Folio", accessor: (r) => r.returnNumber },
    { header: "Fecha", accessor: (r) => new Date(r.createdAt).toLocaleString("es-MX") },
    { header: "Venta original", accessor: (r) => r.originalTicketNumber ?? String(r.originalSale.folio) },
    { header: "Sucursal", accessor: (r) => r.branch.name },
    { header: "Resolución", accessor: (r) => RESOLUTION_LABEL[r.resolution] },
    { header: "Balance", accessor: (r) => currencyFormatter.format(Number(r.balance)) },
    { header: "Procesó", accessor: (r) => r.processedBy.displayName },
    { header: "Autorizó", accessor: (r) => r.authorizedBy.displayName },
  ];

  const returnsActiveFilterParts: string[] = [];
  if (returnsBranchId) returnsActiveFilterParts.push(`Sucursal: ${branches.find((b) => b.id === returnsBranchId)?.name ?? returnsBranchId}`);
  if (returnsFrom) returnsActiveFilterParts.push(`Desde: ${returnsFrom}`);
  if (returnsTo) returnsActiveFilterParts.push(`Hasta: ${returnsTo}`);
  const returnsFiltersSummary = returnsActiveFilterParts.length > 0 ? returnsActiveFilterParts.join(" · ") : undefined;

  const returnRows = returns ?? [];

  const showTabs = hasReturnsView;

  return (
    <div className="sales-page">
      <div className="sales-page__header">
        <div className="sales-page__title">
          <Receipt size={22} />
          <h1>Ventas</h1>
        </div>
      </div>

      {showTabs && (
        <div className="sales-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ventas"}
            className={`sales-tabs__tab${activeTab === "ventas" ? " is-active" : ""}`}
            onClick={() => setActiveTab("ventas")}
          >
            <Receipt size={16} /> Ventas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "devoluciones"}
            className={`sales-tabs__tab${activeTab === "devoluciones" ? " is-active" : ""}`}
            onClick={() => setActiveTab("devoluciones")}
          >
            <Undo2 size={16} /> Devoluciones
          </button>
        </div>
      )}

      {activeTab === "ventas" && (
        <>
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
            <DateRangePicker from={fromDate} to={toDate} onChange={(r) => { setFromDate(r.from); setToDate(r.to); }} />
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
        </>
      )}

      {activeTab === "devoluciones" && (
        <>
          <div className="sales-filters">
            {showBranchFilter && (
              <Select value={returnsBranchId} onChange={(e) => setReturnsBranchId(e.target.value)}>
                <option value="">Todas las sucursales</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
            <DateRangePicker from={returnsFrom} to={returnsTo} onChange={(r) => { setReturnsFrom(r.from); setReturnsTo(r.to); }} />
            <ReportExportButtons
              title="Reporte de Devoluciones"
              columns={returnReportColumns}
              rows={returnRows}
              filtersSummary={returnsFiltersSummary}
              fileBaseName="devoluciones"
            />
          </div>

          {returnsStatus === "loading" && <StatusState kind="loading" />}
          {returnsStatus === "error" && <StatusState kind="error" message="No se pudo cargar el historial de devoluciones." />}
          {returnsStatus === "ready" && returnRows.length === 0 && (
            <StatusState kind="empty" message="No hay devoluciones que coincidan con estos filtros." />
          )}

          {returnsStatus === "ready" && returnRows.length > 0 && (
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Venta original</th>
                  <th>Sucursal</th>
                  <th>Resolución</th>
                  <th>Balance</th>
                  <th>Procesó</th>
                  <th>Autorizó</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {returnRows.map((ret, i) => (
                  <tr key={ret.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                    <td className="sales-table__folio">{ret.returnNumber}</td>
                    <td>{new Date(ret.createdAt).toLocaleString("es-MX")}</td>
                    <td>{ret.originalTicketNumber ?? ret.originalSale.folio}</td>
                    <td>{ret.branch.name}</td>
                    <td>{RESOLUTION_LABEL[ret.resolution]}</td>
                    <td className="sales-table__total">{currencyFormatter.format(Number(ret.balance))}</td>
                    <td>{ret.processedBy.displayName}</td>
                    <td>{ret.authorizedBy.displayName}</td>
                    <td>
                      <button type="button" className="sales-table__view" onClick={() => openReturnDetail(ret)}>
                        <Eye size={15} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ---------- Sale detail modal (receipt + cancel + return builder) ---------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedSale ? `Venta ${selectedSale.ticketNumber}` : "Venta"}
        className="sales-detail-modal"
      >
        {selectedSale && detailView === "receipt" && (
          <div className="sales-detail">
            <SaleReceipt sale={selectedSale} />

            {selectedSale.status === "COMPLETED" && canAttemptCancelSale && (
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
                    {!canCancelSaleDirectly && (
                      <label>
                        PIN de un supervisor
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={6}
                          placeholder="••••"
                          value={cancelPin}
                          onChange={(e) => setCancelPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        />
                      </label>
                    )}
                    {cancelError && <p className="sales-detail__cancel-error"><AlertTriangle size={13} /> {cancelError}</p>}
                    <div className="sales-detail__cancel-actions">
                      <button
                        type="button"
                        className="sales-detail__cancel-confirm-btn"
                        onClick={handleConfirmCancel}
                        disabled={cancelSaving || (!canCancelSaleDirectly && cancelPin.length < 4)}
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
            )}

            {selectedSale.status === "COMPLETED" && (
              <PermissionGate code="returns.create">
                <div className="sales-detail__return">
                  <button
                    type="button"
                    className="sales-detail__return-trigger"
                    onClick={() => setDetailView("return")}
                  >
                    <RotateCcw size={14} /> Iniciar devolución / cambio
                  </button>
                </div>
              </PermissionGate>
            )}
          </div>
        )}

        {selectedSale && detailView === "return" && (
          <div className="return-builder">
            <button type="button" className="return-builder__back" onClick={() => setDetailView("receipt")}>
              <ArrowLeft size={14} /> Volver al recibo
            </button>

            {completedReturn ? (
              <div className="return-builder__success">
                <CheckCircle2 size={28} />
                <p className="return-builder__success-title">Devolución registrada</p>
                <p className="return-builder__success-folio">Folio {completedReturn.returnNumber}</p>
                <p className="return-builder__success-resolution">{RESOLUTION_LABEL[completedReturn.resolution]}</p>
                <p className="return-builder__success-balance">
                  {Number(completedReturn.balance) === 0
                    ? "No hay diferencia a favor de ninguna de las partes."
                    : Number(completedReturn.balance) > 0
                      ? `El cliente pagó una diferencia de ${currencyFormatter.format(Number(completedReturn.balance))}.`
                      : `Se debe reembolsar al cliente ${currencyFormatter.format(Math.abs(Number(completedReturn.balance)))}.`}
                </p>
                <button type="button" className="return-builder__close" onClick={closeAfterReturn}>
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <p className="return-builder__hint">
                  Marca los productos que el cliente está regresando, indica cuántas piezas y si vuelven al inventario.
                </p>

                <div className="return-builder__lines">
                  {returnLines.map((line) => (
                    <div key={line.saleItemId} className={`return-line${line.included ? " return-line--included" : ""}`}>
                      <label className="return-line__toggle">
                        <input
                          type="checkbox"
                          checked={line.included}
                          onChange={(e) => toggleIncluded(line.saleItemId, e.target.checked)}
                        />
                        <span className="return-line__name">
                          {line.variantName ? `${line.productName} — ${line.variantName}` : line.productName}
                        </span>
                        <span className="return-line__sku">{line.sku}</span>
                      </label>

                      {line.included && (
                        <div className="return-line__details">
                          <div className="return-line__qty">
                            <span>Cantidad a devolver (máx. {line.originalQuantity})</span>
                            <div className="return-line__qty-controls">
                              <button
                                type="button"
                                onClick={() => setLineQuantity(line.saleItemId, line.quantity - 1)}
                                disabled={line.quantity <= 1}
                                aria-label="Disminuir cantidad"
                              >
                                <Minus size={13} />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={line.originalQuantity}
                                value={line.quantity}
                                onChange={(e) => setLineQuantity(line.saleItemId, Math.floor(Number(e.target.value)) || 1)}
                              />
                              <button
                                type="button"
                                onClick={() => setLineQuantity(line.saleItemId, line.quantity + 1)}
                                disabled={line.quantity >= line.originalQuantity}
                                aria-label="Aumentar cantidad"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>

                          <div className="return-line__restock">
                            <span>¿El producto regresa al inventario?</span>
                            <div className="return-line__restock-buttons">
                              <button
                                type="button"
                                className={`return-line__restock-btn${line.restock === true ? " is-active" : ""}`}
                                onClick={() => setLineRestock(line.saleItemId, true)}
                              >
                                Regresa a inventario (buen estado)
                              </button>
                              <button
                                type="button"
                                className={`return-line__restock-btn return-line__restock-btn--danger${line.restock === false ? " is-active" : ""}`}
                                onClick={() => setLineRestock(line.saleItemId, false)}
                              >
                                No regresa (dañado/desechado)
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <label className="return-builder__exchange-toggle">
                  <input type="checkbox" checked={isExchange} onChange={(e) => setIsExchange(e.target.checked)} />
                  ¿Es un cambio por otro producto?
                </label>

                {isExchange && (
                  <div className="return-exchange">
                    <label className="return-exchange__search">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Buscar producto de reemplazo..."
                        value={exchangeSearchInput}
                        onChange={(e) => setExchangeSearchInput(e.target.value)}
                      />
                    </label>

                    {exchangeSearching && <StatusState kind="loading" compact />}
                    {!exchangeSearching && exchangeQuery && exchangeResults.length === 0 && (
                      <StatusState kind="empty" compact message="No se encontraron productos." />
                    )}

                    {exchangeResults.length > 0 && (
                      <ul className="return-exchange__results">
                        {exchangeResults.map((p) => {
                          const activeVariants = p.variants.filter((v) => v.status === "ACTIVE");
                          return (
                            <li key={p.id} className="return-exchange__product">
                              {activeVariants.length === 0 ? (
                                <button type="button" className="return-exchange__row" onClick={() => addExchangeLine(p)}>
                                  <span>{p.name}</span>
                                  <span className="return-exchange__row-sku">{p.sku}</span>
                                  <span className="return-exchange__row-price">{currencyFormatter.format(resolveUnitPrice(p))}</span>
                                </button>
                              ) : (
                                <>
                                  <p className="return-exchange__product-label">{p.name}</p>
                                  {activeVariants.map((v) => (
                                    <button
                                      key={v.id}
                                      type="button"
                                      className="return-exchange__row return-exchange__row--variant"
                                      onClick={() => addExchangeLine(p, v)}
                                    >
                                      <span>{v.name}</span>
                                      <span className="return-exchange__row-sku">{v.sku}</span>
                                      <span className="return-exchange__row-price">{currencyFormatter.format(resolveUnitPrice(p, v))}</span>
                                    </button>
                                  ))}
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {newLines.length > 0 && (
                      <div className="return-exchange__cart">
                        {newLines.map((l) => (
                          <div key={l.key} className="return-exchange__cart-line">
                            <div className="return-exchange__cart-info">
                              <p>{l.name}</p>
                              <p className="return-exchange__cart-sku">{l.sku} · {currencyFormatter.format(l.unitPrice)} c/u</p>
                            </div>
                            <div className="return-line__qty-controls">
                              <button type="button" onClick={() => setExchangeQuantity(l.key, l.quantity - 1)} disabled={l.quantity <= 1}>
                                <Minus size={13} />
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={l.quantity}
                                onChange={(e) => setExchangeQuantity(l.key, Math.floor(Number(e.target.value)) || 1)}
                              />
                              <button type="button" onClick={() => setExchangeQuantity(l.key, l.quantity + 1)}>
                                <Plus size={13} />
                              </button>
                            </div>
                            <button
                              type="button"
                              className="return-exchange__cart-remove"
                              onClick={() => removeExchangeLine(l.key)}
                              aria-label={`Quitar ${l.name}`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="return-builder__preview">
                  <div className="return-builder__preview-row">
                    <span>Valor de lo devuelto (estimado)</span>
                    <span>{currencyFormatter.format(returnedEstimate)}</span>
                  </div>
                  {newLines.length > 0 && (
                    <div className="return-builder__preview-row">
                      <span>Valor de lo nuevo (estimado)</span>
                      <span>{currencyFormatter.format(newEstimate)}</span>
                    </div>
                  )}
                  <div className="return-builder__preview-row return-builder__preview-row--total">
                    <span>{balanceEstimate > 0 ? "Cliente pagaría (estimado)" : balanceEstimate < 0 ? "Se reembolsaría (estimado)" : "Sin diferencia (estimado)"}</span>
                    <span>{currencyFormatter.format(Math.abs(balanceEstimate))}</span>
                  </div>
                  <p className="return-builder__preview-note">
                    Este cálculo es solo un estimado. El monto final lo determina el sistema al registrar la devolución.
                  </p>
                </div>

                {showPaymentMethod && (
                  <label className="return-builder__payment">
                    Método de pago de la diferencia
                    <Select value={returnPaymentMethod} onChange={(e) => setReturnPaymentMethod(e.target.value as NonNullable<Return["paymentMethod"]>)}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
                      ))}
                    </Select>
                  </label>
                )}

                <label className="return-builder__notes">
                  Notas (opcional)
                  <textarea
                    rows={2}
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="Ej. El cliente cambió de tono"
                  />
                </label>

                {requirePinForReturns ? (
                  <PinAuthPrompt
                    value={returnPin}
                    onChange={setReturnPin}
                    onSubmit={handleSubmitReturn}
                    submitLabel="Registrar devolución"
                    submittingLabel="Registrando..."
                    error={returnError}
                    busy={returnSubmitting}
                    disabled={!canSubmitReturn}
                    description={
                      missingRestockChoice
                        ? "Falta indicar si algún producto regresa al inventario."
                        : includedLines.length === 0
                          ? "Selecciona al menos un producto para devolver."
                          : "Un supervisor debe autorizar esta devolución con su PIN."
                    }
                  />
                ) : (
                  <>
                    {returnError && (
                      <p className="pin-auth__error" role="alert">
                        <AlertTriangle size={13} /> {returnError}
                      </p>
                    )}
                    <button type="button" className="pin-auth__submit" onClick={handleSubmitReturn} disabled={!canSubmitReturn || returnSubmitting}>
                      {returnSubmitting ? "Registrando..." : "Registrar devolución"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ---------- Return detail modal (read-only) ---------- */}
      <Modal
        open={returnDetailOpen}
        onClose={() => setReturnDetailOpen(false)}
        title={selectedReturn ? `Devolución ${selectedReturn.returnNumber}` : "Devolución"}
        className="sales-detail-modal"
      >
        {selectedReturn && (
          <div className="return-detail">
            <div className="return-detail__summary">
              <p><strong>Venta original:</strong> {selectedReturn.originalTicketNumber ?? selectedReturn.originalSale.folio}</p>
              <p><strong>Sucursal:</strong> {selectedReturn.branch.name}</p>
              <p><strong>Fecha:</strong> {new Date(selectedReturn.createdAt).toLocaleString("es-MX")}</p>
              <p><strong>Procesó:</strong> {selectedReturn.processedBy.displayName}</p>
              <p><strong>Autorizó:</strong> {selectedReturn.authorizedBy.displayName}</p>
            </div>

            <div className="return-detail__section">
              <h3>Productos devueltos</h3>
              {selectedReturn.items.filter((it) => it.direction === "RETURNED").map((it) => (
                <div key={it.id} className="return-detail__item">
                  <span>{it.variant ? `${it.product.name} — ${it.variant.name}` : it.product.name}</span>
                  <span>x{it.quantity}</span>
                  <span>{currencyFormatter.format(Number(it.unitPrice))}</span>
                  <span className={`return-detail__restock-badge${it.restocked ? " is-restocked" : ""}`}>
                    {it.restocked ? "Regresó a inventario" : "No regresó a inventario"}
                  </span>
                </div>
              ))}
            </div>

            {selectedReturn.items.some((it) => it.direction === "NEW") && (
              <div className="return-detail__section">
                <h3>Productos de cambio</h3>
                {selectedReturn.items.filter((it) => it.direction === "NEW").map((it) => (
                  <div key={it.id} className="return-detail__item">
                    <span>{it.variant ? `${it.product.name} — ${it.variant.name}` : it.product.name}</span>
                    <span>x{it.quantity}</span>
                    <span>{currencyFormatter.format(Number(it.unitPrice))}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="return-detail__section">
              <h3>Resultado</h3>
              <p>{RESOLUTION_LABEL[selectedReturn.resolution]}</p>
              <p className="return-detail__balance">
                {Number(selectedReturn.balance) === 0
                  ? "Sin diferencia."
                  : Number(selectedReturn.balance) > 0
                    ? `Cliente pagó: ${currencyFormatter.format(Number(selectedReturn.balance))}`
                    : `Reembolso al cliente: ${currencyFormatter.format(Math.abs(Number(selectedReturn.balance)))}`}
              </p>
              {selectedReturn.paymentMethod && (
                <p>Método de pago: {PAYMENT_METHOD_LABEL[selectedReturn.paymentMethod]}</p>
              )}
              {selectedReturn.notes && <p>Notas: {selectedReturn.notes}</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
