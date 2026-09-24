import { useCallback, useEffect, useState } from "react";
import { PackageX, Eye, Plus, Search, X, AlertTriangle } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { DateRangePicker } from "../../components/common/DateRangePicker";
import { Modal } from "../../components/common/Modal";
import { PinAuthPrompt } from "../../components/common/PinAuthPrompt";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { ReportExportButtons } from "../../components/common/ReportExportButtons";
import { useAuth } from "../../hooks/useAuth";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as productService from "../../services/productService";
import * as mermaService from "../../services/mermaService";
import type { Branch, Merma, MermaType, Product, ProductVariant } from "../../types/api";
import type { ReportColumn } from "../../utils/reportExport";
import "./MermasPage.css";
import { staggerStyle } from "../../utils/staggerStyle";

import { currencyFormatter } from "../../utils/currency";

// Etiquetas en lenguaje sencillo para el empleado, no los códigos del enum.
const TYPE_LABEL: Record<MermaType, string> = {
  TESTER_EXHIBICION: "Tester agotado / probador de exhibición",
  DANO_EN_TIENDA: "Dañado en tienda",
  CADUCIDAD_VENCIDO: "Caducado / vencido",
  MUESTRA_REGALO_CLIENTE: "Muestra de regalo para cliente",
  DEFECTO_PROVEEDOR: "Defecto de fábrica / proveedor",
};

const TYPE_OPTIONS: MermaType[] = [
  "TESTER_EXHIBICION",
  "DANO_EN_TIENDA",
  "CADUCIDAD_VENCIDO",
  "MUESTRA_REGALO_CLIENTE",
  "DEFECTO_PROVEEDOR",
];

type FetchStatus = "loading" | "ready" | "error";

// Una línea de merma en borrador: solo cantidad (a diferencia de una compra,
// no hay costo por línea; el backend toma unitCost/unitRetail del precio actual del producto).
interface MermaLine {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
}

