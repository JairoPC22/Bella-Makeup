import { type FormEvent, useState } from "react";
import { Plus, X, Check, AlertTriangle, CheckCircle2, Info, DollarSign, Boxes, Layers, Image as ImageIcon } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ImageUploader } from "../../components/common/ImageUploader";
import { ApiError } from "../../services/apiClient";
import * as productService from "../../services/productService";
import * as categoryService from "../../services/categoryService";
import * as brandService from "../../services/brandService";
import type { Brand, Category, Product } from "../../types/api";

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (product: Product) => void;
  categories: Category[];
  brands: Brand[];
  /** Bubbles a newly-created category/brand up to ProductsPage so its own
   *  filter-bar selects (which share this same state) pick it up right
   *  away, without a manual refetch or page reload. */
  onCategoryCreated: (category: Category) => void;
  onBrandCreated: (brand: Brand) => void;
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

export function ProductFormModal({ open, onClose, onSaved, categories, brands, onCategoryCreated, onBrandCreated, editingProduct }: ProductFormModalProps) {
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

  // Inline "+ Nueva categoría" / "+ Nueva marca" affordance — swaps the
  // <select> for a text input + confirm/cancel in place, rather than
  // opening a modal-within-a-modal.
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [creatingBrand, setCreatingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCategorySaving(true);
    setCategoryError(null);
    try {
      const created = await categoryService.createCategory(name);
      onCategoryCreated(created);
      setForm((prev) => ({ ...prev, categoryId: created.id }));
      setCreatingCategory(false);
      setNewCategoryName("");
    } catch (err) {
      setCategoryError(err instanceof ApiError ? err.message : "No se pudo crear la categoría.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleCreateBrand() {
    const name = newBrandName.trim();
    if (!name) return;
    setBrandSaving(true);
    setBrandError(null);
    try {
      const created = await brandService.createBrand(name);
      onBrandCreated(created);
      setForm((prev) => ({ ...prev, brandId: created.id }));
      setCreatingBrand(false);
      setNewBrandName("");
    } catch (err) {
      setBrandError(err instanceof ApiError ? err.message : "No se pudo crear la marca.");
    } finally {
      setBrandSaving(false);
    }
  }

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

        {/* ---------- Información básica ---------- */}
        <section className="product-form__section">
          <header className="product-form__section-header">
            <Info size={16} />
            <div>
              <h3>Información básica</h3>
              <p>Nombre, identificadores y clasificación del producto.</p>
            </div>
          </header>
          <div className="product-form__section-body">
            <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <div className="product-form__row">
              <label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
              <label>Código de barras<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
            </div>
            <div className="product-form__row">
              <label>Categoría
                {!creatingCategory ? (
                  <div className="product-form__select-with-add">
                    <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                      <option value="">Sin categoría</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      className="product-form__add-inline"
                      onClick={() => { setCreatingCategory(true); setNewCategoryName(""); setCategoryError(null); }}
                      aria-label="Nueva categoría"
                      title="Nueva categoría"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="product-form__inline-create">
                    <input
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Nombre de la categoría"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleCreateCategory(); }
                        if (e.key === "Escape") { e.preventDefault(); setCreatingCategory(false); setCategoryError(null); }
                      }}
                    />
                    <button
                      type="button"
                      className="product-form__inline-confirm"
                      onClick={handleCreateCategory}
                      disabled={categorySaving || !newCategoryName.trim()}
                      aria-label="Confirmar nueva categoría"
                      title="Confirmar"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="product-form__inline-cancel"
                      onClick={() => { setCreatingCategory(false); setCategoryError(null); }}
                      aria-label="Cancelar"
                      title="Cancelar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {categoryError && <span className="product-form__inline-error">{categoryError}</span>}
              </label>
              <label>Marca
                {!creatingBrand ? (
                  <div className="product-form__select-with-add">
                    <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                      <option value="">Sin marca</option>
                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button
                      type="button"
                      className="product-form__add-inline"
                      onClick={() => { setCreatingBrand(true); setNewBrandName(""); setBrandError(null); }}
                      aria-label="Nueva marca"
                      title="Nueva marca"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="product-form__inline-create">
                    <input
                      autoFocus
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      placeholder="Nombre de la marca"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleCreateBrand(); }
                        if (e.key === "Escape") { e.preventDefault(); setCreatingBrand(false); setBrandError(null); }
                      }}
                    />
                    <button
                      type="button"
                      className="product-form__inline-confirm"
                      onClick={handleCreateBrand}
                      disabled={brandSaving || !newBrandName.trim()}
                      aria-label="Confirmar nueva marca"
                      title="Confirmar"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="product-form__inline-cancel"
                      onClick={() => { setCreatingBrand(false); setBrandError(null); }}
                      aria-label="Cancelar"
                      title="Cancelar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {brandError && <span className="product-form__inline-error">{brandError}</span>}
              </label>
            </div>
            <label>Descripción<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
        </section>

        {/* ---------- Precios y costos ---------- */}
        <section className="product-form__section">
          <header className="product-form__section-header">
            <DollarSign size={16} />
            <div>
              <h3>Precios y costos</h3>
              <p>Lo que cuesta producirlo y lo que paga la clienta.</p>
            </div>
          </header>
          <div className="product-form__section-body">
            <div className="product-form__row">
              <label>Costo<input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} required /></label>
              <label>Precio<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></label>
            </div>
            <div className="product-form__row">
              <label>
                Precio promocional
                <input type="number" min="0" step="0.01" placeholder="Opcional" value={form.promoPrice} onChange={(e) => setForm({ ...form, promoPrice: e.target.value })} />
                <span className="product-form__hint">Opcional. Solo se usa si es menor al precio regular.</span>
              </label>
              <label>
                Tasa de impuesto
                <input type="number" min="0" step="0.01" placeholder="0" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} required />
                <span className="product-form__hint">Porcentaje (%) aplicado sobre el precio.</span>
              </label>
            </div>
          </div>
        </section>

        {/* ---------- Inventario ---------- */}
        <section className="product-form__section">
          <header className="product-form__section-header">
            <Boxes size={16} />
            <div>
              <h3>Inventario</h3>
              <p>Umbrales que activan las alertas de stock en el módulo de Inventario.</p>
            </div>
          </header>
          <div className="product-form__section-body">
            <div className="product-form__row">
              <label>
                Stock mínimo
                <input type="number" min="0" step="1" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} required />
                <span className="product-form__hint">Por debajo de este número se marca como bajo/crítico.</span>
              </label>
              <label>
                Stock máximo
                <input type="number" min="0" step="1" placeholder="Opcional" value={form.maxStock} onChange={(e) => setForm({ ...form, maxStock: e.target.value })} />
                <span className="product-form__hint">Opcional. Tope de referencia para reabastecer.</span>
              </label>
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
          </div>
        </section>

        {/* ---------- Variantes ---------- */}
        <section className="product-form__section">
          <header className="product-form__section-header">
            <Layers size={16} />
            <div>
              <h3>Variantes</h3>
              <p>{isExistingProduct ? "Las variantes de este producto." : "Opcional. Ej. distintos tonos o tamaños."}</p>
            </div>
          </header>
          <div className="product-form__section-body">
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
                {variantRows.map((row, idx) => (
                  <div key={row.key} className="product-form__variant-card">
                    <div className="product-form__variant-card-header">
                      <span>Variante {idx + 1}</span>
                      <button type="button" className="product-form__variant-remove" onClick={() => removeVariantRow(row.key)} aria-label="Quitar variante">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="product-form__variant-card-grid">
                      <label>Nombre<input value={row.name} onChange={(e) => updateVariantRow(row.key, "name", e.target.value)} required /></label>
                      <label>SKU<input value={row.sku} onChange={(e) => updateVariantRow(row.key, "sku", e.target.value)} required /></label>
                      <label>Código de barras<input value={row.barcode} onChange={(e) => updateVariantRow(row.key, "barcode", e.target.value)} /></label>
                      <label>Precio<input type="number" min="0" step="0.01" placeholder="Opcional" value={row.price} onChange={(e) => updateVariantRow(row.key, "price", e.target.value)} /></label>
                      <label>Stock mín.<input type="number" min="0" step="1" value={row.minStock} onChange={(e) => updateVariantRow(row.key, "minStock", e.target.value)} /></label>
                      <label>Stock máx.<input type="number" min="0" step="1" placeholder="Opcional" value={row.maxStock} onChange={(e) => updateVariantRow(row.key, "maxStock", e.target.value)} /></label>
                    </div>
                  </div>
                ))}
                <button type="button" className="product-form__variant-add" onClick={addVariantRow}>
                  <Plus size={14} /> Agregar variante
                </button>
              </>
            )}
          </div>
        </section>

        {/* ---------- Imágenes ---------- */}
        {isExistingProduct && (
          <section className="product-form__section">
            <header className="product-form__section-header">
              <ImageIcon size={16} />
              <div>
                <h3>Imágenes</h3>
                <p>La primera imagen marcada como principal es la que se ve en la lista.</p>
              </div>
            </header>
            <div className="product-form__section-body">
              <ImageUploader productId={product!.id} images={product!.images} onImagesChange={handleImagesChange} />
            </div>
          </section>
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
