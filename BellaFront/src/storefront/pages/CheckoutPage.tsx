import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { createOnlineOrder, listPublicBranches, PublicApiError } from "../../services/storefrontService";
import type { CreateOnlineOrderInput, OnlineOrderFulfillment, PublicBranch } from "../../types/api";
import { useCart } from "../CartContext";
import { findNearestBranch } from "../utils/geo";
import "./CheckoutPage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type FulfillmentType = "PICKUP" | "DELIVERY";
type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote; note: string }[] = [
  { value: "CASH", label: "Efectivo", icon: Banknote, note: "El pago se realiza al recibir tu pedido." },
  { value: "CARD", label: "Tarjeta", icon: CreditCard, note: "El pago se realiza al recibir tu pedido." },
  {
    value: "TRANSFER",
    label: "Transferencia",
    icon: Landmark,
    note: "Te compartiremos los datos bancarios por WhatsApp/correo para confirmar tu pedido.",
  },
];

// The three real stages of the order flow (cart → this page →
// confirmation). Deliberately NOT a fake multi-step wizard over a form
// that is in fact one page — it reports where the shopper actually is.
const STAGES = ["Carrito", "Tus datos", "Confirmación"];

export function CheckoutPage() {
  const { lines, subtotal, itemCount, clearCart } = useCart();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("PICKUP");
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [branchesStatus, setBranchesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPublicBranches()
      .then((data) => {
        setBranches(data);
        setBranchesStatus("ready");
        if (data.length > 0) setSelectedBranchId((prev) => prev || data[0].id);
      })
      .catch(() => setBranchesStatus("error"));
  }, []);

  // Only meaningful once both the shopper granted geolocation AND the
  // backend has started returning branch coordinates — until then this
  // silently stays null and the informational note below just doesn't
  // render, per the "skip gracefully" instruction.
  const nearestBranch = coords ? findNearestBranch(coords, branches) : null;

  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationDenied(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
        setLocationDenied(false);
      },
      () => {
        // Permission denied or unavailable — delivery by typed address
        // alone must still work fine, so this never blocks submission,
        // it just skips the silent lat/lng capture.
        setLocating(false);
        setLocationDenied(true);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  if (lines.length === 0) {
    return (
      <div className="storefront-section storefront-checkout__empty">
        <span className="storefront-checkout__empty-icon">
          <ShoppingBag size={28} aria-hidden="true" />
        </span>
        <h1>Tu carrito está vacío</h1>
        <p>Agrega algunos productos antes de continuar al pago.</p>
        <Link to="/catalogo" className="storefront-primary-btn">Ir al catálogo</Link>
      </div>
    );
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;
  const selectedPayment = PAYMENT_OPTIONS.find((p) => p.value === paymentMethod)!;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !phone.trim()) {
      setError("Nombre y teléfono son obligatorios.");
      return;
    }
    if (fulfillmentType === "PICKUP" && !selectedBranchId) {
      setError("Selecciona una sucursal para recoger tu pedido.");
      return;
    }
    if (fulfillmentType === "DELIVERY" && !address.trim()) {
      setError("Escribe una dirección de entrega.");
      return;
    }

    const fulfillment: OnlineOrderFulfillment =
      fulfillmentType === "PICKUP"
        ? { type: "PICKUP", branchId: selectedBranchId }
        : {
            type: "DELIVERY",
            branchId: nearestBranch?.id ?? selectedBranchId ?? branches[0]?.id ?? "",
            address: address.trim(),
            ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
          };

    const input: CreateOnlineOrderInput = {
      customer: {
        firstName: firstName.trim(),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        phone: phone.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      },
      fulfillment,
      paymentMethod,
      items: lines.map((line) => ({
        productId: line.productId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        quantity: line.quantity,
      })),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    setSubmitting(true);
    try {
      const order = await createOnlineOrder(input);
      clearCart();
      navigate(`/pedido/${order.orderNumber}`, { state: order });
    } catch (err) {
      setError(err instanceof PublicApiError ? err.message : "No se pudo enviar tu pedido. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="storefront-checkout">
      <div className="storefront-page-header__band">
        <header className="storefront-page-header storefront-checkout__header">
          <span className="storefront-page-header__eyebrow">
            <Lock size={13} aria-hidden="true" /> Pedido seguro
          </span>
          <h1>Finalizar pedido</h1>
          <ol className="storefront-checkout__stages" aria-label="Progreso del pedido">
            {STAGES.map((stage, index) => (
              <li
                key={stage}
                className={
                  index === 0
                    ? "is-done"
                    : index === 1
                      ? "is-current"
                      : undefined
                }
              >
                <span className="storefront-checkout__stage-dot">
                  {index === 0 ? <Check size={12} aria-hidden="true" /> : index + 1}
                </span>
                {stage}
              </li>
            ))}
          </ol>
        </header>
      </div>

      <div className="storefront-section">
        <form className="storefront-checkout__layout" onSubmit={handleSubmit}>
          <div className="storefront-checkout__form">
            <section className="storefront-checkout__block">
              <div className="storefront-checkout__block-head">
                <span className="storefront-checkout__block-num">01</span>
                <div>
                  <h2>Tus datos</h2>
                  <p>Para avisarte cuando tu pedido esté listo.</p>
                </div>
              </div>
              <div className="storefront-checkout__grid">
                <div className="storefront-field">
                  <label htmlFor="firstName">Nombre</label>
                  <input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="storefront-field">
                  <label htmlFor="lastName">Apellido (opcional)</label>
                  <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="storefront-field">
                  <label htmlFor="phone">Teléfono</label>
                  <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <div className="storefront-field">
                  <label htmlFor="email">Correo (opcional)</label>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
            </section>

            <section className="storefront-checkout__block">
              <div className="storefront-checkout__block-head">
                <span className="storefront-checkout__block-num">02</span>
                <div>
                  <h2>¿Cómo lo quieres recibir?</h2>
                  <p>Retiro sin costo en sucursal o entrega en tu domicilio.</p>
                </div>
              </div>
              <div className="storefront-toggle-group">
                <button
                  type="button"
                  className={`storefront-toggle-card${fulfillmentType === "PICKUP" ? " storefront-toggle-card--active" : ""}`}
                  onClick={() => setFulfillmentType("PICKUP")}
                  aria-pressed={fulfillmentType === "PICKUP"}
                >
                  <span className="storefront-toggle-card__check"><CheckCircle2 size={16} aria-hidden="true" /></span>
                  <span className="storefront-toggle-card__title"><Store size={16} aria-hidden="true" /> Recoger en tienda</span>
                  <p className="storefront-toggle-card__desc">Retira tu pedido en la sucursal que elijas. Sin costo.</p>
                </button>
                <button
                  type="button"
                  className={`storefront-toggle-card${fulfillmentType === "DELIVERY" ? " storefront-toggle-card--active" : ""}`}
                  onClick={() => setFulfillmentType("DELIVERY")}
                  aria-pressed={fulfillmentType === "DELIVERY"}
                >
                  <span className="storefront-toggle-card__check"><CheckCircle2 size={16} aria-hidden="true" /></span>
                  <span className="storefront-toggle-card__title"><Truck size={16} aria-hidden="true" /> Entrega a domicilio</span>
                  <p className="storefront-toggle-card__desc">Lo llevamos a la dirección que indiques.</p>
                </button>
              </div>

              {fulfillmentType === "PICKUP" && (
                <div className="storefront-checkout__branches">
                  {branchesStatus === "loading" && <StatusState kind="loading" compact />}
                  {branchesStatus === "error" && (
                    <StatusState kind="error" compact message="No se pudieron cargar las sucursales." />
                  )}
                  {branchesStatus === "ready" && branches.length === 0 && (
                    <StatusState kind="empty" compact message="No hay sucursales disponibles por ahora." />
                  )}
                  {branchesStatus === "ready" && branches.length > 0 && (
                    <>
                      <p className="storefront-checkout__sublabel">Elige tu sucursal</p>
                      <div className="storefront-branch-list">
                        {branches.map((branch) => (
                          <button
                            key={branch.id}
                            type="button"
                            className={`storefront-branch-card${selectedBranchId === branch.id ? " storefront-branch-card--active" : ""}`}
                            onClick={() => setSelectedBranchId(branch.id)}
                            aria-pressed={selectedBranchId === branch.id}
                          >
                            <span className="storefront-branch-card__icon"><Building2 size={16} aria-hidden="true" /></span>
                            <span className="storefront-branch-card__text">
                              <span className="storefront-branch-card__name">{branch.name}</span>
                              {branch.address && <span className="storefront-branch-card__meta">{branch.address}</span>}
                              {branch.schedule && <span className="storefront-branch-card__meta">{branch.schedule}</span>}
                            </span>
                            <span className="storefront-branch-card__check">
                              <CheckCircle2 size={18} aria-hidden="true" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {fulfillmentType === "DELIVERY" && (
                <div className="storefront-checkout__delivery">
                  <div className="storefront-field">
                    <label htmlFor="address">Dirección de entrega</label>
                    <textarea
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Calle, número, colonia, referencias..."
                      required
                    />
                  </div>
                  <button type="button" className="storefront-location-btn" onClick={handleUseMyLocation} disabled={locating}>
                    {locating ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <LocateFixed size={15} aria-hidden="true" />}
                    {locating ? "Obteniendo ubicación..." : "Usar mi ubicación"}
                  </button>
                  {coords && (
                    <p className="storefront-checkout__hint">
                      <MapPin size={13} aria-hidden="true" /> Ubicación capturada para agilizar la entrega.
                    </p>
                  )}
                  {locationDenied && (
                    <p className="storefront-checkout__hint">
                      No pudimos obtener tu ubicación — no hay problema, tu dirección escrita es suficiente.
                    </p>
                  )}
                  {nearestBranch && (
                    <p className="storefront-checkout__hint storefront-checkout__hint--strong">
                      <Store size={13} aria-hidden="true" /> Se surtirá desde: {nearestBranch.name}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="storefront-checkout__block">
              <div className="storefront-checkout__block-head">
                <span className="storefront-checkout__block-num">03</span>
                <div>
                  <h2>Método de pago</h2>
                  <p>El pago se realiza al recoger o recibir tu pedido.</p>
                </div>
              </div>
              <div className="storefront-toggle-group storefront-toggle-group--payment">
                {PAYMENT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`storefront-toggle-card${paymentMethod === option.value ? " storefront-toggle-card--active" : ""}`}
                      onClick={() => setPaymentMethod(option.value)}
                      aria-pressed={paymentMethod === option.value}
                    >
                      <span className="storefront-toggle-card__check"><CheckCircle2 size={16} aria-hidden="true" /></span>
                      <span className="storefront-toggle-card__title"><Icon size={16} aria-hidden="true" /> {option.label}</span>
                      <p className="storefront-toggle-card__desc">{option.note}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="storefront-checkout__block">
              <div className="storefront-checkout__block-head">
                <span className="storefront-checkout__block-num">04</span>
                <div>
                  <h2>Notas <span className="storefront-checkout__optional">opcional</span></h2>
                  <p>¿Algo que debamos saber al preparar tu pedido?</p>
                </div>
              </div>
              <div className="storefront-field">
                <label htmlFor="notes" className="storefront-visually-hidden">Notas para tu pedido</label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones especiales para tu pedido..."
                />
              </div>
            </section>

            {error && <p className="storefront-error-banner" role="alert">{error}</p>}
          </div>

          <aside className="storefront-checkout__summary">
            <div className="storefront-checkout__summary-head">
              <h2>Resumen del pedido</h2>
              <span>{itemCount} {itemCount === 1 ? "artículo" : "artículos"}</span>
            </div>

            <ul className="storefront-checkout__summary-lines">
              {lines.map((line) => (
                <li key={`${line.productId}::${line.variantId ?? ""}`}>
                  <span className="storefront-checkout__summary-thumb">
                    {line.imageUrl
                      ? <img src={line.imageUrl} alt="" />
                      : <ShoppingBag size={16} aria-hidden="true" />}
                    <span className="storefront-checkout__summary-qty">{line.quantity}</span>
                  </span>
                  <span className="storefront-checkout__summary-name">{line.name}</span>
                  <span className="storefront-checkout__summary-amount">
                    {currencyFormatter.format(line.unitPrice * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            {/* A live echo of the two choices made on the left, so the
                shopper can confirm both without scrolling back up. */}
            <ul className="storefront-checkout__summary-facts">
              <li>
                {fulfillmentType === "PICKUP"
                  ? <Store size={14} aria-hidden="true" />
                  : <Truck size={14} aria-hidden="true" />}
                <span>
                  {fulfillmentType === "PICKUP"
                    ? selectedBranch
                      ? `Retiro en ${selectedBranch.name}`
                      : "Retiro en sucursal"
                    : address.trim()
                      ? `Entrega en ${address.trim()}`
                      : "Entrega a domicilio"}
                </span>
              </li>
              <li>
                <selectedPayment.icon size={14} aria-hidden="true" />
                <span>Pago con {selectedPayment.label.toLowerCase()} al recibir</span>
              </li>
            </ul>

            <div className="storefront-checkout__summary-total">
              <span>Total</span>
              <strong>{currencyFormatter.format(subtotal)}</strong>
            </div>

            <button type="submit" className="storefront-primary-btn storefront-checkout__submit" disabled={submitting}>
              {submitting && <Loader2 size={16} className="spin" aria-hidden="true" />}
              {submitting ? "Enviando pedido..." : "Confirmar pedido"}
            </button>
            <p className="storefront-checkout__reassure">
              <Lock size={12} aria-hidden="true" />
              No se cobra nada ahora. Confirmamos tu pedido antes de prepararlo.
            </p>
          </aside>
        </form>
      </div>
    </div>
  );
}
