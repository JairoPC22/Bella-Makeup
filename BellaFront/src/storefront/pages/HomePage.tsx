import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Heart, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { listPublicCategories, listPublicProducts, buildPublicImageUrl } from "../../services/storefrontService";
import type { PublicCategory, PublicProduct } from "../../types/api";
import "./HomePage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type FetchStatus = "loading" | "ready" | "error";

// Mirrors DashboardPage.tsx's own staggerStyle() helper exactly — the
// `--stagger-delay` custom property (consumed by .animate-in-stagger in
// global.css) isn't part of csstype's CSSProperties, so it needs the same
// `unknown` escape hatch. Used here so the hero's opening copy visibly
// reveals line-by-line ("que aparezca con animación al inicio") instead of
// fading in as a single flat block.
function staggerStyle(ms: number): CSSProperties {
  return { "--stagger-delay": `${ms}ms` } as unknown as CSSProperties;
}

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
            <h1 className="animate-in-stagger" style={staggerStyle(110)}>
              Belleza que se nota,
              <br />
              <em>entrega</em> que se siente.
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
            <img src="/media/hero/model-cutout.png" alt="Modelo con productos de belleza Bella Makeup" />
          </div>
        </div>
      </section>

      <section className="storefront-section">
        <div className="storefront-section__header">
          <h2>Compra por categoría</h2>
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
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/catalogo?categoria=${category.id}`}
                className="storefront-category-card"
              >
                <span>{category.name}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="storefront-section">
        <div className="storefront-section__header">
          <h2>Destacados</h2>
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
                  <div className="storefront-product-card__image">
                    {image ? <img src={buildPublicImageUrl(image.url)} alt={product.name} /> : <Sparkles size={22} aria-hidden="true" />}
                  </div>
                  <p className="storefront-product-card__brand">{product.brand?.name ?? " "}</p>
                  <p className="storefront-product-card__name">{product.name}</p>
                  <p className="storefront-product-card__price">
                    {hasPromo ? (
                      <>
                        <span className="storefront-product-card__price--strike">
                          {currencyFormatter.format(Number(product.price))}
                        </span>
                        <span className="storefront-product-card__price--promo">
                          {currencyFormatter.format(Number(product.promoPrice))}
                        </span>
                      </>
                    ) : (
                      currencyFormatter.format(Number(product.price))
                    )}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
