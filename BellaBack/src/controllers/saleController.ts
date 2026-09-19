import { Request, Response, NextFunction } from "express";
import * as saleService from "../services/saleService";
import { createSaleSchema, cancelSaleSchema, listSalesQuerySchema } from "../validators/sale.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listSalesQuerySchema.parse(req.query);
    res.json(await saleService.listSales(req.user!.id, filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await saleService.getSale(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSaleSchema.parse(req.body);
    const sale = await saleService.createSale(data, req.user!.id);
    res.status(201).json(sale);
  } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = cancelSaleSchema.parse(req.body);
    res.json(await saleService.cancelSale(req.params.id, reason, req.user!.id));
  } catch (err) { next(err); }
}
