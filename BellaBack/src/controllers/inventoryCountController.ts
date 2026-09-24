import { Request, Response, NextFunction } from "express";
import * as inventoryCountService from "../services/inventoryCountService";
import {
  createInventoryCountSchema,
  saveCountedItemsSchema,
  listInventoryCountsQuerySchema,
} from "../validators/inventoryCount.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listInventoryCountsQuerySchema.parse(req.query);
    res.json(await inventoryCountService.listInventoryCounts(req.user!.id, filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await inventoryCountService.getInventoryCount(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createInventoryCountSchema.parse(req.body);
    res.status(201).json(await inventoryCountService.createInventoryCount(data, req.user!.id));
  } catch (err) { next(err); }
}

export async function saveItems(req: Request, res: Response, next: NextFunction) {
  try {
    const { items } = saveCountedItemsSchema.parse(req.body);
    res.json(await inventoryCountService.saveCountedItems(req.params.id, items, req.user!.id));
  } catch (err) { next(err); }
}

export async function complete(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await inventoryCountService.completeInventoryCount(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await inventoryCountService.cancelInventoryCount(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}
