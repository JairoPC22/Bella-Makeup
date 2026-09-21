import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, LayoutGrid, Search, Sparkles, X } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCategory = categories.find((c) => c.id === categoryId) ?? null;
  const hasFilters = Boolean(categoryId || search);

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
    <div className="storefront-catalog">
      <div className="storefront-page-header__band">
        <header className="storefront-page-header">
          <span className="storefront-page-header__eyebrow">
            <LayoutGrid size={13} aria-hidden="true" /> Catálogo
          </span>
          <h1>{activeCategory ? activeCategory.name : "Todo lo que necesitas para tu rutina."}</h1>
          <p>
            Maquillaje y cuidado de la piel seleccionados uno por uno. Filtra por categoría, agrega al
            carrito y elige si lo recoges en sucursal o te lo llevamos a casa.
          </p>
        </header>
      </div>

      <div className="storefront-section">
        {/* Filter bar as a single cohesive toolbar card with real category
            chips, replacing the previous bare <select> + input pair that
            read like a generic admin filter row dropped onto a shopfront. */}
        <div className="storefront-catalog__toolbar">
          <div className="storefront-catalog__chips" role="group" aria-label="Filtrar por categoría">
            <button
              type="button"
              className={`storefront-chip${categoryId === "" ? " storefront-chip--active" : ""}`}
              onClick={() => handleCategoryChange("")}
            >
              Todo
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`storefront-chip${categoryId === c.id ? " storefront-chip--active" : ""}`}
                onClick={() => handleCategoryChange(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <label className="storefront-catalog__search">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar productos..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Buscar productos"
            />
            {searchInput && (
              <button
                type="button"
                className="storefront-catalog__search-clear"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearchInput("")}
              >
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        {status === "ready" && (
          <div className="storefront-catalog__meta">
            <p>
              {total === 0
                ? "Sin resultados"
                : `${total} ${total === 1 ? "producto" : "productos"}`}
              {activeCategory && <> en <strong>{activeCategory.name}</strong></>}
              {search && <> para <strong>“{search}”</strong></>}
            </p>
            {hasFilters && (
              <button
                type="button"
                className="storefront-catalog__clear"
                onClick={() => {
                  setSearchInput("");
                  handleCategoryChange("");
                }}
              >
                <X size={13} aria-hidden="true" /> Limpiar filtros
              </button>
            )}
          </div>
        )}

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
              {products.map((product, index) => {
                const hasPromo = product.promoPrice != null && Number(product.promoPrice) < Number(product.price);
                const image = product.images[0];
                const hasVariants = product.variants.length > 0;
                const discount = hasPromo
                  ? Math.round((1 - Number(product.promoPrice) / Number(product.price)) * 100)
                  : 0;
                return (
                  <div
                    key={product.id}
                    className="storefront-product-card animate-in-stagger"
                    // Same per-item stagger convention as the admin
                    // dashboard's card grid — the grid assembles itself
                    // instead of appearing as one flat block.
                    style={{ "--stagger-delay": `${Math.min(index, 11) * 45}ms` } as React.CSSProperties}
                  >
                    <Link to={`/producto/${product.id}`} className="storefront-product-card__image">
                      <span className="storefront-product-card__badges">
                        {hasPromo && discount > 0 && (
                          <span className="storefront-badge storefront-badge--promo">-{discount}%</span>
                        )}
                        {!product.inStock && (
                          <span className="storefront-badge storefront-badge--out">Agotado</span>
                        )}
                      </span>
                      {image
                        ? <img src={buildPublicImageUrl(image.url)} alt={product.name} />
                        : <Sparkles size={30} aria-hidden="true" />}
                    </Link>
                    <div className="storefront-product-card__body">
                      <Link to={`/producto/${product.id}`} className="storefront-product-card__brand">
                        {product.brand?.name ?? " "}
                      </Link>
                      <Link to={`/producto/${product.id}`} className="storefront-product-card__name">
                        {product.name}
                      </Link>
                      <p className="storefront-product-card__price">
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
                      </p>
                    </div>
                    <div className="storefront-product-card__actions">
                      {hasVariants ? (
                        <Link to={`/producto/${product.id}`} className="storefront-add-btn storefront-add-btn--outline">
                          {product.inStock ? "Ver opciones" : "Ver detalle"}
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
    </div>
  );
}
