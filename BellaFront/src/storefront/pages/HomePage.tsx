import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, HeartHandshake, ShieldCheck, Sparkles, Store, Truck } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { listPublicCategories, listPublicProducts, buildPublicImageUrl } from "../../services/storefrontService";
import type { PublicCategory, PublicProduct } from "../../types/api";
import "./HomePage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

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

  return (
    <div className="storefront-home">
      <section className="storefront-hero">
        <div className="storefront-hero__grid" aria-hidden="true" />
        <div className="storefront-hero__inner">
          <div className="storefront-hero__copy">
            <span className="storefront-hero__eyebrow">
              <Sparkles size={14} aria-hidden="true" /> Tienda en línea
            </span>
            <h1>Belleza que se nota, entrega que se siente.</h1>
            <p>
              Descubre nuestra selección de maquillaje y cuidado de la piel. Ordena en línea y recoge en tu
              sucursal más cercana o recíbelo a domicilio.
            </p>
            <Link to="/tienda/catalogo" className="storefront-hero__cta">
              Ver catálogo <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="storefront-hero__media">
            <img src="/media/hero/Hero-Ima2.jpeg" alt="Modelo con productos de belleza Bella Makeup" />
          </div>
        </div>
      </section>

      <section className="storefront-trust-strip" aria-label="Beneficios de comprar con Bella Makeup">
        <div className="storefront-trust-strip__inner">
          <div className="storefront-trust-item">
            <span className="storefront-trust-item__icon"><Store size={16} aria-hidden="true" /></span>
            Retiro gratis en sucursal
          </div>
          <div className="storefront-trust-item">
            <span className="storefront-trust-item__icon"><ShieldCheck size={16} aria-hidden="true" /></span>
            Productos 100% originales
          </div>
          <div className="storefront-trust-item">
            <span className="storefront-trust-item__icon"><HeartHandshake size={16} aria-hidden="true" /></span>
            Asesoría experta y cercana
          </div>
          <div className="storefront-trust-item">
            <span className="storefront-trust-item__icon"><Truck size={16} aria-hidden="true" /></span>
            Entrega a domicilio
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
                to={`/tienda/catalogo?categoria=${category.id}`}
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
          <Link to="/tienda/catalogo" className="storefront-section__link">
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
                <Link key={product.id} to={`/tienda/producto/${product.id}`} className="storefront-product-card">
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
