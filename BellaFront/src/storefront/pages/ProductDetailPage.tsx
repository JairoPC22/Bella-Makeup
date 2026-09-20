import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Minus, Plus, Sparkles, Store } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { getPublicProduct, buildPublicImageUrl } from "../../services/storefrontService";
import type { PublicProduct, PublicProductVariant } from "../../types/api";
import { useCart } from "../CartContext";
import "./ProductDetailPage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type FetchStatus = "loading" | "ready" | "error";

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");

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
    getPublicProduct(id)
      .then((data) => { setProduct(data); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [id]);

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

  const basePrice = Number(product.price);
  const promo = product.promoPrice != null ? Number(product.promoPrice) : null;
  const hasPromo = promo != null && promo < basePrice;
  const variantPrice = selectedVariant?.price != null ? Number(selectedVariant.price) : null;
  const displayPrice = variantPrice ?? (hasPromo ? promo! : basePrice);

  const galleryImages = product.images.length > 0 ? product.images : [];
  const activeImage = galleryImages[activeImageIndex];
  const displayImageUrl = selectedVariant?.imageUrl
    ? buildPublicImageUrl(selectedVariant.imageUrl)
    : activeImage
      ? buildPublicImageUrl(activeImage.url)
      : null;

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
    setTimeout(() => setJustAdded(false), 2000);
  }

  return (
    <div className="storefront-section storefront-detail">
      <p className="storefront-detail__back-link">
        <Link to="/catalogo">
          <ChevronLeft size={16} aria-hidden="true" /> Volver al catálogo
        </Link>
      </p>

      <div className="storefront-detail__layout">
        <div className="storefront-detail__gallery">
          <div className="storefront-detail__main-image">
            {/* `key` forces React to remount this node whenever the shown
                image changes (thumbnail click OR variant swap), which
                restarts the CSS entrance animation below each time — a
                cheap, dependency-free crossfade without a transition
                library ("que se vean bien en galería con animación"). */}
            <div className="storefront-detail__main-image-inner" key={displayImageUrl ?? "placeholder"}>
              {displayImageUrl ? (
                <img src={displayImageUrl} alt={product.name} />
              ) : (
                <Sparkles size={32} aria-hidden="true" />
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
                >
                  <img src={buildPublicImageUrl(img.url)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="storefront-detail__info">
          {product.brand && <p className="storefront-detail__brand">{product.brand.name}</p>}
          <h1>{product.name}</h1>
          {product.category && <p className="storefront-detail__category">{product.category.name}</p>}

          <p className="storefront-detail__price">
            {hasPromo && variantPrice == null && (
              <span className="storefront-detail__price-strike">{currencyFormatter.format(basePrice)}</span>
            )}
            <span className={hasPromo && variantPrice == null ? "storefront-detail__price-promo" : undefined}>
              {currencyFormatter.format(displayPrice)}
            </span>
          </p>

          {product.description && <p className="storefront-detail__description">{product.description}</p>}

          {hasVariants && (
            <div className="storefront-detail__variants">
              <p className="storefront-detail__variants-label">Elige una opción</p>
              <div className="storefront-detail__variant-pills">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={!variant.inStock}
                    className={`storefront-detail__variant-pill${selectedVariant?.id === variant.id ? " is-active" : ""}`}
                    onClick={() => setSelectedVariant(variant)}
                  >
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
              {!effectiveInStock ? "Agotado" : hasVariants && !selectedVariant ? "Elige una opción" : "Agregar al carrito"}
            </button>
          </div>

          {justAdded && (
            <p className="storefront-detail__added">
              Producto agregado al carrito. <button type="button" onClick={openCart}>Ver carrito</button>
            </p>
          )}

          <p className="storefront-detail__trust">
            <Store size={16} aria-hidden="true" /> Retiro en tienda disponible
          </p>
        </div>
      </div>
    </div>
  );
}
