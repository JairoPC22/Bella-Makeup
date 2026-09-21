import { Request, Response, NextFunction } from "express";
import * as purchaseService from "../services/purchaseService";
import {
  createPurchaseSchema,
  receivePurchaseSchema,
  cancelPurchaseSchema,
  listPurchasesQuerySchema,
} from "../validators/purchase.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listPurchasesQuerySchema.parse(req.query);
    res.json(await purchaseService.listPurchases(req.user!.id, filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await purchaseService.getPurchase(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createPurchaseSchema.parse(req.body);
    const purchase = await purchaseService.createPurchase(data, req.user!.id);
    res.status(201).json(purchase);
  } catch (err) { next(err); }
}

export async function receive(req: Request, res: Response, next: NextFunction) {
  try {
    const data = receivePurchaseSchema.parse(req.body ?? {});
    res.json(await purchaseService.receivePurchase(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = cancelPurchaseSchema.parse(req.body);
    res.json(await purchaseService.cancelPurchase(req.params.id, reason, req.user!.id));
  } catch (err) { next(err); }
}
