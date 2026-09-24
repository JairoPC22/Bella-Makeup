import { type FormEvent, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../services/apiClient";
import * as inventoryService from "../../services/inventoryService";
import type { InventoryRow } from "../../types/api";

interface InventoryAdjustModalProps {
  row: InventoryRow | undefined;
  open: boolean;
  onClose: () => void;
  /** Se llama justo después de un ajuste exitoso, para que la página recargue la tabla. */
  onAdjusted: () => void;
  /** true cuando quien abre el modal no tiene inventory.adjust y por eso necesita el PIN de un supervisor. */
  requiresPin?: boolean;
}

export function InventoryAdjustModal({ row, open, onClose, onAdjusted, requiresPin = false }: InventoryAdjustModalProps) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const parsedQuantity = Number(quantity);
  const quantityValid = quantity.trim() !== "" && Number.isInteger(parsedQuantity) && parsedQuantity !== 0;
  const resultingStock = row && quantityValid ? row.stock + parsedQuantity : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!row) return;
    setError(null);

    if (!quantityValid) {
      setError("Ingresa una cantidad entera distinta de cero.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("El motivo debe tener al menos 3 caracteres.");
      return;
    }

    setSaving(true);
    try {
      await inventoryService.adjustInventory({
        productId: row.product.id,
        variantId: row.variant?.id,
        branchId: row.branch.id,
        quantity: parsedQuantity,
        reason: reason.trim(),
        ...(requiresPin ? { pinCode } : {}),
      });
      setSuccess(true);
      onAdjusted();
      setTimeout(() => {
        setQuantity("");
        setReason("");
        setPinCode("");
        setSuccess(false);
        onClose();
      }, 700);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el ajuste.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajustar inventario">
      {row && (
        <form onSubmit={handleSubmit} className="inventory-adjust">
          <div className="inventory-adjust__summary">
            <p className="inventory-adjust__product">
              {row.product.name}
              {row.variant ? ` · ${row.variant.name}` : ""}
            </p>
            <p className="inventory-adjust__meta">SKU {row.variant?.sku ?? row.product.sku} · {row.branch.name}</p>
            <p className="inventory-adjust__stock">Stock actual: <strong>{row.stock}</strong></p>
          </div>

          <label>
            Cantidad (usa negativo para restar)
            <input
              type="number"
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ej. 5 o -3"
              required
            />
          </label>

          {resultingStock !== null && (
            <p className="inventory-adjust__preview">
              Nuevo stock resultante: <strong>{resultingStock}</strong>
            </p>
          )}

          <label>
            Motivo
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Conteo físico, mercancía dañada, corrección de captura..."
              rows={3}
              required
            />
          </label>

          {requiresPin && (
            <label>
              PIN de un supervisor
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="••••"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
          )}

          {error && <p className="inventory-adjust__error">{error}</p>}
          {success && (
            <p className="inventory-adjust__success">
              <CheckCircle2 size={16} /> Ajuste registrado correctamente.
            </p>
          )}

          <button type="submit" disabled={saving || success || (requiresPin && pinCode.length < 4)}>
            {saving ? "Guardando..." : success ? "Listo" : "Registrar ajuste"}
          </button>
        </form>
      )}
    </Modal>
  );
}
