import { Request, Response, NextFunction } from "express";
import * as mermaService from "../services/mermaService";
import { registerMermaSchema, listMermasQuerySchema } from "../validators/merma.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listMermasQuerySchema.parse(req.query);
    res.json(await mermaService.listMermas(req.user!.id, filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await mermaService.getMerma(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

// Same PIN-failure discipline as returnController.create: mermaService
// throws AppError(401, PIN_GENERIC_ERROR) and errorHandler renders it, so
// every distinct cause collapses into one identical 401 body.
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = registerMermaSchema.parse(req.body);
    const created = await mermaService.registerMerma(data, req.user!.id);
    res.status(201).json(created);
  } catch (err) { next(err); }
}
