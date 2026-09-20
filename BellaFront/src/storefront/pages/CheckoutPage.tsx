import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banknote, Building2, CreditCard, Landmark, Loader2, LocateFixed, MapPin, Store, Truck } from "lucide-react";
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

export function CheckoutPage() {
  const { lines, subtotal, clearCart } = useCart();
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
      <div className="storefront-section">
        <StatusState kind="empty" message="Tu carrito está vacío. Agrega productos antes de continuar al pago." />
        <p className="storefront-checkout__back">
          <Link to="/catalogo">Ir al catálogo</Link>
        </p>
      </div>
    );
  }

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
    <div className="storefront-section storefront-checkout">
      <div className="storefront-section__header">
        <h2>Finalizar pedido</h2>
      </div>

      <form className="storefront-checkout__layout" onSubmit={handleSubmit}>
        <div className="storefront-checkout__form">
          <section className="storefront-checkout__block">
            <h3>Tus datos</h3>
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
            <h3>Entrega</h3>
            <div className="storefront-toggle-group">
              <button
                type="button"
                className={`storefront-toggle-card${fulfillmentType === "PICKUP" ? " storefront-toggle-card--active" : ""}`}
                onClick={() => setFulfillmentType("PICKUP")}
              >
                <span className="storefront-toggle-card__title"><Store size={16} aria-hidden="true" /> Recoger en tienda</span>
                <p className="storefront-toggle-card__desc">Retira tu pedido en la sucursal que elijas.</p>
              </button>
              <button
                type="button"
                className={`storefront-toggle-card${fulfillmentType === "DELIVERY" ? " storefront-toggle-card--active" : ""}`}
                onClick={() => setFulfillmentType("DELIVERY")}
              >
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
                  <div className="storefront-branch-list">
                    {branches.map((branch) => (
                      <button
                        key={branch.id}
                        type="button"
                        className={`storefront-branch-card${selectedBranchId === branch.id ? " storefront-branch-card--active" : ""}`}
                        onClick={() => setSelectedBranchId(branch.id)}
                      >
                        <span className="storefront-branch-card__name"><Building2 size={15} aria-hidden="true" /> {branch.name}</span>
                        {branch.address && <span className="storefront-branch-card__meta">{branch.address}</span>}
                        {branch.schedule && <span className="storefront-branch-card__meta">{branch.schedule}</span>}
                      </button>
                    ))}
                  </div>
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
            <h3>Método de pago</h3>
            <div className="storefront-toggle-group storefront-toggle-group--payment">
              {PAYMENT_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`storefront-toggle-card${paymentMethod === option.value ? " storefront-toggle-card--active" : ""}`}
                    onClick={() => setPaymentMethod(option.value)}
                  >
                    <span className="storefront-toggle-card__title"><Icon size={16} aria-hidden="true" /> {option.label}</span>
                    <p className="storefront-toggle-card__desc">{option.note}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="storefront-checkout__block">
            <h3>Notas (opcional)</h3>
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
          <h3>Resumen del pedido</h3>
          <ul className="storefront-checkout__summary-lines">
            {lines.map((line) => (
              <li key={`${line.productId}::${line.variantId ?? ""}`}>
                <span>{line.quantity}× {line.name}</span>
                <span>{currencyFormatter.format(line.unitPrice * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="storefront-checkout__summary-total">
            <span>Total</span>
            <strong>{currencyFormatter.format(subtotal)}</strong>
          </div>
          <button type="submit" className="storefront-primary-btn storefront-checkout__submit" disabled={submitting}>
            {submitting && <Loader2 size={16} className="spin" aria-hidden="true" />}
            {submitting ? "Enviando pedido..." : "Confirmar pedido"}
          </button>
        </aside>
      </form>
    </div>
  );
}
