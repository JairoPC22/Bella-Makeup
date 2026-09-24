import type { InventoryRow } from "../types/api";

export const INVENTORY_STATUS_LABEL: Record<InventoryRow["status"], string> = {
  AVAILABLE: "Disponible",
  LOW: "Bajo",
  CRITICAL: "Crítico",
  OUT: "Agotado",
};
