import { Request, Response, NextFunction } from "express";
import * as inventoryService from "../services/inventoryService";
import { adjustInventory } from "../services/inventoryAdjustmentService";
import { listInventoryQuerySchema, listMovementsQuerySchema, adjustInventorySchema } from "../validators/inventory.validators";

// El status se calcula aquí (nunca en el frontend) para que las reglas de negocio queden centralizadas.
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listInventoryQuerySchema.parse(req.query);
    const rows = await inventoryService.listInventory(req.user!.id, { branchId: filters.branchId, categoryId: filters.categoryId });

    const mapped = rows.map((row) => {
      const minStock = row.variant?.minStock ?? row.product.minStock;
      return { ...row, status: inventoryService.computeStatus(row.stock, minStock) };
    });

    const result = filters.status ? mapped.filter((row) => row.status === filters.status) : mapped;
    res.json(result);
  } catch (err) { next(err); }
}

export async function movements(req: Request, res: Response, next: NextFunction) {
  try {
    const { variantId } = listMovementsQuerySchema.parse(req.query);
    res.json(await inventoryService.listMovements(req.params.productId, variantId));
  } catch (err) { next(err); }
}

export async function adjust(req: Request, res: Response, next: NextFunction) {
  try {
    const data = adjustInventorySchema.parse(req.body);
    const movement = await adjustInventory(data, req.user!.id);
    res.status(201).json(movement);
  } catch (err) { next(err); }
}
