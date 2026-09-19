import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { StatusState } from "../../components/common/StatusState";
import * as inventoryService from "../../services/inventoryService";
import type { InventoryMovement, InventoryRow } from "../../types/api";

const TYPE_LABEL: Record<InventoryMovement["type"], string> = {
  ADJUSTMENT: "Ajuste",
  PURCHASE: "Compra",
  SALE: "Venta",
  TRANSFER_IN: "Transferencia entrante",
  TRANSFER_OUT: "Transferencia saliente",
  RETURN: "Devolución",
};

interface KardexModalProps {
  row: InventoryRow | undefined;
  open: boolean;
  onClose: () => void;
}

type FetchStatus = "loading" | "ready" | "error";

export function KardexModal({ row, open, onClose }: KardexModalProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [status, setStatus] = useState<FetchStatus>("loading");

  useEffect(() => {
    if (!open || !row) return;
    setStatus("loading");
    inventoryService
      .listMovements(row.product.id, row.variant?.id)
      .then((data) => { setMovements(data); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [open, row]);

  return (
    <Modal open={open} onClose={onClose} title="Historial de movimientos">
      {row && (
        <div className="kardex">
          <p className="kardex__subtitle">
            {row.product.name}
            {row.variant ? ` · ${row.variant.name}` : ""} — {row.branch.name}
          </p>

          {status === "loading" && <StatusState kind="loading" compact />}
          {status === "error" && <StatusState kind="error" compact message="No se pudo cargar el historial de movimientos." />}
          {status === "ready" && movements.length === 0 && (
            <StatusState kind="empty" compact message="Este producto todavía no tiene movimientos registrados." />
          )}

          {status === "ready" && movements.length > 0 && (
            <ul className="kardex__list">
              {movements.map((m) => (
                <li key={m.id} className="kardex__item">
                  <div className="kardex__item-main">
                    <span className="kardex__type">{TYPE_LABEL[m.type]}</span>
                    <span className={`kardex__qty ${m.quantity >= 0 ? "kardex__qty--in" : "kardex__qty--out"}`}>
                      {m.quantity >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                  </div>
                  <p className="kardex__stock-line">
                    Stock: {m.stockBefore} → {m.stockAfter}
                  </p>
                  {m.reference && <p className="kardex__reference">Referencia: {m.reference}</p>}
                  <p className="kardex__meta">
                    {m.user?.displayName ?? "Sistema"} · {new Date(m.createdAt).toLocaleString("es-MX")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
