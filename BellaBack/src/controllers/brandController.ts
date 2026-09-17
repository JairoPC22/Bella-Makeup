import { Request, Response, NextFunction } from "express";
import { createBrandSchema, updateBrandSchema, updateBrandStatusSchema } from "../validators/brand.validators";
import * as brandService from "../services/brandService";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await brandService.listBrands());
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createBrandSchema.parse(req.body);
    const brand = await brandService.createBrand(data, req.user!.id);
    res.status(201).json(brand);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateBrandSchema.parse(req.body);
    res.json(await brandService.updateBrand(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateBrandStatusSchema.parse(req.body);
    res.json(await brandService.updateBrandStatus(req.params.id, status, req.user!.id));
  } catch (err) { next(err); }
}
