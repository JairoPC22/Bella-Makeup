import { Link, useLocation, useParams } from "react-router-dom";
import { Banknote, CheckCircle2, CreditCard, Landmark, MapPin, Store } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import type { OnlineOrder } from "../../types/api";
import "./OrderConfirmationPage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const PAYMENT_COPY: Record<OnlineOrder["paymentMethod"], { label: string; icon: typeof Banknote; note: string }> = {
  CASH: { label: "Efectivo", icon: Banknote, note: "Ten el monto exacto listo — el pago se realiza al recibir tu pedido." },
  CARD: { label: "Tarjeta", icon: CreditCard, note: "Tendremos la terminal lista — el pago se realiza al recibir tu pedido." },
  TRANSFER: {
    label: "Transferencia",
    icon: Landmark,
    note: "Te compartiremos los datos bancarios por WhatsApp/correo para confirmar tu pedido.",
  },
};

export function OrderConfirmationPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const location = useLocation();
  // The order is handed off via router state from CheckoutPage's
  // navigate(path, {state: order}) — this page deliberately does NOT
  // re-fetch by orderNumber (no public GET-by-number endpoint is part of
  // this pass' contract), so a direct visit/refresh/bookmark with no state
  // falls through to the "not found" branch below instead of crashing.
  const order = location.state as OnlineOrder | null;

  if (!order) {
    return (
      <div className="storefront-section">
        <StatusState
          kind="empty"
          message={
            orderNumber
              ? `No encontramos el pedido ${orderNumber}. Si acabas de hacer un pedido, revisa el enlace que te compartimos.`
              : "No encontramos ese pedido."
          }
        />
        <p className="storefront-confirmation__back">
          <Link to="/">Volver a la tienda</Link>
        </p>
      </div>
    );
  }

  const payment = PAYMENT_COPY[order.paymentMethod];
  const PaymentIcon = payment.icon;

  return (
    <div className="storefront-section storefront-confirmation">
      <div className="storefront-confirmation__hero">
        <CheckCircle2 size={40} aria-hidden="true" />
        <h1>¡Gracias, {order.customerName.split(" ")[0]}!</h1>
        <p>Tu pedido fue recibido correctamente.</p>
        <p className="storefront-confirmation__number">Número de pedido: <strong>{order.orderNumber}</strong></p>
      </div>

      <div className="storefront-confirmation__layout">
        <section className="storefront-confirmation__block">
          <h3>Productos</h3>
          <ul className="storefront-confirmation__items">
            {order.items.map((item) => (
              <li key={item.id}>
                <span>{item.quantity}× {item.product.name}{item.variant ? ` — ${item.variant.name}` : ""}</span>
                <span>{currencyFormatter.format(Number(item.lineTotal))}</span>
              </li>
            ))}
          </ul>
          <div className="storefront-confirmation__totals">
            <div><span>Subtotal</span><span>{currencyFormatter.format(Number(order.subtotal))}</span></div>
            <div><span>Impuestos</span><span>{currencyFormatter.format(Number(order.taxTotal))}</span></div>
            <div className="storefront-confirmation__totals-grand"><span>Total</span><span>{currencyFormatter.format(Number(order.total))}</span></div>
          </div>
        </section>

        <aside className="storefront-confirmation__block">
          <h3>Entrega</h3>
          <p className="storefront-confirmation__fulfillment">
            {order.fulfillmentType === "PICKUP" ? <Store size={16} aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}
            {order.fulfillmentType === "PICKUP" ? "Recoger en tienda" : "Entrega a domicilio"}
          </p>
          {order.fulfillmentType === "PICKUP" ? (
            <p className="storefront-confirmation__meta">
              {order.branch.name}{order.branch.address ? ` — ${order.branch.address}` : ""}
            </p>
          ) : (
            <p className="storefront-confirmation__meta">{order.deliveryAddress}</p>
          )}

          <h3 className="storefront-confirmation__payment-heading">Pago</h3>
          <p className="storefront-confirmation__fulfillment">
            <PaymentIcon size={16} aria-hidden="true" /> {payment.label}
          </p>
          <p className="storefront-confirmation__meta">{payment.note}</p>
        </aside>
      </div>

      <p className="storefront-confirmation__back">
        <Link to="/catalogo">Seguir comprando</Link>
      </p>
    </div>
  );
}
