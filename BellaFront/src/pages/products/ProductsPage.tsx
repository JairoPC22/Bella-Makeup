import { useCallback, useEffect, useState } from "react";
import { Package, Plus, Pencil, Power, Search, ImageOff } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Badge } from "../../components/common/Badge";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { ApiError } from "../../services/apiClient";
import * as productService from "../../services/productService";
import * as categoryService from "../../services/categoryService";
import * as brandService from "../../services/brandService";
import type { Brand, Category, Product } from "../../types/api";
import { ProductFormModal } from "./ProductFormModal";
import "./ProductsPage.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type FetchStatus = "loading" | "ready" | "error";

export function ProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [actionError, setActionError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [statusFilter, setStatusFilter] = useState<Product["status"] | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => {});
    brandService.listBrands().then(setBrands).catch(() => {});
  }, []);

  // Server-side search (listProductsQuerySchema supports it) is debounced
  // rather than fired on every keystroke — the other filters (category,
  // brand, status) are discrete <select> changes and don't need debouncing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadProducts = useCallback(() => {
    setStatus("loading");
    productService
      .listProducts({
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      .then((p) => { setProducts(p); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [categoryId, brandId, statusFilter, search]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function upsertProduct(product: Product) {
    setProducts((prev) => {
      if (!prev) return [product];
      const exists = prev.some((p) => p.id === product.id);
      return exists ? prev.map((p) => (p.id === product.id ? product : p)) : [product, ...prev];
    });
  }

  async function toggleStatus(product: Product) {
    setActionError(null);
    try {
      const updated = await productService.updateProductStatus(product.id, product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      upsertProduct(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo actualizar el estado del producto.");
    }
  }

  function primaryImageUrl(product: Product): string | null {
    const primary = product.images.find((img) => img.isPrimary) ?? product.images[0];
    return primary ? productService.buildProductImageUrl(primary.url) : null;
  }

  return (
    <div className="products-page">
      <div className="products-page__header">
        <div className="products-page__title">
          <Package size={22} />
          <h1>Productos</h1>
        </div>
        <PermissionGate code="products.create">
          <button onClick={() => { setEditingProduct(undefined); setModalOpen(true); }}>
            <Plus size={16} /> Nuevo producto
          </button>
        </PermissionGate>
      </div>

      {actionError && <p className="products-page__error">{actionError}</p>}

      <div className="products-filters">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">Todas las marcas</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Product["status"] | "")}>
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activo</option>
          <option value="INACTIVE">Inactivo</option>
        </select>
        <label className="products-filters__search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudieron cargar los productos." />}
      {status === "ready" && (products?.length ?? 0) === 0 && (
        <StatusState kind="empty" message="No hay productos que coincidan con estos filtros." />
      )}

      {status === "ready" && products && products.length > 0 && (
        <table className="products-table">
          <thead>
            <tr>
              <th></th>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Marca</th>
              <th>Precio</th>
              <th>Variantes</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const imageUrl = primaryImageUrl(p);
              return (
                <tr key={p.id}>
                  <td>
                    <div className="products-table__thumb">
                      {imageUrl ? <img src={imageUrl} alt="" /> : <ImageOff size={18} />}
                    </div>
                  </td>
                  <td>
                    <p className="products-table__name">{p.name}</p>
                    <p className="products-table__sku">{p.sku}</p>
                  </td>
                  <td>{p.category?.name ?? "—"}</td>
                  <td>{p.brand?.name ?? "—"}</td>
                  <td>{currencyFormatter.format(Number(p.price))}</td>
                  <td>{p.variants.length > 0 ? <Badge tone="neutral">{p.variants.length}</Badge> : "—"}</td>
                  <td><Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{p.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge></td>
                  <td>
                    <div className="products-table__actions">
                      <PermissionGate code="products.edit">
                        <button onClick={() => { setEditingProduct(p); setModalOpen(true); }} aria-label="Editar producto" title="Editar">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => toggleStatus(p)} aria-label="Cambiar estado" title={p.status === "ACTIVE" ? "Desactivar" : "Activar"}>
                          <Power size={16} />
                        </button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <ProductFormModal
        key={editingProduct?.id ?? "new"}
        open={modalOpen}
        onClose={() => { setModalOpen(false); loadProducts(); }}
        onSaved={upsertProduct}
        categories={categories}
        brands={brands}
        editingProduct={editingProduct}
      />
    </div>
  );
}
