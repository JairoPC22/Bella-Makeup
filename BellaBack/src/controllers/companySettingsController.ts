import { Request, Response, NextFunction } from "express";
import { updateCompanySettingsSchema } from "../validators/companySettings.validators";
import * as service from "../services/companySettingsService";

export async function get(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.getSettings()); } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateCompanySettingsSchema.parse(req.body);
    res.json(await service.updateSettings(data, req.user!.id));
  } catch (err) { next(err); }
}
