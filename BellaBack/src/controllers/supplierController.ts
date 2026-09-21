import { Request, Response, NextFunction } from "express";
import * as purchaseService from "../services/purchaseService";
import {
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersQuerySchema,
} from "../validators/purchase.validators";

// Suppliers live in purchaseService alongside the purchase flow (they are
// purchasing master data and nothing else consumes them), but get their own
// thin controller/router pair so the URL surface stays resource-shaped at
// /api/suppliers, matching every other resource in this app.

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listSuppliersQuerySchema.parse(req.query);
    res.json(await purchaseService.listSuppliers(filters));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSupplierSchema.parse(req.body);
    res.status(201).json(await purchaseService.createSupplier(data, req.user!.id));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSupplierSchema.parse(req.body);
    res.json(await purchaseService.updateSupplier(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}
