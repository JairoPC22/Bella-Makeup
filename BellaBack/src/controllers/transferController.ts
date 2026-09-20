import { Request, Response, NextFunction } from "express";
import * as transferService from "../services/transferService";
import { createTransferSchema, cancelTransferSchema, listTransfersQuerySchema } from "../validators/transfer.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listTransfersQuerySchema.parse(req.query);
    res.json(await transferService.listTransfers(req.user!.id, filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await transferService.getTransfer(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createTransferSchema.parse(req.body);
    const transfer = await transferService.createTransfer(data, req.user!.id);
    res.status(201).json(transfer);
  } catch (err) { next(err); }
}

export async function receive(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await transferService.receiveTransfer(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = cancelTransferSchema.parse(req.body);
    res.json(await transferService.cancelTransfer(req.params.id, reason, req.user!.id));
  } catch (err) { next(err); }
}
