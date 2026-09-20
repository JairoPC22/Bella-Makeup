import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search, Sparkles } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { listPublicCategories, listPublicProducts, buildPublicImageUrl } from "../../services/storefrontService";
import type { PublicCategory, PublicProduct } from "../../types/api";
import { useCart } from "../CartContext";
import "./CatalogPage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type FetchStatus = "loading" | "ready" | "error";

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = searchParams.get("categoria") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const [status, setStatus] = useState<FetchStatus>("loading");

  const { addItem } = useCart();

  useEffect(() => {
    listPublicCategories().then(setCategories).catch(() => {});
  }, []);

  // Same 350ms debounce convention as the admin ProductsPage.tsx search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (searchInput.trim()) next.set("q", searchInput.trim());
        else next.delete("q");
        next.delete("page");
        return next;
      }, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const loadProducts = useCallback(() => {
    setStatus("loading");
    listPublicProducts({ categoryId: categoryId || undefined, search: search || undefined, page })
      .then((res) => {
        setProducts(res.items);
        setTotal(res.total);
        setPageSize(res.pageSize || 12);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [categoryId, search, page]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function handleCategoryChange(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("categoria", value);
      else next.delete("categoria");
      next.delete("page");
      return next;
    });
  }

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage > 1) next.set("page", String(nextPage));
      else next.delete("page");
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handleAdd(product: PublicProduct) {
    const image = product.images[0];
    addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitPrice: product.promoPrice != null && Number(product.promoPrice) < Number(product.price)
        ? Number(product.promoPrice)
        : Number(product.price),
      imageUrl: image ? buildPublicImageUrl(image.url) : null,
    });
  }

  return (
    <div className="storefront-catalog storefront-section">
      <div className="storefront-section__header">
        <h2>Catálogo</h2>
      </div>

      <div className="storefront-catalog__filters">
        <Select value={categoryId} onChange={(e) => handleCategoryChange(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <label className="storefront-catalog__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && (
        <StatusState kind="error" message="No se pudo cargar el catálogo. Intenta de nuevo más tarde." />
      )}
      {status === "ready" && products.length === 0 && (
        <StatusState kind="empty" message="No hay productos que coincidan con tu búsqueda." />
      )}

      {status === "ready" && products.length > 0 && (
        <>
          <div className="storefront-product-grid">
            {products.map((product) => {
              const hasPromo = product.promoPrice != null && Number(product.promoPrice) < Number(product.price);
              const image = product.images[0];
              const hasVariants = product.variants.length > 0;
              return (
                <div key={product.id} className="storefront-product-card">
                  <Link to={`/tienda/producto/${product.id}`} className="storefront-product-card__image">
                    {image ? <img src={buildPublicImageUrl(image.url)} alt={product.name} /> : <Sparkles size={22} aria-hidden="true" />}
                  </Link>
                  <Link to={`/tienda/producto/${product.id}`} className="storefront-product-card__brand">
                    {product.brand?.name ?? " "}
                  </Link>
                  <Link to={`/tienda/producto/${product.id}`} className="storefront-product-card__name">
                    {product.name}
                  </Link>
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
                  <div className="storefront-product-card__actions">
                    {hasVariants ? (
                      <Link to={`/tienda/producto/${product.id}`} className="storefront-add-btn storefront-add-btn--outline">
                        Ver opciones
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="storefront-add-btn"
                        disabled={!product.inStock}
                        onClick={() => handleAdd(product)}
                      >
                        {product.inStock ? "Agregar al carrito" : "Agotado"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="storefront-pagination">
              <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)} aria-label="Página anterior">
                <ChevronLeft size={16} />
              </button>
              <span>Página {page} de {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)} aria-label="Página siguiente">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
