import { Link } from "react-router-dom";
import { ArrowRight, Banknote, Clock3, MapPin, Store, Truck } from "lucide-react";
import "./ShippingPage.css";

const STEPS = [
  { title: "Elige tus productos", desc: "Arma tu carrito desde el catálogo en línea." },
  { title: "Elige cómo recibirlo", desc: "Retiro en sucursal o entrega a domicilio, tú decides." },
  { title: "Confirma tu pedido", desc: "Recibes un número de pedido para darle seguimiento." },
  { title: "Paga al recibir", desc: "Efectivo, tarjeta o transferencia, directamente al entregarlo." },
];

export function ShippingPage() {
  return (
    <div className="storefront-shipping">
      <section className="storefront-page-header">
        <span className="storefront-page-header__eyebrow">
          <Truck size={14} aria-hidden="true" /> Envíos y entregas
        </span>
        <h1>Recíbelo como te quede mejor.</h1>
        <p>
          Ofrecemos dos formas de recibir tu pedido: retiro sin costo en la sucursal que elijas, o entrega
          directa en tu domicilio. Ambas opciones se confirman en el mismo paso de pago dentro del checkout.
        </p>
      </section>

      <section className="storefront-section storefront-shipping__options">
        <div className="storefront-shipping__option-card">
          <span className="storefront-shipping__option-icon"><Store size={22} aria-hidden="true" /></span>
          <h2>Retiro en sucursal</h2>
          <p>
            Elige la sucursal que más te convenga al finalizar tu compra. Prepararemos tu pedido y te
            avisaremos en cuanto esté listo para recoger — normalmente el mismo día en que se confirma.
          </p>
          <ul className="storefront-shipping__option-facts">
            <li><Clock3 size={14} aria-hidden="true" /> Disponible el mismo día en la mayoría de los casos</li>
            <li><Banknote size={14} aria-hidden="true" /> Sin costo adicional</li>
          </ul>
        </div>

        <div className="storefront-shipping__option-card">
          <span className="storefront-shipping__option-icon"><Truck size={22} aria-hidden="true" /></span>
          <h2>Entrega a domicilio</h2>
          <p>
            Escribe tu dirección al finalizar tu compra (o comparte tu ubicación para agilizar el proceso) y
            lo llevamos hasta tu puerta. La cobertura y el tiempo de entrega dependen de la sucursal más
            cercana a tu domicilio.
          </p>
          <ul className="storefront-shipping__option-facts">
            <li><Clock3 size={14} aria-hidden="true" /> De 1 a 3 días hábiles, según cobertura</li>
            <li><MapPin size={14} aria-hidden="true" /> Disponible según la cercanía a tu sucursal más cercana</li>
          </ul>
        </div>
      </section>

      <section className="storefront-section">
        <div className="storefront-section__header">
          <h2>¿Cómo funciona?</h2>
        </div>
        <ol className="storefront-shipping__steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="storefront-shipping__step">
              <span className="storefront-shipping__step-number">{index + 1}</span>
              <div>
                <p className="storefront-shipping__step-title">{step.title}</p>
                <p className="storefront-shipping__step-desc">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="storefront-shipping__note">
        <div className="storefront-shipping__note-inner">
          <p>
            <strong>El pago se realiza al momento de recibir o recoger tu pedido</strong> — no procesamos
            pagos con tarjeta dentro del sitio. Puedes elegir entre efectivo, tarjeta o transferencia bancaria
            directamente en el checkout.
          </p>
          <Link to="/catalogo" className="storefront-shipping__note-link">
            Empezar mi pedido <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
