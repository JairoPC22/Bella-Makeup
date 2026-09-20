import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import "./FaqPage.css";

type FaqItem = { question: string; answer: string };

// Answers are written to match exactly what CheckoutPage.tsx actually does
// today — three payment methods (Efectivo / Tarjeta / Transferencia), all
// settled in person at pickup/delivery, no online card processing, and
// fulfillment via either a chosen branch (PICKUP) or a typed address with
// optional geolocation (DELIVERY). Nothing here promises behavior the
// storefront doesn't implement.
const FAQS: FaqItem[] = [
  {
    question: "¿Cómo hago un pedido en línea?",
    answer:
      "Elige tus productos desde el catálogo y agrégalos al carrito. Al finalizar tu compra, captura tus datos de contacto, elige si prefieres recoger en sucursal o recibir a domicilio, y selecciona tu método de pago. Al confirmar recibirás un número de pedido con el que puedes dar seguimiento a tu compra.",
  },
  {
    question: "¿Qué métodos de pago están disponibles?",
    answer:
      "Puedes elegir entre efectivo, tarjeta o transferencia bancaria. Los tres se liquidan al momento de recoger o recibir tu pedido; si eliges transferencia, te compartiremos los datos bancarios por WhatsApp o correo para confirmar tu compra antes de prepararla.",
  },
  {
    question: "¿Puedo pagar con tarjeta en línea al momento de comprar?",
    answer:
      "Por ahora no procesamos pagos con tarjeta dentro del sitio. El pago —incluido con tarjeta— se realiza en persona, cuando recoges tu pedido en sucursal o cuando te lo entregamos a domicilio.",
  },
  {
    question: "¿Cuáles son los tiempos de entrega o recolección?",
    answer:
      "El retiro en sucursal suele estar disponible el mismo día en que confirmamos tu pedido. La entrega a domicilio toma normalmente de 1 a 3 días hábiles, dependiendo de la cobertura de la sucursal más cercana a tu dirección.",
  },
  {
    question: "¿Cuál es la política de cambios y devoluciones?",
    answer:
      "Aceptamos cambios y devoluciones dentro de los 7 días posteriores a tu compra, siempre que el producto esté sellado, sin uso y en su empaque original, y presentes tu número de pedido. El cambio se realiza en la sucursal que surtió tu pedido.",
  },
  {
    question: "¿Cómo sé si un producto está disponible en mi sucursal?",
    answer:
      "Al elegir 'Recoger en tienda' durante el pago, verás la lista de sucursales disponibles para tu pedido. Si quieres confirmar existencia de un producto específico antes de comprar, también puedes contactar directamente a tu sucursal más cercana.",
  },
];

export function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="storefront-faq">
      <section className="storefront-page-header">
        <span className="storefront-page-header__eyebrow">
          <HelpCircle size={14} aria-hidden="true" /> Preguntas frecuentes
        </span>
        <h1>¿Tienes dudas? Aquí tenemos respuestas.</h1>
        <p>
          Reunimos las preguntas que más nos hacen sobre pedidos, pagos y entregas. Si no encuentras lo que
          buscas, con gusto te ayudamos directamente en tu sucursal más cercana.
        </p>
      </section>

      <section className="storefront-section storefront-faq__list">
        {FAQS.map((item, index) => {
          const isOpen = openIndex === index;
          const buttonId = `faq-trigger-${index}`;
          const panelId = `faq-panel-${index}`;
          return (
            <div className={`storefront-faq-item${isOpen ? " storefront-faq-item--open" : ""}`} key={item.question}>
              <h3 className="storefront-faq-item__heading">
                <button
                  type="button"
                  id={buttonId}
                  className="storefront-faq-item__trigger"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                >
                  <span>{item.question}</span>
                  <ChevronDown size={18} aria-hidden="true" className="storefront-faq-item__chevron" />
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                aria-hidden={!isOpen}
                className="storefront-faq-item__panel"
              >
                <p>{item.answer}</p>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
