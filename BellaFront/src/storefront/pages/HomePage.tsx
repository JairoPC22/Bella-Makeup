import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Heart, LayoutGrid, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { RevealWords } from "../../components/common/RevealWords";
import { useRevealOnScroll } from "../../hooks/useRevealOnScroll";
import { listPublicCategories, listPublicProducts, buildPublicImageUrl } from "../../services/storefrontService";
import type { PublicCategory, PublicProduct } from "../../types/api";
import "./HomePage.css";
import { staggerStyle } from "../../utils/staggerStyle";

import { currencyFormatter } from "../../utils/currency";

type FetchStatus = "loading" | "ready" | "error";

export function HomePage() {
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [categoriesStatus, setCategoriesStatus] = useState<FetchStatus>("loading");

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [productsStatus, setProductsStatus] = useState<FetchStatus>("loading");

  useEffect(() => {
    listPublicCategories()
      .then((data) => { setCategories(data); setCategoriesStatus("ready"); })
      .catch(() => setCategoriesStatus("error"));

    listPublicProducts({ page: 1 })
      .then((data) => { setProducts(data.items); setProductsStatus("ready"); })
      .catch(() => setProductsStatus("error"));
  }, []);

  // Las secciones bajo el pliegue se revelan al hacer scroll (fade + subida),
  // a diferencia de .animate-in-stagger que ya terminó de reproducirse al montar.
  const categoriesReveal = useRevealOnScroll<HTMLElement>();
  const featuredReveal = useRevealOnScroll<HTMLElement>();

  return (
    <div className="storefront-home">
      <section className="storefront-hero">
        <div className="storefront-hero__arc storefront-hero__arc--a" aria-hidden="true" />
        <div className="storefront-hero__arc storefront-hero__arc--b" aria-hidden="true" />
        <div className="storefront-hero__grid" aria-hidden="true" />
        <div className="storefront-hero__inner">
          <div className="storefront-hero__copy">
            <span className="storefront-hero__eyebrow animate-in-stagger" style={staggerStyle(0)}>
              <span className="storefront-hero__eyebrow-line" aria-hidden="true" />
              <Sparkles size={13} aria-hidden="true" /> Tienda en línea
              <span className="storefront-hero__eyebrow-line" aria-hidden="true" />
            </span>
            <h1>
              {/* "Las palabras de inicio en el banner" — each word bounces
                  in on its own instead of the whole line just fading up as
                  one block. RevealWords is this app's own `motion`-based
                  equivalent of React Bits' AnimatedContent (GSAP wasn't
                  added as a second animation engine alongside `motion`,
                  which the app already uses for RubberSegment). The
                  accent word ("entrega") gets its own single reveal so it
                  keeps its distinct color treatment instead of being
                  split word-by-word like the rest of the line. */}
              <RevealWords text="Belleza que se nota," delay={110} />
              <br />
              <motion.em
                initial={{ opacity: 0, y: 22, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18, mass: 0.7, delay: 0.39 }}
                style={{ display: "inline-block" }}
              >
                entrega
              </motion.em>{" "}
              <RevealWords text="que se siente." delay={460} />
            </h1>
            <p className="animate-in-stagger" style={staggerStyle(220)}>
              Descubre nuestra selección de maquillaje y cuidado de la piel. Ordena en línea y recoge en tu
              sucursal más cercana o recíbelo a domicilio.
            </p>
            <Link to="/catalogo" className="storefront-hero__cta animate-in-stagger" style={staggerStyle(330)}>
              Ver catálogo <ArrowRight size={18} aria-hidden="true" />
            </Link>

            <div className="storefront-hero__trust animate-in-stagger" style={staggerStyle(420)}>
              <div className="storefront-hero__trust-item">
                <Truck size={18} aria-hidden="true" />
                <span>Envíos seguros y rápidos</span>
              </div>
              <div className="storefront-hero__trust-item">
                <ShieldCheck size={18} aria-hidden="true" />
                <span>Productos 100% originales</span>
              </div>
              <div className="storefront-hero__trust-item">
                <Heart size={18} aria-hidden="true" />
                <span>Tu belleza, nuestra prioridad</span>
              </div>
            </div>
          </div>
          <div className="storefront-hero__media">
            {/* FIFTH ATTEMPT — and this one actually worked, so read this
                before changing it again. Every previous cutout attempt
                keyed model-cutout.png FROM Hero-Ima1's own pixels (a
                photo shot on a light backdrop, edited to look
                transparent) or used a naive luminance feather on
                Hero-Ima2 — both left real artifacts (orange fringing, or
                a grey halo on dark hair) because a wide linear feather
                zone let background color bleed into semi-transparent
                edge pixels. This rebuild instead uses Hero-Ima2.jpeg
                (shot on a TRUE flat (0,0,0) black backdrop — verified by
                sampling) with a MUCH tighter threshold (background only
                below luminance 4, fully opaque above 16, a 12-level
                feather instead of the old 26-45-level one) — narrow
                enough that dark hair (sampled minimum ~30-45 per
                channel) never falls inside the ambiguous zone. Checked
                by compositing over the hero's actual navy tone and
                zooming into both the hairline and the wispy loose
                strands by the shoulder: clean in both places, no fringe,
                no halo. Trimmed to the subject's own bounding box
                (938x941, was a 1671-wide canvas with ~45% empty
                transparent space) same as every prior version, so
                object-fit: contain doesn't waste half the frame. WebP
                first, eager + high fetchPriority as the page's LCP
                image. */}
            <picture>
              {/* ?v=2 cache-busts a stale/failed load some browsers can get
                  stuck on from earlier in development (this exact file was
                  replaced several times at this same path) — without a
                  differing URL, a browser that already cached a 404 or a
                  broken response for this path has no reason to ever
                  re-request it, hard refresh or not. */}
              <source srcSet="/media/hero/model-cutout.webp?v=2" type="image/webp" />
              <img
                src="/media/hero/model-cutout.png?v=2"
                alt="Modelo con productos de belleza Bella Makeup"
                loading="eager"
                fetchPriority="high"
                width={938}
                height={941}
              />
            </picture>
          </div>
        </div>
      </section>

      <section
        ref={categoriesReveal.ref}
        className={`storefront-section reveal-on-scroll${categoriesReveal.inView ? " is-in-view" : ""}`}
      >
        <div className="storefront-section__header">
          <div className="storefront-section__heading">
            <p className="storefront-section__eyebrow">
              <LayoutGrid size={13} aria-hidden="true" /> Categorías
            </p>
            <h2><RevealWords as="span" text="Compra por categoría" inView stagger={55} /></h2>
            <p className="storefront-section__sub">
              Encuentra justo lo que buscas, desde maquillaje hasta cuidado de la piel.
            </p>
          </div>
          <Link to="/catalogo" className="storefront-section__link">
            Ver catálogo <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {categoriesStatus === "loading" && <StatusState kind="loading" />}
        {categoriesStatus === "error" && (
          <StatusState kind="error" message="No se pudieron cargar las categorías. Intenta más tarde." />
        )}
        {categoriesStatus === "ready" && categories.length === 0 && (
          <StatusState kind="empty" message="Aún no hay categorías disponibles." />
        )}
        {categoriesStatus === "ready" && categories.length > 0 && (
          <div className="storefront-category-strip">
            {categories.map((category, index) => (
              <Link
                key={category.id}
                to={`/catalogo?categoria=${category.id}`}
                className="storefront-category-card animate-in-stagger"
                style={staggerStyle(index * 70)}
              >
                <span className="storefront-category-card__label">
                  <span className="storefront-category-card__hint">Explorar</span>
                  <span className="storefront-category-card__name">{category.name}</span>
                </span>
                <span className="storefront-category-card__arrow">
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section
        ref={featuredReveal.ref}
        className={`storefront-section reveal-on-scroll${featuredReveal.inView ? " is-in-view" : ""}`}
      >
        <div className="storefront-section__header">
          <div className="storefront-section__heading">
            <p className="storefront-section__eyebrow">
              <Sparkles size={13} aria-hidden="true" /> Selección del mes
            </p>
            <h2><RevealWords as="span" text="Destacados" inView stagger={55} /></h2>
            <p className="storefront-section__sub">
              Lo que más nos piden y lo que más recomendamos, disponible para retiro o entrega.
            </p>
          </div>
          <Link to="/catalogo" className="storefront-section__link">
            Ver todo <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {productsStatus === "loading" && <StatusState kind="loading" />}
        {productsStatus === "error" && (
          <StatusState kind="error" message="No se pudieron cargar los productos destacados. Intenta más tarde." />
        )}
        {productsStatus === "ready" && products.length === 0 && (
          <StatusState kind="empty" message="Aún no hay productos publicados." />
        )}
        {productsStatus === "ready" && products.length > 0 && (
          <div className="storefront-product-grid">
            {products.slice(0, 8).map((product) => {
              const hasPromo = product.promoPrice != null && Number(product.promoPrice) < Number(product.price);
              const image = product.images[0];
              return (
                <Link key={product.id} to={`/producto/${product.id}`} className="storefront-product-card">
                  <span className="storefront-product-card__image">
                    <span className="storefront-product-card__badges">
                      {!product.inStock && (
                        <span className="storefront-badge storefront-badge--out">Agotado</span>
                      )}
                    </span>
                    {image
                      ? <img src={buildPublicImageUrl(image.url)} alt={product.name} loading="lazy" />
                      : <Sparkles size={30} aria-hidden="true" />}
                  </span>
                  <span className="storefront-product-card__body">
                    <span className="storefront-product-card__brand">{product.brand?.name ?? " "}</span>
                    <span className="storefront-product-card__name">{product.name}</span>
                    <span className="storefront-product-card__price">
                      {hasPromo ? (
                        <>
                          <span className="storefront-product-card__price--promo">
                            {currencyFormatter.format(Number(product.promoPrice))}
                          </span>
                          <span className="storefront-product-card__price--strike">
                            {currencyFormatter.format(Number(product.price))}
                          </span>
                        </>
                      ) : (
                        currencyFormatter.format(Number(product.price))
                      )}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
