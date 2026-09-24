import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2, Loader2, AlertTriangle, ImageOff } from "lucide-react";
import * as productService from "../../services/productService";
import type { ProductImage } from "../../types/api";
import "./ImageUploader.css";

interface ImageUploaderProps {
  productId: string;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
}

// Componente controlado: no guarda copia propia de `images`, solo estado de
// UI local (flags de carga, confirmación de borrado, error). Cada respuesta
// del servidor se propaga de inmediato al padre vía onImagesChange.
export function ImageUploader({ productId, images, onImagesChange }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primaryPendingId, setPrimaryPendingId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function openFilePicker() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow selecting the same file again later
    if (!file) return;

    const validationError = productService.validateProductImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const image = await productService.uploadProductImage(productId, file);
      onImagesChange([...images, image]);
    } catch {
      setError("No se pudo subir la imagen. Intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSetPrimary(imageId: string) {
    setError(null);
    setPrimaryPendingId(imageId);
    try {
      await productService.setPrimaryProductImage(productId, imageId);
      onImagesChange(images.map((img) => ({ ...img, isPrimary: img.id === imageId })));
    } catch {
      setError("No se pudo marcar la imagen como principal.");
    } finally {
      setPrimaryPendingId(null);
    }
  }

  async function handleDelete(imageId: string) {
    setError(null);
    setDeletePendingId(imageId);
    try {
      await productService.deleteProductImage(productId, imageId);
      onImagesChange(images.filter((img) => img.id !== imageId));
    } catch {
      setError("No se pudo eliminar la imagen.");
    } finally {
      setDeletePendingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="image-uploader">
      {images.length === 0 && (
        <p className="image-uploader__empty">
          <ImageOff size={16} /> Este producto todavía no tiene imágenes.
        </p>
      )}

      {images.length > 0 && (
        <div className="image-uploader__grid">
          {images.map((img) => (
            <div key={img.id} className="image-uploader__item">
              <img src={productService.buildProductImageUrl(img.url)} alt="" className="image-uploader__thumb" />
              {img.isPrimary && <span className="image-uploader__badge"><Star size={11} /> Principal</span>}

              {confirmDeleteId === img.id ? (
                <div className="image-uploader__confirm">
                  <p>¿Eliminar?</p>
                  <div className="image-uploader__confirm-actions">
                    <button
                      type="button"
                      onClick={() => handleDelete(img.id)}
                      disabled={deletePendingId === img.id}
                    >
                      {deletePendingId === img.id ? <Loader2 size={13} className="spin" /> : "Sí"}
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={deletePendingId === img.id}>No</button>
                  </div>
                </div>
              ) : (
                <div className="image-uploader__actions">
                  {!img.isPrimary && (
                    <button
                      type="button"
                      className="image-uploader__action"
                      onClick={() => handleSetPrimary(img.id)}
                      disabled={primaryPendingId === img.id}
                      title="Hacer principal"
                      aria-label="Hacer principal"
                    >
                      {primaryPendingId === img.id ? <Loader2 size={14} className="spin" /> : <Star size={14} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className="image-uploader__action image-uploader__action--danger"
                    onClick={() => setConfirmDeleteId(img.id)}
                    title="Eliminar"
                    aria-label="Eliminar imagen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelected}
        className="image-uploader__input"
      />
      <button type="button" className="image-uploader__add" onClick={openFilePicker} disabled={uploading}>
        {uploading ? <Loader2 size={16} className="spin" /> : <ImagePlus size={16} />}
        {uploading ? "Subiendo..." : "Agregar imagen"}
      </button>

      {error && (
        <p className="image-uploader__error"><AlertTriangle size={14} /> {error}</p>
      )}
    </div>
  );
}
