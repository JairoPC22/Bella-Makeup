import { type FormEvent, useState } from "react";
import { Plus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ImageUploader } from "../../components/common/ImageUploader";
import { ApiError } from "../../services/apiClient";
import * as productService from "../../services/productService";
import type { Brand, Category, Product } from "../../types/api";

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (product: Product) => void;
  categories: Category[];
  brands: Brand[];
  editingProduct?: Product;
}

interface VariantRow {
  key: string;
  name: string;
  sku: string;
  barcode: string;
  price: string;
  minStock: string;
  maxStock: string;
}

function emptyVariantRow(): VariantRow {
  return { key: crypto.randomUUID(), name: "", sku: "", barcode: "", price: "", minStock: "0", maxStock: "" };
}

export function ProductFormModal({ open, onClose, onSaved, categories, brands, editingProduct }: ProductFormModalProps) {
  const [form, setForm] = useState({
    sku: editingProduct?.sku ?? "",
    barcode: editingProduct?.barcode ?? "",
    name: editingProduct?.name ?? "",
    description: editingProduct?.description ?? "",
    categoryId: editingProduct?.categoryId ?? "",
    brandId: editingProduct?.brandId ?? "",
    cost: editingProduct?.cost ?? "0",
    price: editingProduct?.price ?? "",
    promoPrice: editingProduct?.promoPrice ?? "",
    taxRate: editingProduct?.taxRate ?? "0",
    minStock: String(editingProduct?.minStock ?? 0),
    maxStock: editingProduct?.maxStock != null ? String(editingProduct.maxStock) : "",
  });
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);

  // `product` starts as whatever was passed in (edit-from-list flow). In the
  // create flow it starts undefined and only gets set once the POST
  // succeeds — that transition is what turns this same modal instance into
  // an "edit this product I just made" view (variants become read-only,
  // ImageUploader becomes available) without the user closing/reopening
  // anything, per this task's UX requirement.
  const [product, setProduct] = useState<Product | undefined>(editingProduct);
  const wasCreatedThisSession = !editingProduct && !!product;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  function addVariantRow() {
    setVariantRows((prev) => [...prev, emptyVariantRow()]);
  }
  function removeVariantRow(key: string) {
    setVariantRows((prev) => prev.filter((r) => r.key !== key));
  }
  function updateVariantRow(key: string, field: keyof Omit<VariantRow, "key">, value: string) {
    setVariantRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function handleImagesChange(images: Product["images"]) {
    if (!product) return;
    const updated = { ...product, images };
    setProduct(updated);
    onSaved(updated);
  }

  async function handleStatusChange(status: Product["status"]) {
    if (!product) return;
    setStatusSaving(true);
    setError(null);
    try {
      const updated = await productService.updateProductStatus(product.id, status);
      setProduct(updated);
      onSaved(updated);
    } catch {
      setError("No se pudo actualizar el estado del producto.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const base = {
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        cost: Number(form.cost),
        price: Number(form.price),
        promoPrice: form.promoPrice ? Number(form.promoPrice) : undefined,
        taxRate: Number(form.taxRate),
        minStock: Number(form.minStock),
        maxStock: form.maxStock ? Number(form.maxStock) : undefined,
      };

      if (product) {
        const updated = await productService.updateProduct(product.id, base);
        setProduct(updated);
        onSaved(updated);
        // Only the edit-from-list flow auto-closes (matches the rest of the
        // app's modal convention). The just-created-this-session flow stays
        // open — closing here would undo the whole point of transitioning
        // into edit mode in place, before the user has had a chance to
        // attach images.
        if (editingProduct) onClose();
      } else {
        const variants = variantRows
          .filter((r) => r.name.trim() && r.sku.trim())
          .map((r) => ({
            name: r.name.trim(),
            sku: r.sku.trim(),
            barcode: r.barcode.trim() || undefined,
            price: r.price ? Number(r.price) : undefined,
            minStock: Number(r.minStock || 0),
            maxStock: r.maxStock ? Number(r.maxStock) : undefined,
          }));
        const created = await productService.createProduct({ ...base, variants });
        setProduct(created);
        onSaved(created);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  const isExistingProduct = !!product;

  return (
    <Modal open={open} onClose={onClose} title={product ? "Editar producto" : "Nuevo producto"}>
      <form onSubmit={handleSubmit} className="product-form">
        {wasCreatedThisSession && (
          <p className="product-form__success">
            <CheckCircle2 size={16} /> Producto creado. Ya puedes agregar imágenes o seguir editando.
          </p>
        )}

        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
        <label>Código de barras<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
        <label>Descripción<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>

        <label>Categoría
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Marca
          <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
            <option value="">Sin marca</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>

        <div className="product-form__row">
          <label>Costo<input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} required /></label>
          <label>Precio<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></label>
        </div>
        <div className="product-form__row">
          <label>Precio promocional<input type="number" min="0" step="0.01" value={form.promoPrice} onChange={(e) => setForm({ ...form, promoPrice: e.target.value })} /></label>
          <label>Tasa de impuesto<input type="number" min="0" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} required /></label>
        </div>
        <div className="product-form__row">
          <label>Stock mínimo<input type="number" min="0" step="1" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} required /></label>
          <label>Stock máximo<input type="number" min="0" step="1" value={form.maxStock} onChange={(e) => setForm({ ...form, maxStock: e.target.value })} /></label>
        </div>

        {isExistingProduct && (
          <label>Estado
            <select
              value={product!.status}
              disabled={statusSaving}
              onChange={(e) => handleStatusChange(e.target.value as Product["status"])}
            >
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </label>
        )}

        <div className="product-form__variants">
          <span className="product-form__variants-label">Variantes</span>

          {isExistingProduct ? (
            <>
              {product!.variants.length === 0 ? (
                <p className="product-form__variants-empty">Este producto no tiene variantes.</p>
              ) : (
                <ul className="product-form__variants-readonly">
                  {product!.variants.map((v) => (
                    <li key={v.id}>
                      <span className="product-form__variant-name">{v.name}</span>
                      <span className="product-form__variant-sku">{v.sku}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="product-form__variants-note">
                Las variantes se definen al crear el producto y no se pueden modificar después en esta versión.
              </p>
            </>
          ) : (
            <>
              {variantRows.map((row) => (
                <div key={row.key} className="product-form__variant-row">
                  <input placeholder="Nombre" value={row.name} onChange={(e) => updateVariantRow(row.key, "name", e.target.value)} required />
                  <input placeholder="SKU" value={row.sku} onChange={(e) => updateVariantRow(row.key, "sku", e.target.value)} required />
                  <input placeholder="Código de barras" value={row.barcode} onChange={(e) => updateVariantRow(row.key, "barcode", e.target.value)} />
                  <input placeholder="Precio" type="number" min="0" step="0.01" value={row.price} onChange={(e) => updateVariantRow(row.key, "price", e.target.value)} />
                  <input placeholder="Stock mín." type="number" min="0" step="1" value={row.minStock} onChange={(e) => updateVariantRow(row.key, "minStock", e.target.value)} />
                  <input placeholder="Stock máx." type="number" min="0" step="1" value={row.maxStock} onChange={(e) => updateVariantRow(row.key, "maxStock", e.target.value)} />
                  <button type="button" className="product-form__variant-remove" onClick={() => removeVariantRow(row.key)} aria-label="Quitar variante">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className="product-form__variant-add" onClick={addVariantRow}>
                <Plus size={14} /> Agregar variante
              </button>
            </>
          )}
        </div>

        {isExistingProduct && (
          <div className="product-form__images">
            <span className="product-form__images-label">Imágenes</span>
            <ImageUploader productId={product!.id} images={product!.images} onImagesChange={handleImagesChange} />
          </div>
        )}

        {error && <p className="product-form__error"><AlertTriangle size={14} /> {error}</p>}

        <div className="product-form__actions">
          <button type="submit" disabled={saving}>{saving ? "Guardando..." : product ? "Guardar cambios" : "Crear producto"}</button>
          {wasCreatedThisSession && (
            <button type="button" className="product-form__done" onClick={onClose}>Listo, cerrar</button>
          )}
        </div>
      </form>
    </Modal>
  );
}
