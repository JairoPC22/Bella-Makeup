import { applyMovement } from "./inventoryService";
import { createAdjustment } from "../repositories/inventoryAdjustmentRepository";
import { logAudit } from "./auditService";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { assertBranchAccess } from "./branchAccessService";
import { hasPermissionByUser } from "./permissionCheckService";
import { verifySupervisorPin, PIN_GENERIC_ERROR } from "./pinAuthService";
import { getSettings as getCompanySettings } from "./companySettingsService";

export interface AdjustInventoryInput {
  productId: string;
  variantId?: string;
  branchId: string;
  quantity: number;
  reason: string;
  // Solo se exige cuando quien ajusta no tiene inventory.adjust y
  // CompanySettings.allowPinForInventoryAdjust está activo.
  pinCode?: string;
}

// Envoltura sobre applyMovement para correcciones manuales de stock: aplica
// el movimiento, crea el InventoryAdjustment vinculado y registra auditoría.
// Nota: el paso 1 corre en su propia transacción y no cubre el paso 2; es
// una decisión deliberada, no un descuido (ver task-6-report.md).
//
// inventory.adjust ya no se exige en la ruta (solo inventory.view, el piso
// para intentarlo): quien no lo tiene puede seguir ajustando si
// CompanySettings.allowPinForInventoryAdjust está activo y trae el PIN de un
// supervisor que sí lo tiene. Con el interruptor apagado (su default), el
// comportamiento es idéntico al de antes: sin el permiso, no hay forma de ajustar.
export async function adjustInventory(input: AdjustInventoryInput, actorId: string) {
  await assertBranchAccess(prisma, actorId, input.branchId);

  const canAdjustDirectly = await hasPermissionByUser(prisma, actorId, "inventory.adjust");
  let authorizedBy = actorId;
  if (!canAdjustDirectly) {
    const settings = await getCompanySettings();
    if (!settings.allowPinForInventoryAdjust) throw new AppError(403, "No tienes permiso para ajustar inventario");
    const auth = await verifySupervisorPin(actorId, input.pinCode ?? "", "inventory.adjust");
    if (!auth.ok) throw new AppError(401, PIN_GENERIC_ERROR);
    authorizedBy = auth.supervisorId;
  }

  const movement = await applyMovement({
    productId: input.productId,
    variantId: input.variantId,
    branchId: input.branchId,
    type: "ADJUSTMENT",
    quantity: input.quantity,
    userId: actorId,
  });

  await createAdjustment({ movementId: movement.id, reason: input.reason, authorizedBy });

  await logAudit({
    userId: actorId,
    action: "inventory.adjust",
    module: "inventory",
    entityType: "product",
    entityId: input.productId,
    branchId: input.branchId,
    details: { productId: input.productId, quantity: input.quantity, reason: input.reason },
  });

  return movement;
}
