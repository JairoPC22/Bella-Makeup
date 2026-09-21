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

// The PIN failure path needs no special handling here: returnService throws
// AppError(401, PIN_GENERIC_ERROR) — the message exported by the primitive
// itself — and errorHandler renders every AppError as { message } with its
// status. So a wrong PIN, a PIN belonging to somebody without
// returns.authorize, a supervisor from another branch and a malformed PIN
// all surface as one identical 401 body, exactly as generic as
// POST /api/auth/verify-pin's own response and no more.
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = processReturnSchema.parse(req.body);
    const created = await returnService.processReturn(data, req.user!.id);
    res.status(201).json(created);
  } catch (err) { next(err); }
}
