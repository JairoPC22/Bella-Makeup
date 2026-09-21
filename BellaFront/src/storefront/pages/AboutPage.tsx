import { Link } from "react-router-dom";
import { ArrowRight, Gem, HandHeart, MapPinned, Sparkles, Tag, Users } from "lucide-react";
import "./AboutPage.css";

const VALUES = [
  {
    icon: Gem,
    title: "Calidad",
    desc: "Seleccionamos cada marca y cada producto con criterio: fórmulas confiables, resultados reales y nada que no nos convenza a nosotras mismas primero.",
  },
  {
    icon: HandHeart,
    title: "Cercanía",
    desc: "Somos el tipo de tienda donde te conocen por tu nombre. Esa calidez de sucursal es la que queremos que sientas también al comprar en línea.",
  },
  {
    icon: Users,
    title: "Asesoría experta",
    desc: "Nuestro equipo se capacita constantemente para recomendarte lo que realmente funciona para tu piel, tu tono y tu rutina — no solo lo que se vende más.",
  },
  {
    icon: Tag,
    title: "Precios justos",
    desc: "Belleza de calidad no debería sentirse inalcanzable. Cuidamos nuestros precios para que volver por más nunca sea la parte difícil.",
  },
];

export function AboutPage() {
  return (
    <div className="storefront-about">
      <div className="storefront-page-header__band">
        <header className="storefront-page-header">
          <span className="storefront-page-header__eyebrow">
            <Sparkles size={13} aria-hidden="true" /> Sobre nosotros
          </span>
          <h1>Belleza que se siente tan bien como se ve.</h1>
          <p>
            Bella Makeup nació de una idea simple: el maquillaje y el cuidado de la piel deberían sentirse
            accesibles, personales y de verdad efectivos. Hoy seguimos esa misma idea todos los días, en cada
            sucursal y ahora también aquí, en línea.
          </p>
        </header>
      </div>

      <section className="storefront-section storefront-about__story">
        <div className="storefront-about__story-text">
          <h2>Nuestra historia</h2>
          <p>
            Empezamos como una tienda de barrio enfocada en un solo objetivo: ayudar a cada clienta a encontrar
            el producto correcto, no simplemente venderle uno más. Con el tiempo, esa forma de trabajar nos
            llevó a abrir nuevas sucursales, sumar más marcas de maquillaje y cuidado de la piel, y construir un
            equipo que realmente disfruta hablar de belleza contigo.
          </p>
          <p>
            Esta tienda en línea es la extensión natural de ese mismo trabajo: la misma curaduría de producto,
            la misma actitud de asesoría antes que venta, ahora disponible desde donde estés — con la opción de
            recoger en tu sucursal favorita o recibirlo directamente en tu domicilio.
          </p>
          <Link to="/catalogo" className="storefront-about__story-link">
            Explorar el catálogo <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="storefront-about__story-media">
          <img src="/media/hero/Hero-Ima1.jpeg" alt="Modelo con productos de cuidado de la piel Bella Makeup" />
        </div>
      </section>

      <section className="storefront-section">
        <div className="storefront-section__header">
          <div className="storefront-section__heading">
            <p className="storefront-section__eyebrow">
              <Gem size={13} aria-hidden="true" /> Lo que nos mueve
            </p>
            <h2>Nuestros valores</h2>
            <p className="storefront-section__sub">
              Cuatro principios que se notan igual en sucursal que en cada pedido en línea.
            </p>
          </div>
        </div>
        <div className="storefront-about__values">
          {VALUES.map((value) => {
            const Icon = value.icon;
            return (
              <div className="storefront-about__value-card" key={value.title}>
                <span className="storefront-about__value-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3>{value.title}</h3>
                <p>{value.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="storefront-about__branches">
        <div className="storefront-about__branches-inner">
          <span className="storefront-about__branches-icon">
            <MapPinned size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>En sucursal y en línea, la misma experiencia</h2>
            <p>
              Todo lo que encuentras aquí también vive en nuestras sucursales físicas — y lo que ves en
              sucursal, poco a poco lo vamos sumando a este catálogo. Compra como prefieras: recorre los
              pasillos o navega desde tu celular, el mismo cuidado te espera en ambos lugares.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
