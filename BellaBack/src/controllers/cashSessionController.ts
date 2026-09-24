import { Request, Response, NextFunction } from "express";
import * as cashSessionService from "../services/cashSessionService";
import {
  openCashSessionSchema,
  closeCashSessionSchema,
  currentCashSessionQuerySchema,
  listCashSessionsQuerySchema,
} from "../validators/cashSession.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listCashSessionsQuerySchema.parse(req.query);
    res.json(await cashSessionService.listSessions(req.user!.id, filters));
  } catch (err) { next(err); }
}

// Debe declararse antes de la ruta "/:id" para que "current" no se interprete como id.
export async function current(req: Request, res: Response, next: NextFunction) {
  try {
    const { branchId } = currentCashSessionQuerySchema.parse(req.query);
    res.json(await cashSessionService.getOpenSession(branchId, req.user!.id));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await cashSessionService.getSession(req.params.id, req.user!.id));
  } catch (err) { next(err); }
}

export async function open(req: Request, res: Response, next: NextFunction) {
  try {
    const { branchId, openingFloat } = openCashSessionSchema.parse(req.body);
    const session = await cashSessionService.openSession(branchId, req.user!.id, openingFloat);
    res.status(201).json(session);
  } catch (err) { next(err); }
}

export async function close(req: Request, res: Response, next: NextFunction) {
  try {
    const data = closeCashSessionSchema.parse(req.body);
    res.json(await cashSessionService.closeSessionBlind(req.params.id, req.user!.id, data));
  } catch (err) { next(err); }
}
