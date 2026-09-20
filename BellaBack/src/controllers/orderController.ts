import { Request, Response, NextFunction } from "express";
import * as orderService from "../services/orderService";
import { listOrdersQuerySchema, updateOrderStatusSchema } from "../validators/order.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listOrdersQuerySchema.parse(req.query);
    res.json(await orderService.listOrders(req.user!.id, filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orderService.getOrder(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, reason } = updateOrderStatusSchema.parse(req.body);
    res.json(await orderService.updateOrderStatus(req.params.id, status, req.user!.id, reason));
  } catch (err) { next(err); }
}
