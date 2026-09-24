import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  X,
  Check,
  UserPlus,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Select } from "../../components/common/Select";
import { Modal } from "../../components/common/Modal";
import { StatusState } from "../../components/common/StatusState";
import { SaleReceipt } from "../../components/common/SaleReceipt";
import { PinAuthPrompt } from "../../components/common/PinAuthPrompt";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { useAuth } from "../../hooks/useAuth";
import { usePermission } from "../../hooks/usePermission";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as productService from "../../services/productService";
import * as customerService from "../../services/customerService";
import * as saleService from "../../services/saleService";
import * as inventoryService from "../../services/inventoryService";
import * as cashSessionService from "../../services/cashSessionService";
import type { SalePaymentInput } from "../../services/saleService";
import type { Branch, CashSession, Customer, Product, ProductVariant, Sale } from "../../types/api";
import "./PosPage.css";

import { currencyFormatter } from "../../utils/currency";

const PAYMENT_METHODS: { value: SalePaymentInput["method"]; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
];

interface CartLine {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  unitPrice: number;
  taxRate: number;
  quantity: number;
  discount: string;
}

interface PaymentRow {
  id: string;
  method: SalePaymentInput["method"];
  amount: string;
}

// Misma convención de redondeo que round2 en saleService.ts del backend
// (duplicada a propósito, es otro runtime) para que la vista previa coincida
// con la aritmética del servidor.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Igual que resolveUnitPrice en saleService.ts del backend: el precio de la
// variante gana si existe; si no, promoPrice solo se usa si es menor al
// precio regular. Es solo para la vista previa del carrito, el servidor
// resuelve el precio real al momento de cobrar.
function resolveUnitPrice(product: Product, variant?: ProductVariant): number {
  if (variant?.price != null) return Number(variant.price);
  const price = Number(product.price);
  const promo = product.promoPrice != null ? Number(product.promoPrice) : null;
  if (promo != null && promo < price) return promo;
  return price;
}

function emptyPaymentRow(): PaymentRow {
  return { id: crypto.randomUUID(), method: "CASH", amount: "" };
}

function customerDisplayName(c: Customer): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || "Cliente sin nombre";
}

