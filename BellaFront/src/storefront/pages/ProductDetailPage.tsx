import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { getPublicProduct, listPublicProducts, buildPublicImageUrl } from "../../services/storefrontService";
import type { PublicProduct, PublicProductVariant } from "../../types/api";
import { useCart } from "../CartContext";
import "./ProductDetailPage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type FetchStatus = "loading" | "ready" | "error";

const TRUST_POINTS = [
  { icon: Store, title: "Retiro gratis en sucursal", desc: "Listo el mismo día en la mayoría de los casos." },
  { icon: Truck, title: "Entrega a domicilio", desc: "De 1 a 3 días hábiles según cobertura." },
  { icon: ShieldCheck, title: "100% original", desc: "Producto sellado, directo de nuestras sucursales." },
  { icon: CreditCard, title: "Paga al recibir", desc: "Efectivo, tarjeta o transferencia al entregarlo." },
];

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [related, setRelated] = useState<PublicProduct[]>([]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<PublicProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const { addItem, openCart } = useCart();

  useEffect(() => {
    if (!id) return;
    setStatus("loading");
    setActiveImageIndex(0);
    setSelectedVariant(null);
    setQuantity(1);
    setRelated([]);
    window.scrollTo({ top: 0 });
    getPublicProduct(id)
      .then((data) => { setProduct(data); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [id]);

  // "Más de esta categoría" — a second, dependent read that must not be
  // able to break the page: any failure just leaves the rail unrendered.
  useEffect(() => {
    if (!product?.category) return;
    let cancelled = false;
    listPublicProducts({ categoryId: product.category.id, page: 1 })
      .then((res) => {
        if (cancelled) return;
        setRelated(res.items.filter((p) => p.id !== product.id).slice(0, 4));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product]);

  if (status === "loading") {
    return (
      <div className="storefront-section">
        <StatusState kind="loading" />
      </div>
    );
  }

  if (status === "error" || !product) {
    return (
      <div className="storefront-section">
        <StatusState kind="error" message="No se pudo cargar este producto. Puede que ya no esté disponible." />
        <p className="storefront-detail__back-link">
          <Link to="/catalogo">
            <ChevronLeft size={16} aria-hidden="true" /> Volver al catálogo
          </Link>
        </p>
      </div>
    );
  }

  const hasVariants = product.variants.length > 0;
  const effectiveInStock = hasVariants ? (selectedVariant?.inStock ?? false) : product.inStock;
  const canAdd = hasVariants ? selectedVariant != null && effectiveInStock : effectiveInStock;
  // Whether the PRODUCT as a whole can still be bought, independent of
  // whether a variant happens to be selected yet. Without this, a product
  // with in-stock variants showed a hard "Agotado" label (and an
  // availability pill reading "Agotado") purely because nothing had been
  // clicked yet — actively telling a shopper a purchasable product was
  // sold out.
  const anyVariantInStock = hasVariants ? product.variants.some((v) => v.inStock) : product.inStock;

  const basePrice = Number(product.price);
  const promo = product.promoPrice != null ? Number(product.promoPrice) : null;
  const hasPromo = promo != null && promo < basePrice;
  const variantPrice = selectedVariant?.price != null ? Number(selectedVariant.price) : null;
  const displayPrice = variantPrice ?? (hasPromo ? promo! : basePrice);
  const showPromoTreatment = hasPromo && variantPrice == null;
  const discount = showPromoTreatment ? Math.round((1 - promo! / basePrice) * 100) : 0;

  const galleryImages = product.images.length > 0 ? product.images : [];
  const activeImage = galleryImages[activeImageIndex];
  const displayImageUrl = selectedVariant?.imageUrl
    ? buildPublicImageUrl(selectedVariant.imageUrl)
    : activeImage
      ? buildPublicImageUrl(activeImage.url)
      : null;

  // The add-to-cart label, resolved in the order a shopper actually
  // experiences it: pick an option first, then stock, then the happy path.
  const ctaLabel = !anyVariantInStock
    ? "Agotado"
    : hasVariants && !selectedVariant
      ? "Elige una opción"
      : !effectiveInStock
        ? "Opción agotada"
        : "Agregar al carrito";

  function handleAdd() {
    if (!product || !canAdd) return;
    addItem(
      {
        productId: product.id,
        variantId: selectedVariant?.id,
        name: selectedVariant ? `${product.name} — ${selectedVariant.name}` : product.name,
        sku: selectedVariant?.sku ?? product.sku,
        unitPrice: displayPrice,
        imageUrl: displayImageUrl,
      },
      quantity
    );
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2600);
  }

  return (
    <div className="storefront-detail">
      <div className="storefront-section storefront-section--tight">
        <nav className="storefront-detail__crumbs" aria-label="Ruta de navegación">
          <Link to="/">Inicio</Link>
          <ChevronRight size={13} aria-hidden="true" />
          <Link to="/catalogo">Catálogo</Link>
          {product.category && (
            <>
              <ChevronRight size={13} aria-hidden="true" />
              <Link to={`/catalogo?categoria=${product.category.id}`}>{product.category.name}</Link>
            </>
          )}
          <ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page">{product.name}</span>
        </nav>

        <div className="storefront-detail__layout">
          <div className="storefront-detail__gallery">
            <div className="storefront-detail__main-image">
              {showPromoTreatment && discount > 0 && (
                <span className="storefront-badge storefront-badge--promo storefront-detail__main-badge">
                  -{discount}%
                </span>
              )}
              {/* `key` forces React to remount this node whenever the shown
                  image changes (thumbnail click OR variant swap), which
                  restarts the CSS entrance animation below each time — a
                  cheap, dependency-free crossfade without a transition
                  library ("que se vean bien en galería con animación"). */}
              <div className="storefront-detail__main-image-inner" key={displayImageUrl ?? "placeholder"}>
                {displayImageUrl ? (
                  <img src={displayImageUrl} alt={product.name} />
                ) : (
                  <span className="storefront-detail__placeholder">
                    <Sparkles size={34} aria-hidden="true" />
                    <span>Imagen próximamente</span>
                  </span>
                )}
              </div>
            </div>
            {galleryImages.length > 1 && (
              <div className="storefront-detail__thumbs">
                {galleryImages.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    className={`storefront-detail__thumb${i === activeImageIndex ? " is-active" : ""}`}
                    onClick={() => setActiveImageIndex(i)}
                    aria-label={`Ver imagen ${i + 1}`}
                  >
                    <img src={buildPublicImageUrl(img.url)} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="storefront-detail__info">
            <div className="storefront-detail__headline">
              {product.brand && <p className="storefront-detail__brand">{product.brand.name}</p>}
              <h1>{product.name}</h1>
              <div className="storefront-detail__meta">
                {product.category && (
                  <Link to={`/catalogo?categoria=${product.category.id}`} className="storefront-detail__category">
                    {product.category.name}
                  </Link>
                )}
                <span className="storefront-detail__sku">SKU {selectedVariant?.sku ?? product.sku}</span>
              </div>
            </div>

            {/* Price treated as its own panel rather than a loose line of
                text — promo, saving and availability read together. */}
            <div className="storefront-detail__price-panel">
              <p className="storefront-detail__price">
                <span className={showPromoTreatment ? "storefront-detail__price-promo" : undefined}>
                  {currencyFormatter.format(displayPrice)}
                </span>
                {showPromoTreatment && (
                  <span className="storefront-detail__price-strike">{currencyFormatter.format(basePrice)}</span>
                )}
              </p>
              <div className="storefront-detail__price-tags">
                {showPromoTreatment && (
                  <span className="storefront-badge storefront-badge--promo">
                    Ahorras {currencyFormatter.format(basePrice - promo!)}
                  </span>
                )}
                <span
                  className={`storefront-detail__stock${anyVariantInStock ? "" : " storefront-detail__stock--out"}`}
                >
                  <span className="storefront-detail__stock-dot" aria-hidden="true" />
                  {anyVariantInStock ? "Disponible" : "Agotado"}
                </span>
              </div>
            </div>

            {product.description && <p className="storefront-detail__description">{product.description}</p>}

            {hasVariants && (
              <div className="storefront-detail__variants">
                <p className="storefront-detail__variants-label">
                  Elige una opción
                  {selectedVariant && <strong>{selectedVariant.name}</strong>}
                </p>
                <div className="storefront-detail__variant-pills">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={!variant.inStock}
                      className={`storefront-detail__variant-pill${selectedVariant?.id === variant.id ? " is-active" : ""}`}
                      onClick={() => setSelectedVariant(variant)}
                    >
                      {selectedVariant?.id === variant.id && <Check size={13} aria-hidden="true" />}
                      {variant.name}
                      {!variant.inStock && <span className="storefront-detail__variant-pill-tag">Agotado</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="storefront-detail__actions">
              <div className="storefront-detail__stepper">
                <button type="button" aria-label="Disminuir cantidad" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  <Minus size={14} />
                </button>
                <span>{quantity}</span>
                <button type="button" aria-label="Aumentar cantidad" onClick={() => setQuantity((q) => q + 1)}>
                  <Plus size={14} />
                </button>
              </div>
              <button type="button" className="storefront-primary-btn" disabled={!canAdd} onClick={handleAdd}>
                {ctaLabel}
              </button>
            </div>

            {justAdded && (
              <p className="storefront-detail__added" role="status">
                <Check size={15} aria-hidden="true" />
                Agregado al carrito.
                <button type="button" onClick={openCart}>Ver carrito</button>
              </p>
            )}

            <ul className="storefront-detail__trust">
              {TRUST_POINTS.map((point) => {
                const Icon = point.icon;
                return (
                  <li key={point.title}>
                    <span className="storefront-detail__trust-icon"><Icon size={16} aria-hidden="true" /></span>
                    <span className="storefront-detail__trust-text">
                      <strong>{point.title}</strong>
                      <span>{point.desc}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Two is the minimum that reads as a rail — a lone card stranded in
          a four-column grid looks like a rendering fault, not a
          recommendation. */}
      {related.length >= 2 && (
        <section className="storefront-band">
          <div className="storefront-section">
            <div className="storefront-section__header">
              <div className="storefront-section__heading">
                <p className="storefront-section__eyebrow">
                  <Package size={13} aria-hidden="true" /> También te puede gustar
                </p>
                <h2>Más de {product.category?.name}</h2>
              </div>
              <Link to={`/catalogo?categoria=${product.category?.id ?? ""}`} className="storefront-section__link">
                Ver categoría <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <div className="storefront-product-grid">
              {related.map((item) => {
                const itemPromo = item.promoPrice != null && Number(item.promoPrice) < Number(item.price);
                const itemImage = item.images[0];
                return (
                  <Link key={item.id} to={`/producto/${item.id}`} className="storefront-product-card">
                    <span className="storefront-product-card__image">
                      {itemImage
                        ? <img src={buildPublicImageUrl(itemImage.url)} alt={item.name} />
                        : <Sparkles size={30} aria-hidden="true" />}
                    </span>
                    <span className="storefront-product-card__body">
                      <span className="storefront-product-card__brand">{item.brand?.name ?? " "}</span>
                      <span className="storefront-product-card__name">{item.name}</span>
                      <span className="storefront-product-card__price">
                        {itemPromo ? (
                          <>
                            <span className="storefront-product-card__price--promo">
                              {currencyFormatter.format(Number(item.promoPrice))}
                            </span>
                            <span className="storefront-product-card__price--strike">
                              {currencyFormatter.format(Number(item.price))}
                            </span>
                          </>
                        ) : (
                          currencyFormatter.format(Number(item.price))
                        )}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
