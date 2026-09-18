import { Request, Response, NextFunction } from "express";
import * as inventoryService from "../services/inventoryService";
import { adjustInventory } from "../services/inventoryAdjustmentService";
import { listInventoryQuerySchema, listMovementsQuerySchema, adjustInventorySchema } from "../validators/inventory.validators";

// Every row is mapped through inventoryService.computeStatus before it
// leaves the API, so the status shown to a client is always computed here —
// business logic (the OUT/CRITICAL/LOW/AVAILABLE thresholds) is never
// recomputed on the frontend.
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listInventoryQuerySchema.parse(req.query);
    const rows = await inventoryService.listInventory({ branchId: filters.branchId, categoryId: filters.categoryId });

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