export function PosPage() {
  const { user } = useAuth();

  // ---------- Contexto de sucursal ----------
  const [branchOptions, setBranchOptions] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (!user) return;
    if (user.allBranches) {
      branchService
        .listBranches()
        .then((list) => {
          const active = list.filter((b) => b.status === "ACTIVE");
          setBranchOptions(active);
          setBranchId((prev) => prev || active[0]?.id || "");
        })
        .catch(() => {});
    } else {
      setBranchOptions(user.branches);
      setBranchId(user.branches[0]?.id ?? "");
    }
  }, [user]);

  // Un selector solo tiene sentido si en verdad hay opción de elegir: se
  // muestra siempre para allBranches, y para un usuario limitado solo si
  // tiene más de una sucursal asignada.
  const showBranchPicker = !!user?.allBranches || (user?.branches.length ?? 0) > 1;
  const selectedBranch = branchOptions.find((b) => b.id === branchId) ?? null;

  // ---------- Requisito de caja abierta ----------
  // Un cajero no puede cobrar sin un turno de caja abierto en la sucursal.
  // Se verifica igual que CajaPage (cashSessionService.getCurrentSession),
  // para que ambas páginas coincidan siempre.
  const canManageCash = usePermission("cash.manage");
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [cashSessionChecked, setCashSessionChecked] = useState(false);

  useEffect(() => {
    if (!canManageCash || !branchId) { setCashSessionChecked(false); return; }
    let cancelled = false;
    setCashSessionChecked(false);
    cashSessionService
      .getCurrentSession(branchId)
      .then((session) => { if (!cancelled) { setCashSession(session); setCashSessionChecked(true); } })
      .catch(() => { if (!cancelled) setCashSessionChecked(true); });
    return () => { cancelled = true; };
  }, [canManageCash, branchId]);

  // Solo bloquea cuando ya se SABE que no hay sesión (checked=true y sigue
  // null); nunca bloquea durante una carga breve.
  const cashDrawerRequired = canManageCash && cashSessionChecked && !cashSession;

  // ---------- Disponibilidad de stock en la sucursal seleccionada ----------
  // Se indexa igual que las líneas del carrito (product.id o
  // "product.id:variant.id") para reutilizar la misma clave. Sirve para
  // bloquear agregar un producto sin stock en ESTA sucursal.
  const [stockByKey, setStockByKey] = useState<Map<string, number>>(new Map());
  const [stockLoaded, setStockLoaded] = useState(false);

  useEffect(() => {
    if (!branchId) { setStockByKey(new Map()); setStockLoaded(false); return; }
    let cancelled = false;
    setStockLoaded(false);
    inventoryService
      .listInventory({ branchId })
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, number>();
        rows.forEach((row) => {
          const key = row.variant ? `${row.product.id}:${row.variant.id}` : row.product.id;
          map.set(key, row.stock);
        });
        setStockByKey(map);
        setStockLoaded(true);
      })
      .catch(() => { if (!cancelled) setStockLoaded(false); });
    return () => { cancelled = true; };
  }, [branchId]);

  // Mientras el stock no ha cargado, se trata todo como disponible en vez
  // de mostrar todo en rojo un instante. Ya cargado, una clave faltante
  // significa cero (nunca se ha recibido ese producto aquí).
  function stockFor(product: Product, variant?: ProductVariant): number | null {
    if (!stockLoaded) return null;
    const key = variant ? `${product.id}:${variant.id}` : product.id;
    return stockByKey.get(key) ?? 0;
  }

  // ---------- Búsqueda de productos ----------
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productSearching, setProductSearching] = useState(false);

  // Mismo debounce de 350ms que la búsqueda de servidor en ProductsPage.tsx.
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

  // ---------- Carrito ----------
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartError, setCartError] = useState<string | null>(null);
  // Igual que discounts.authorize en saleService.ts del backend: si el rol
  // del cajero ya tiene el permiso, nunca se pide PIN de supervisor.
  const canAuthorizeDiscount = usePermission("discounts.authorize");
  // Antes de que cargue la configuración, se asume "sí exige PIN" (el valor
  // por defecto del backend) para no dejar pasar un descuento grande por una
  // carrera con el fetch.
  const companySettings = useCompanySettings();
  const requirePinForDiscounts = companySettings?.requirePinForDiscounts ?? true;
  const [discountPin, setDiscountPin] = useState("");
  const [discountPinError, setDiscountPinError] = useState<string | null>(null);

  function addToCart(product: Product, variant?: ProductVariant) {
    const stock = stockFor(product, variant);
    if (stock !== null && stock <= 0) {
      setCartError(`"${variant ? `${product.name} — ${variant.name}` : product.name}" no tiene existencias en esta sucursal.`);
      return;
    }
    setCartError(null);
    const key = variant ? `${product.id}:${variant.id}` : product.id;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      const line: CartLine = {
        key,
        productId: product.id,
        variantId: variant?.id,
        name: variant ? `${product.name} — ${variant.name}` : product.name,
        sku: variant?.sku ?? product.sku,
        unitPrice: resolveUnitPrice(product, variant),
        taxRate: Number(product.taxRate),
        quantity: 1,
        discount: "",
      };
      return [...prev, line];
    });
  }

  function updateQuantity(key: string, quantity: number) {
    if (quantity < 1) return;
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }
  function updateDiscount(key: string, discount: string) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, discount } : l)));
  }
  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  // Cálculos de vista previa por línea, recalculados del estado crudo del
  // carrito en vez de almacenarse; solo visual, el servidor los recalcula y valida al cobrar.
  const cartLinesComputed = useMemo(
    () =>
      cart.map((l) => {
        const lineSubtotal = round2(l.unitPrice * l.quantity);
        const discount = Number(l.discount) || 0;
        const lineTotal = round2(lineSubtotal - discount);
        const threshold = round2(lineSubtotal * 0.15);
        const overThreshold = requirePinForDiscounts && discount > 0 && discount > threshold;
        return { ...l, lineSubtotal, discount, lineTotal, overThreshold };
      }),
    [cart, requirePinForDiscounts]
  );

  // Si algún cajero sin discounts.authorize excede el umbral en alguna
  // línea, la venta necesita el PIN de un supervisor (igual regla que
  // saleService.createSale en el backend).
  const needsDiscountPin = !canAuthorizeDiscount && cartLinesComputed.some((l) => l.overThreshold);

  const totals = useMemo(() => {
    const subtotal = round2(cartLinesComputed.reduce((sum, l) => sum + l.lineSubtotal, 0));
    const discountTotal = round2(cartLinesComputed.reduce((sum, l) => sum + l.discount, 0));
    const taxTotal = round2(
      cartLinesComputed.reduce((sum, l) => sum + round2(l.lineTotal * (l.taxRate / 100)), 0)
    );
    const total = round2(subtotal - discountTotal + taxTotal);
    return { subtotal, discountTotal, taxTotal, total };
  }, [cartLinesComputed]);

  // ---------- Cliente ----------
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  useEffect(() => {
    const q = customerQuery.trim();
    if (!q) {
      setCustomerResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      customerService
        .searchCustomers(q)
        .then((list) => { if (!cancelled) setCustomerResults(list); })
        .catch(() => { if (!cancelled) setCustomerResults([]); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerQuery]);

  async function handleCreateCustomer() {
    setCustomerSaving(true);
    setCustomerError(null);
    try {
      const created = await customerService.createCustomer({
        firstName: newCustomer.firstName.trim() || undefined,
        lastName: newCustomer.lastName.trim() || undefined,
        phone: newCustomer.phone.trim() || undefined,
        email: newCustomer.email.trim() || undefined,
      });
      setCustomer(created);
      setCreatingCustomer(false);
      setCustomerQuery("");
      setNewCustomer({ firstName: "", lastName: "", phone: "", email: "" });
    } catch (err) {
      setCustomerError(err instanceof ApiError ? err.message : "No se pudo crear el cliente.");
    } finally {
      setCustomerSaving(false);
    }
  }

  // ---------- Pagos ----------
  const [payments, setPayments] = useState<PaymentRow[]>([emptyPaymentRow()]);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  function addPaymentRow() {
    setPayments((prev) => [...prev, emptyPaymentRow()]);
  }
  function removePaymentRow(id: string) {
    setPayments((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }
  function updatePayment(id: string, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  const paymentsTotal = round2(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  // Positivo = cambio a favor del cliente, negativo = falta por pagar.
  const paymentDifference = round2(paymentsTotal - totals.total);

  // ---------- Cobro ----------
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  function resetForm() {
    setCart([]);
    setCustomer(null);
    setCustomerQuery("");
    setCreatingCustomer(false);
    setPayments([emptyPaymentRow()]);
    setProductSearchInput("");
    setProductQuery("");
    setProductResults([]);
    setDiscountPin("");
    setDiscountPinError(null);
  }

  async function handleCheckout() {
    if (cart.length === 0 || submitting || !branchId) return;
    setSubmitting(true);
    setCartError(null);
    setPaymentError(null);
    setGeneralError(null);
    setDiscountPinError(null);
    try {
      const sale = await saleService.createSale({
        branchId,
        customerId: customer?.id,
        items: cart.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          discount: Number(l.discount) || undefined,
        })),
        payments: payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: Number(p.amount) })),
        pinCode: needsDiscountPin ? discountPin : undefined,
      });
      setCompletedSale(sale);
      setReceiptOpen(true);
      resetForm();
    } catch (err) {
      // El mensaje del servidor se muestra en la sección a la que
      // corresponde, en vez de un banner genérico que oculte el contexto.
      const message = err instanceof ApiError ? err.message : "No se pudo completar la venta.";
      if (message.includes("PIN")) setDiscountPinError(message);
      else if (message.includes("descuento")) setCartError(message);
      else if (message.includes("pago")) setPaymentError(message);
      else setGeneralError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (user && !user.allBranches && user.branches.length === 0) {
    return (
      <div className="pos-page">
        <StatusState kind="empty" message="No tienes ninguna sucursal asignada para vender. Contacta a un administrador." />
      </div>
    );
  }

  if (cashDrawerRequired) {
    return (
      <div className="pos-page">
        <div className="pos-cash-required">
          <Wallet size={32} />
          <h2>Primero debes abrir la caja</h2>
          <p>Antes de registrar una venta necesitas abrir el turno de caja en {selectedBranch?.name ?? "esta sucursal"}.</p>
          <Link to="/admin/caja" className="pos-cash-required__button">
            <Wallet size={16} /> Abrir caja ahora
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-page">
      <div className="pos-page__header">
        <div className="pos-page__title">
          <ShoppingCart size={22} />
          <h1>Punto de venta</h1>
        </div>
        {showBranchPicker ? (
          <label className="pos-page__branch-picker">
            <span>Sucursal</span>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </label>
        ) : selectedBranch ? (
          <p className="pos-page__branch-label">Vendiendo en: <strong>{selectedBranch.name}</strong></p>
        ) : null}
      </div>

      <div className="pos-layout">
        {/* ---------- Product search / picker ---------- */}
        <section className="pos-search">
          <label className="pos-search__input">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar producto por nombre, SKU o código de barras..."
              value={productSearchInput}
              onChange={(e) => setProductSearchInput(e.target.value)}
              autoFocus
            />
          </label>

          {productSearching && <StatusState kind="loading" compact />}
          {!productSearching && productQuery && productResults.length === 0 && (
            <StatusState kind="empty" compact message="No se encontraron productos." />
          )}
          {!productQuery && (
            <StatusState kind="empty" compact message="Busca un producto para agregarlo al carrito." />
          )}

          <ul className="pos-search__results">
            {productResults.map((p) => {
              const activeVariants = p.variants.filter((v) => v.status === "ACTIVE");
              return (
                <li key={p.id} className="pos-search__product">
                  {activeVariants.length === 0 ? (
                    (() => {
                      const stock = stockFor(p);
                      const outOfStock = stock !== null && stock <= 0;
                      return (
                        <button
                          type="button"
                          className={`pos-search__row${outOfStock ? " pos-search__row--out" : ""}`}
                          onClick={() => addToCart(p)}
                          disabled={outOfStock}
                        >
                          <span className="pos-search__row-name">{p.name}</span>
                          <span className="pos-search__row-sku">{p.sku}</span>
                          {outOfStock ? (
                            <span className="pos-search__row-outbadge"><AlertTriangle size={12} /> No hay en existencias</span>
                          ) : (
                            <span className="pos-search__row-price">{currencyFormatter.format(resolveUnitPrice(p))}</span>
                          )}
                        </button>
                      );
                    })()
                  ) : (
                    <>
                      <p className="pos-search__product-label">{p.name}</p>
                      {activeVariants.map((v) => {
                        const stock = stockFor(p, v);
                        const outOfStock = stock !== null && stock <= 0;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`pos-search__row pos-search__row--variant${outOfStock ? " pos-search__row--out" : ""}`}
                            onClick={() => addToCart(p, v)}
                            disabled={outOfStock}
                          >
                            <span className="pos-search__row-name">{v.name}</span>
                            <span className="pos-search__row-sku">{v.sku}</span>
                            {outOfStock ? (
                              <span className="pos-search__row-outbadge"><AlertTriangle size={12} /> No hay en existencias</span>
                            ) : (
                              <span className="pos-search__row-price">{currencyFormatter.format(resolveUnitPrice(p, v))}</span>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------- Cart + checkout ---------- */}
        <section className="pos-cart">
          <div className="pos-customer">
            <p className="pos-customer__label">Cliente</p>
            {customer ? (
              <div className="pos-customer__selected">
                <UserCheck size={16} />
                <div className="pos-customer__selected-text">
                  <p className="pos-customer__name">{customerDisplayName(customer)}</p>
                  {(customer.phone || customer.email) && (
                    <p className="pos-customer__meta">{customer.phone ?? customer.email}</p>
                  )}
                </div>
                <button type="button" onClick={() => setCustomer(null)}>Cambiar</button>
              </div>
            ) : creatingCustomer ? (
              <div className="pos-customer__create">
                <div className="pos-customer__create-row">
                  <input
                    autoFocus
                    placeholder="Nombre"
                    value={newCustomer.firstName}
                    onChange={(e) => setNewCustomer((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                  <input
                    placeholder="Apellido"
                    value={newCustomer.lastName}
                    onChange={(e) => setNewCustomer((prev) => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
                <div className="pos-customer__create-row">
                  <input
                    placeholder="Teléfono"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                  <input
                    placeholder="Correo"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                {customerError && <p className="pos-customer__error">{customerError}</p>}
                <div className="pos-customer__create-actions">
                  <button
                    type="button"
                    className="pos-customer__confirm"
                    onClick={handleCreateCustomer}
                    disabled={customerSaving || (!newCustomer.firstName.trim() && !newCustomer.phone.trim())}
                  >
                    {customerSaving ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Guardar
                  </button>
                  <button
                    type="button"
                    className="pos-customer__cancel"
                    onClick={() => { setCreatingCustomer(false); setCustomerError(null); }}
                  >
                    <X size={13} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="pos-customer__search">
                <label className="pos-customer__search-input">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nombre, teléfono o correo..."
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                  />
                </label>
                {customerQuery.trim() && (
                  <div className="pos-customer__results">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="pos-customer__result-row"
                        onClick={() => { setCustomer(c); setCustomerQuery(""); }}
                      >
                        <span>{customerDisplayName(c)}</span>
                        <span className="pos-customer__result-meta">{c.phone ?? c.email ?? ""}</span>
                      </button>
                    ))}
                    {customerResults.length === 0 && (
                      <p className="pos-customer__no-match">
                        Nadie coincide.{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingCustomer(true);
                            setNewCustomer({ firstName: customerQuery.trim(), lastName: "", phone: "", email: "" });
                            setCustomerError(null);
                          }}
                        >
                          <UserPlus size={13} /> Cliente nuevo
                        </button>
                      </p>
                    )}
                  </div>
                )}
                {!customerQuery.trim() && (
                  <p className="pos-customer__hint">Opcional. Sin cliente se usa "Cliente general".</p>
                )}
              </div>
            )}
          </div>

          <div className="pos-cart__lines">
            {cart.length === 0 && (
              <StatusState kind="empty" compact message="El carrito está vacío. Busca un producto para agregarlo." />
            )}
            {cartLinesComputed.map((l) => (
              <div key={l.key} className="pos-cart__line">
                <div className="pos-cart__line-top">
                  <div className="pos-cart__line-info">
                    <p className="pos-cart__line-name">{l.name}</p>
                    <p className="pos-cart__line-sku">{l.sku} · {currencyFormatter.format(l.unitPrice)} c/u</p>
                  </div>
                  <button type="button" className="pos-cart__line-remove" onClick={() => removeLine(l.key)} aria-label={`Quitar ${l.name}`}>
                    <X size={14} />
                  </button>
                </div>
                <div className="pos-cart__line-controls">
                  <div className="pos-cart__line-qty">
                    <button type="button" onClick={() => updateQuantity(l.key, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="Disminuir cantidad">
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => updateQuantity(l.key, Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                    />
                    <button type="button" onClick={() => updateQuantity(l.key, l.quantity + 1)} aria-label="Aumentar cantidad">
                      <Plus size={13} />
                    </button>
                  </div>
                  <label className="pos-cart__line-discount">
                    Desc.
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      value={l.discount}
                      onChange={(e) => updateDiscount(l.key, e.target.value)}
                    />
                  </label>
                  <p className="pos-cart__line-total">{currencyFormatter.format(l.lineTotal)}</p>
                </div>
                {l.overThreshold && (
                  <p className="pos-cart__line-warning">
                    <AlertTriangle size={12} /> Este descuento podría requerir autorización
                  </p>
                )}
              </div>
            ))}
          </div>

          {cartError && <p className="pos-cart__error"><AlertTriangle size={14} /> {cartError}</p>}

          <div className="pos-totals">
            <div className="pos-totals__row"><span>Subtotal</span><span>{currencyFormatter.format(totals.subtotal)}</span></div>
            <div className="pos-totals__row"><span>Descuento</span><span>-{currencyFormatter.format(totals.discountTotal)}</span></div>
            <div className="pos-totals__row"><span>Impuesto</span><span>{currencyFormatter.format(totals.taxTotal)}</span></div>
            <div className="pos-totals__row pos-totals__row--total"><span>Total</span><span>{currencyFormatter.format(totals.total)}</span></div>
          </div>

          <div className="pos-payments">
            <p className="pos-payments__label">Pagos</p>
            {payments.map((p) => (
              <div key={p.id} className="pos-payments__row">
                <Select value={p.method} onChange={(e) => updatePayment(p.id, { method: e.target.value as SalePaymentInput["method"] })}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={p.amount}
                  onChange={(e) => updatePayment(p.id, { amount: e.target.value })}
                />
                {payments.length > 1 && (
                  <button type="button" onClick={() => removePaymentRow(p.id)} aria-label="Quitar pago">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="pos-payments__add" onClick={addPaymentRow}>
              <Plus size={14} /> Agregar pago
            </button>

            {paymentDifference < 0 && (
              <p className="pos-payments__status pos-payments__status--short">
                Falta por cubrir: {currencyFormatter.format(Math.abs(paymentDifference))}
              </p>
            )}
            {paymentDifference > 0 && (
              <p className="pos-payments__status pos-payments__status--change">
                Cambio a entregar: {currencyFormatter.format(paymentDifference)}
              </p>
            )}
            {paymentDifference === 0 && paymentsTotal > 0 && (
              <p className="pos-payments__status pos-payments__status--exact">Pago exacto</p>
            )}
          </div>

          {paymentError && <p className="pos-payments__error"><AlertTriangle size={14} /> {paymentError}</p>}
          {generalError && <p className="pos-cart__error"><AlertTriangle size={14} /> {generalError}</p>}

          {needsDiscountPin ? (
            <PinAuthPrompt
              value={discountPin}
              onChange={setDiscountPin}
              onSubmit={handleCheckout}
              submitLabel="Cobrar"
              submittingLabel="Procesando..."
              error={discountPinError}
              busy={submitting}
              disabled={cart.length === 0}
              description="Un descuento supera lo que puedes autorizar tú mismo/a. Pide a un supervisor su PIN para cobrar."
            />
          ) : (
            <button
              type="button"
              className="pos-checkout-btn"
              onClick={handleCheckout}
              disabled={cart.length === 0 || submitting}
            >
              {submitting ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              {submitting ? "Procesando..." : "Cobrar"}
            </button>
          )}
        </section>
      </div>

      <Modal open={receiptOpen} onClose={() => setReceiptOpen(false)} title="Venta completada" className="pos-receipt-modal">
        {completedSale && <SaleReceipt sale={completedSale} />}
      </Modal>
    </div>
  );
}
