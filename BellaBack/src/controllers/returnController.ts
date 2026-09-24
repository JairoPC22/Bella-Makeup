import { Request, Response, NextFunction } from "express";
import * as returnService from "../services/returnService";
import { processReturnSchema, listReturnsQuerySchema } from "../validators/return.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listReturnsQuerySchema.parse(req.query);
    res.json(await returnService.listReturns(req.user!.id, filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await returnService.getReturn(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

// No manejo especial para el fallo de PIN: returnService lanza
// AppError(401, PIN_GENERIC_ERROR) y errorHandler lo convierte en { message }.
// Así, un PIN incorrecto, uno sin permiso returns.authorize o uno de otra
// sucursal producen todos la misma respuesta 401 genérica.
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = processReturnSchema.parse(req.body);
    const created = await returnService.processReturn(data, req.user!.id);
    res.status(201).json(created);
  } catch (err) { next(err); }
}