export function MermasPage() {
  const { user } = useAuth();
  const companySettings = useCompanySettings();
  const requirePinForShrinkage = companySettings?.requirePinForShrinkage ?? true;

  const [mermas, setMermas] = useState<Merma[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

  // Catálogo completo de sucursales para usuarios allBranches, igual que PurchasesPage.
  const [allBranchList, setAllBranchList] = useState<Branch[]>([]);
  useEffect(() => {
    branchService.listBranches().then(setAllBranchList).catch(() => {});
  }, []);

  const accessibleBranches = user?.allBranches ? allBranchList : (user?.branches ?? []);
  const showBranchFilter = !!user?.allBranches || (user?.branches.length ?? 0) > 1;

  const [branchId, setBranchId] = useState("");
  const [typeFilter, setTypeFilter] = useState<MermaType | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadMermas = useCallback(() => {
    setStatus("loading");
    mermaService
      .listMermas({
        branchId: branchId || undefined,
        type: typeFilter || undefined,
        // Misma convención de fin de día inclusivo que SalesPage/PurchasesPage.
        from: fromDate ? `${fromDate}T00:00:00.000` : undefined,
        to: toDate ? `${toDate}T23:59:59.999` : undefined,
      })
      .then((rows) => { setMermas(rows); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [branchId, typeFilter, fromDate, toDate]);

  useEffect(() => { loadMermas(); }, [loadMermas]);

  // ---------- Modal de creación ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [createBranchId, setCreateBranchId] = useState("");
  const [createType, setCreateType] = useState<MermaType | "">("");
  const [comments, setComments] = useState("");
  const [items, setItems] = useState<MermaLine[]>([]);
  const [pin, setPin] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showBranchPicker = !!user?.allBranches || accessibleBranches.length > 1;
  const selectedCreateBranch = accessibleBranches.find((b) => b.id === createBranchId) ?? null;

  const [productSearchInput, setProductSearchInput] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productSearching, setProductSearching] = useState(false);

  function openCreateModal() {
    setCreateBranchId(accessibleBranches[0]?.id ?? "");
    setCreateType("");
    setComments("");
    setItems([]);
    setPin("");
    setCreateError(null);
    setProductSearchInput("");
    setProductQuery("");
    setProductResults([]);
    setCreateOpen(true);
  }

  function closeCreateModal() {
    setCreateOpen(false);
  }

  // Sincroniza la sucursal por defecto si el catálogo llega después de abrir
  // el modal (para un usuario allBranches), igual que en PurchasesPage.
  useEffect(() => {
    if (createOpen && !createBranchId && accessibleBranches.length > 0) {
      setCreateBranchId(accessibleBranches[0].id);
    }
  }, [createOpen, createBranchId, accessibleBranches]);

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
      const line: MermaLine = {
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

  function stepQuantity(key: string, delta: number) {
    setItems((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((l) => l.key !== key));
  }

  const totalUnitsDraft = items.reduce((sum, l) => sum + l.quantity, 0);

  // Refleja en el cliente los requisitos del backend (comentario mínimo,
  // al menos un ítem, tipo y sucursal) para no mostrar el PIN hasta que la
  // solicitud sea enviable; el backend igual revalida todo.
  const formIncomplete =
    !createBranchId || !createType || comments.trim().length < 3 || items.length === 0;

  async function handleSubmit() {
    if (formIncomplete || submitting) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await mermaService.createMerma({
        branchId: createBranchId,
        type: createType as MermaType,
        comments: comments.trim(),
        items: items.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        ...(requirePinForShrinkage ? { pinCode: pin } : {}),
      });
      setMermas((prev) => (prev ? [created, ...prev] : [created]));
      closeCreateModal();
      setCreateBranchId("");
      setCreateType("");
      setComments("");
      setItems([]);
      setPin("");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "No se pudo registrar la merma.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Modal de detalle ----------
  const [selectedMerma, setSelectedMerma] = useState<Merma | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  function openDetail(merma: Merma) {
    setSelectedMerma(merma);
    setDetailOpen(true);
  }

  const reportColumns: ReportColumn<Merma>[] = [
    { header: "Folio", accessor: (m) => m.mermaNumber },
    { header: "Fecha", accessor: (m) => new Date(m.createdAt).toLocaleString("es-MX") },
    { header: "Sucursal", accessor: (m) => m.branch.name },
    { header: "Tipo", accessor: (m) => TYPE_LABEL[m.type] },
    { header: "Productos", accessor: (m) => m.itemCount },
    { header: "Unidades", accessor: (m) => m.totalUnits },
    { header: "Impacto costo", accessor: (m) => currencyFormatter.format(Number(m.totalCostImpact)) },
    { header: "Solicitó", accessor: (m) => m.requestedBy.displayName },
    { header: "Autorizó", accessor: (m) => m.authorizedBy.displayName },
  ];

  const activeFilterParts: string[] = [];
  if (branchId) activeFilterParts.push(`Sucursal: ${accessibleBranches.find((b) => b.id === branchId)?.name ?? branchId}`);
  if (typeFilter) activeFilterParts.push(`Tipo: ${TYPE_LABEL[typeFilter]}`);
  if (fromDate) activeFilterParts.push(`Desde: ${fromDate}`);
  if (toDate) activeFilterParts.push(`Hasta: ${toDate}`);
  const filtersSummary = activeFilterParts.length > 0 ? activeFilterParts.join(" · ") : undefined;

  const rows = mermas ?? [];

  return (
    <div className="mermas-page">
      <div className="mermas-page__header">
        <div className="mermas-page__title">
          <PackageX size={22} />
          <h1>Mermas</h1>
        </div>
        <PermissionGate code="shrinkage.create">
          <button type="button" className="mermas-page__new-btn" onClick={openCreateModal}>
            <Plus size={16} /> Reportar merma
          </button>
        </PermissionGate>
      </div>
      <p className="mermas-page__subtitle">
        Registra productos dañados, caducados, usados como tester o entregados como muestra — con autorización de
        un supervisor.
      </p>

      <div className="mermas-filters">
        {showBranchFilter && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {accessibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as MermaType | "")}>
          <option value="">Todos los tipos</option>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </Select>
        <DateRangePicker from={fromDate} to={toDate} onChange={(r) => { setFromDate(r.from); setToDate(r.to); }} />
        <ReportExportButtons
          title="Reporte de Mermas"
          columns={reportColumns}
          rows={rows}
          filtersSummary={filtersSummary}
          fileBaseName="mermas"
        />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar el historial de mermas." />}
      {status === "ready" && rows.length === 0 && (
        <StatusState kind="empty" message="No hay mermas que coincidan con estos filtros." />
      )}

      {status === "ready" && rows.length > 0 && (
        <table className="mermas-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Sucursal</th>
              <th>Tipo</th>
              <th>Unidades</th>
              <th>Impacto</th>
              <th>Solicitó</th>
              <th>Autorizó</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td className="mermas-table__folio">{m.mermaNumber}</td>
                <td>{new Date(m.createdAt).toLocaleString("es-MX")}</td>
                <td>{m.branch.name}</td>
                <td><span className="merma-type-badge">{TYPE_LABEL[m.type]}</span></td>
                <td>{m.totalUnits}</td>
                <td className="mermas-table__impact">{currencyFormatter.format(Number(m.totalCostImpact))}</td>
                <td>{m.requestedBy.displayName}</td>
                <td>{m.authorizedBy.displayName}</td>
                <td>
                  <button type="button" className="mermas-table__view" onClick={() => openDetail(m)}>
                    <Eye size={15} /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- Create modal ---------- */}
      <PermissionGate code="shrinkage.create">
        <Modal open={createOpen} onClose={closeCreateModal} title="Reportar merma" className="merma-create-modal">
          <div className="merma-create">
            <div className="merma-create__head">
              <div className="merma-create__field">
                <span className="merma-create__field-label">Sucursal</span>
                {showBranchPicker ? (
                  <Select value={createBranchId} onChange={(e) => setCreateBranchId(e.target.value)}>
                    {accessibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                ) : selectedCreateBranch ? (
                  <p className="merma-create__field-static">{selectedCreateBranch.name}</p>
                ) : (
                  <p className="merma-create__field-static merma-create__field-static--empty">
                    No tienes sucursales asignadas.
                  </p>
                )}
              </div>

              <div className="merma-create__field">
                <span className="merma-create__field-label">Tipo de merma</span>
                <Select value={createType} onChange={(e) => setCreateType(e.target.value as MermaType | "")}>
                  <option value="">Selecciona un tipo</option>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </Select>
              </div>
            </div>

            <div className="merma-create__picker">
              <label className="merma-create__search">
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
                <ul className="merma-create__results">
                  {productResults.map((p) => {
                    const activeVariants = p.variants.filter((v) => v.status === "ACTIVE");
                    return (
                      <li key={p.id} className="merma-create__result-product">
                        {activeVariants.length === 0 ? (
                          <button type="button" className="merma-create__result-row" onClick={() => addItem(p)}>
                            <span className="merma-create__result-name">{p.name}</span>
                            <span className="merma-create__result-sku">{p.sku}</span>
                          </button>
                        ) : (
                          <>
                            <p className="merma-create__result-label">{p.name}</p>
                            {activeVariants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                className="merma-create__result-row merma-create__result-row--variant"
                                onClick={() => addItem(p, v)}
                              >
                                <span className="merma-create__result-name">{v.name}</span>
                                <span className="merma-create__result-sku">{v.sku}</span>
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

            <div className="merma-create__lines">
              {items.length === 0 && (
                <StatusState kind="empty" compact message="Busca un producto para agregarlo a la merma." />
              )}
              {items.map((l) => (
                <div key={l.key} className="merma-create__line">
                  <div className="merma-create__line-info">
                    <p className="merma-create__line-name">{l.name}</p>
                    <p className="merma-create__line-sku">{l.sku}</p>
                  </div>
                  <div className="merma-create__line-stepper">
                    <button
                      type="button"
                      onClick={() => stepQuantity(l.key, -1)}
                      aria-label={`Quitar una unidad de ${l.name}`}
                    >
                      −
                    </button>
                    <span>{l.quantity}</span>
                    <button
                      type="button"
                      onClick={() => stepQuantity(l.key, 1)}
                      aria-label={`Agregar una unidad de ${l.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="merma-create__line-remove"
                    onClick={() => removeItem(l.key)}
                    aria-label={`Quitar ${l.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {items.length > 0 && (
                <p className="merma-create__total">
                  Total de unidades <strong>{totalUnitsDraft}</strong>
                </p>
              )}
            </div>

            <label className="merma-create__text-field">
              Comentarios
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Ej. Se rompió el frasco tester al reacomodar el exhibidor"
                rows={2}
              />
              <span className="merma-create__field-hint">
                Explica brevemente qué pasó — mínimo unas palabras.
              </span>
            </label>

            {requirePinForShrinkage ? (
              <PinAuthPrompt
                value={pin}
                onChange={setPin}
                onSubmit={handleSubmit}
                submitLabel="Registrar merma"
                submittingLabel="Registrando..."
                error={createError}
                busy={submitting}
                disabled={formIncomplete}
                description="Un supervisor debe autorizar esta merma con su PIN."
              />
            ) : (
              <>
                {createError && (
                  <p className="pin-auth__error" role="alert">
                    <AlertTriangle size={13} /> {createError}
                  </p>
                )}
                <button type="button" className="pin-auth__submit" onClick={handleSubmit} disabled={formIncomplete || submitting}>
                  {submitting ? "Registrando..." : "Registrar merma"}
                </button>
              </>
            )}
          </div>
        </Modal>
      </PermissionGate>

      {/* ---------- Detail modal ---------- */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedMerma ? `Merma ${selectedMerma.mermaNumber}` : "Merma"}
        className="merma-detail-modal"
      >
        {selectedMerma && (
          <div className="merma-detail">
            <div className="merma-detail__status-row">
              <span className="merma-type-badge">{TYPE_LABEL[selectedMerma.type]}</span>
              <span className="merma-detail__date">
                {new Date(selectedMerma.createdAt).toLocaleString("es-MX")}
              </span>
            </div>

            <div className="merma-detail__meta">
              <div>
                <span className="merma-detail__meta-label">Sucursal</span>
                <p className="merma-detail__meta-value">{selectedMerma.branch.name}</p>
              </div>
              <div>
                <span className="merma-detail__meta-label">Comentarios</span>
                <p className="merma-detail__meta-value merma-detail__meta-value--comments">
                  {selectedMerma.comments}
                </p>
              </div>
            </div>

            <div className="merma-detail__items">
              <p className="merma-detail__section-label">Artículos ({selectedMerma.itemCount})</p>
              {selectedMerma.items.map((item) => (
                <div key={item.id} className="merma-detail__item">
                  <div className="merma-detail__item-info">
                    <p className="merma-detail__item-name">
                      {item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name}
                    </p>
                    <p className="merma-detail__item-sku">{item.variant?.sku ?? item.product.sku}</p>
                  </div>
                  <div className="merma-detail__item-numbers">
                    <span className="merma-detail__item-num">
                      <em>Cantidad</em> {item.quantity}
                    </span>
                    <span className="merma-detail__item-num">
                      <em>Costo unit.</em> {currencyFormatter.format(Number(item.unitCost))}
                    </span>
                    <span className="merma-detail__item-num">
                      <em>Precio unit.</em> {currencyFormatter.format(Number(item.unitRetail))}
                    </span>
                  </div>
                </div>
              ))}
              <div className="merma-detail__totals">
                <p>
                  Impacto en costo <strong>{currencyFormatter.format(Number(selectedMerma.totalCostImpact))}</strong>
                </p>
                <p>
                  Valor de venta perdido{" "}
                  <strong>{currencyFormatter.format(Number(selectedMerma.totalRetailImpact))}</strong>
                </p>
              </div>
            </div>

            <div className="merma-detail__people">
              <p><span>Solicitó</span> {selectedMerma.requestedBy.displayName}</p>
              <p><span>Autorizó</span> {selectedMerma.authorizedBy.displayName}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
