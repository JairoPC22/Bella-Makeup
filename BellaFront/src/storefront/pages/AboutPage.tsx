import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gem, HandHeart, MapPinned, Sparkles, Tag, Users } from "lucide-react";
import { useRevealOnScroll } from "../../hooks/useRevealOnScroll";
import { RevealWords } from "../../components/common/RevealWords";
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
  const storyReveal = useRevealOnScroll<HTMLElement>();
  const valuesReveal = useRevealOnScroll<HTMLElement>();
  const branchesReveal = useRevealOnScroll<HTMLElement>();

  return (
    <div className="storefront-about">
      <div className="storefront-page-header__band">
        <header className="storefront-page-header">
          <span className="storefront-page-header__eyebrow">
            <Sparkles size={13} aria-hidden="true" /> Sobre nosotros
          </span>
          <h1><RevealWords as="span" text="Belleza que se siente tan bien como se ve." delay={80} /></h1>
          <p>
            Bella Makeup nació de una idea simple: el maquillaje y el cuidado de la piel deberían sentirse
            accesibles, personales y de verdad efectivos. Hoy seguimos esa misma idea todos los días, en cada
            sucursal y ahora también aquí, en línea.
          </p>
        </header>
      </div>

      <section
        ref={storyReveal.ref}
        className={`storefront-section storefront-about__story reveal-on-scroll${storyReveal.inView ? " is-in-view" : ""}`}
      >
        <div className="storefront-about__story-text">
          <h2><RevealWords as="span" text="Nuestra historia" inView stagger={55} /></h2>
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
          {/* Real bug fixed here: this used the WIDE, uncropped original
              (Hero-Ima1.jpeg, 1672x941, subject living only in the right
              ~55%) forced into a tall 4:5 portrait tile via object-fit:
              cover with no object-position set — cover crops around the
              CENTER of the source by default, which for this photo is
              mostly empty backdrop, cutting off most of the model
              entirely. Swapped to the same subject-cropped photo the
              homepage hero already uses (hero-photo.jpg/.webp — a pure
              crop of the same source, not a re-edit), which is centered
              on her instead of on empty background. */}
          <picture>
            <source srcSet="/media/hero/hero-photo.webp" type="image/webp" />
            <img
              src="/media/hero/hero-photo.jpg"
              alt="Modelo con productos de cuidado de la piel Bella Makeup"
              loading="lazy"
              width={936}
              height={941}
            />
          </picture>
        </div>
      </section>

      <section
        ref={valuesReveal.ref}
        className={`storefront-section reveal-on-scroll${valuesReveal.inView ? " is-in-view" : ""}`}
      >
        <div className="storefront-section__header">
          <div className="storefront-section__heading">
            <p className="storefront-section__eyebrow">
              <Gem size={13} aria-hidden="true" /> Lo que nos mueve
            </p>
            <h2><RevealWords as="span" text="Nuestros valores" inView stagger={55} /></h2>
            <p className="storefront-section__sub">
              Cuatro principios que se notan igual en sucursal que en cada pedido en línea.
            </p>
          </div>
        </div>
        <div className="storefront-about__values">
          {VALUES.map((value, i) => {
            const Icon = value.icon;
            return (
              <div
                className="storefront-about__value-card"
                key={value.title}
                style={{ transitionDelay: `${i * 90}ms` } as CSSProperties}
              >
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

      <section
        ref={branchesReveal.ref}
        className={`storefront-about__branches reveal-on-scroll${branchesReveal.inView ? " is-in-view" : ""}`}
      >
        <div className="storefront-about__branches-inner">
          <span className="storefront-about__branches-icon">
            <MapPinned size={22} aria-hidden="true" />
          </span>
          <div>
            <h2><RevealWords as="span" text="En sucursal y en línea, la misma experiencia" inView stagger={45} /></h2>
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
