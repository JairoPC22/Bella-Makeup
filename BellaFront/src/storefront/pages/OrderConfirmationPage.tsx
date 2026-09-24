import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  MapPin,
  Package,
  Search,
  Store,
} from "lucide-react";
import { PublicApiError, trackOnlineOrder } from "../../services/storefrontService";
import type { OnlineOrder } from "../../types/api";
import "./OrderConfirmationPage.css";

import { currencyFormatter } from "../../utils/currency";

const PAYMENT_COPY: Record<OnlineOrder["paymentMethod"], { label: string; icon: typeof Banknote; note: string }> = {
  CASH: { label: "Efectivo", icon: Banknote, note: "Ten el monto exacto listo — el pago se realiza al recibir tu pedido." },
  CARD: { label: "Tarjeta", icon: CreditCard, note: "Tendremos la terminal lista — el pago se realiza al recibir tu pedido." },
  TRANSFER: {
    label: "Transferencia",
    icon: Landmark,
    note: "Te compartiremos los datos bancarios por WhatsApp/correo para confirmar tu pedido.",
  },
};

const STATUS_COPY: Record<OnlineOrder["status"], string> = {
  PENDING: "Pendiente de confirmación",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  READY: "Listo para recoger",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export function OrderConfirmationPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const location = useLocation();

  // El pedido llega vía router state desde CheckoutPage, pero ese estado no
  // sobrevive un refresh, un marcador o un link compartido. Como fallback
  // existe un endpoint público protegido por teléfono
  // (GET /api/public/orders/:orderNumber?phone=…) que se usa para
  // reconsultar el pedido en vez de mostrar un error definitivo.
  const [order, setOrder] = useState<OnlineOrder | null>((location.state as OnlineOrder | null) ?? null);
  const [phone, setPhone] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "error">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    const fromState = location.state as OnlineOrder | null;
    if (fromState) setOrder(fromState);
  }, [location.state]);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    if (!orderNumber || !phone.trim()) return;
    setLookupState("loading");
    setLookupError(null);
    try {
      const found = await trackOnlineOrder(orderNumber, phone.trim());
      setOrder(found);
      setLookupState("idle");
    } catch (err) {
      setLookupState("error");
      setLookupError(
        err instanceof PublicApiError && err.status === 404
          ? "No encontramos un pedido con ese número y teléfono. Revisa los datos e intenta de nuevo."
          : "No pudimos consultar tu pedido en este momento. Intenta de nuevo más tarde."
      );
    }
  }

  if (!order) {
    return (
      <div className="storefront-section storefront-confirmation__lookup-wrap">
        <div className="storefront-confirmation__lookup">
          <span className="storefront-confirmation__lookup-icon">
            <Search size={26} aria-hidden="true" />
          </span>
          <h1>Consulta tu pedido</h1>
          <p>
            {orderNumber
              ? <>Para mostrarte el detalle del pedido <strong>{orderNumber}</strong>, confirma el teléfono con el que lo realizaste.</>
              : "Necesitamos un número de pedido para continuar."}
          </p>
          {orderNumber && (
            <form className="storefront-confirmation__lookup-form" onSubmit={handleLookup}>
              <div className="storefront-field">
                <label htmlFor="lookup-phone">Teléfono del pedido</label>
                <input
                  id="lookup-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="555-000-0000"
                  required
                />
              </div>
              <button type="submit" className="storefront-primary-btn" disabled={lookupState === "loading"}>
                {lookupState === "loading" && <Loader2 size={16} className="spin" aria-hidden="true" />}
                {lookupState === "loading" ? "Consultando..." : "Ver mi pedido"}
              </button>
            </form>
          )}
          {lookupError && <p className="storefront-error-banner" role="alert">{lookupError}</p>}
          <Link to="/catalogo" className="storefront-confirmation__lookup-alt">
            Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  const payment = PAYMENT_COPY[order.paymentMethod];
  const PaymentIcon = payment.icon;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="storefront-confirmation">
      {/* Banda de color en vez de un tick plano: es la pantalla de mayor impacto emocional del flujo. */}
      <div className="storefront-confirmation__banner">
        <div className="storefront-confirmation__banner-inner">
          <span className="storefront-confirmation__tick">
            <CheckCircle2 size={34} aria-hidden="true" />
          </span>
          <h1>¡Gracias, {order.customerName.split(" ")[0]}!</h1>
          <p>Tu pedido fue recibido correctamente. Te contactaremos para confirmarlo.</p>
          <div className="storefront-confirmation__number">
            <span>Número de pedido</span>
            <strong>{order.orderNumber}</strong>
          </div>
          <span className="storefront-confirmation__status">
            <Clock3 size={13} aria-hidden="true" /> {STATUS_COPY[order.status]}
          </span>
        </div>
      </div>

      <div className="storefront-section">
        <div className="storefront-confirmation__layout">
          <section className="storefront-confirmation__block">
            <div className="storefront-confirmation__block-head">
              <h2><Package size={16} aria-hidden="true" /> Productos</h2>
              <span>{itemCount} {itemCount === 1 ? "artículo" : "artículos"}</span>
            </div>
            <ul className="storefront-confirmation__items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span className="storefront-confirmation__item-qty">{item.quantity}</span>
                  <span className="storefront-confirmation__item-name">
                    {item.product.name}{item.variant ? ` — ${item.variant.name}` : ""}
                  </span>
                  <span className="storefront-confirmation__item-total">
                    {currencyFormatter.format(Number(item.lineTotal))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="storefront-confirmation__totals">
              <div><span>Subtotal</span><span>{currencyFormatter.format(Number(order.subtotal))}</span></div>
              <div><span>Impuestos</span><span>{currencyFormatter.format(Number(order.taxTotal))}</span></div>
              <div className="storefront-confirmation__totals-grand">
                <span>Total</span><span>{currencyFormatter.format(Number(order.total))}</span>
              </div>
            </div>
          </section>

          <aside className="storefront-confirmation__block">
            <div className="storefront-confirmation__block-head">
              <h2>
                {order.fulfillmentType === "PICKUP"
                  ? <Store size={16} aria-hidden="true" />
                  : <MapPin size={16} aria-hidden="true" />}
                Entrega
              </h2>
            </div>
            <p className="storefront-confirmation__fulfillment">
              {order.fulfillmentType === "PICKUP" ? "Recoger en tienda" : "Entrega a domicilio"}
            </p>
            {order.fulfillmentType === "PICKUP" ? (
              <p className="storefront-confirmation__meta">
                {order.branch.name}{order.branch.address ? ` — ${order.branch.address}` : ""}
              </p>
            ) : (
              <p className="storefront-confirmation__meta">{order.deliveryAddress}</p>
            )}

            <div className="storefront-confirmation__block-head storefront-confirmation__payment-heading">
              <h2><PaymentIcon size={16} aria-hidden="true" /> Pago</h2>
            </div>
            <p className="storefront-confirmation__fulfillment">{payment.label}</p>
            <p className="storefront-confirmation__meta">{payment.note}</p>

            {order.notes && (
              <>
                <div className="storefront-confirmation__block-head storefront-confirmation__payment-heading">
                  <h2>Notas</h2>
                </div>
                <p className="storefront-confirmation__meta">{order.notes}</p>
              </>
            )}
          </aside>
        </div>

        <div className="storefront-confirmation__footer">
          <p>Guarda tu número de pedido — con él y tu teléfono puedes consultarlo cuando quieras.</p>
          <Link to="/catalogo" className="storefront-primary-btn">
            Seguir comprando <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
