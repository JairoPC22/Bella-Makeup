import { Request, Response, NextFunction } from "express";
import { createCategorySchema, updateCategorySchema, updateCategoryStatusSchema } from "../validators/category.validators";
import * as categoryService from "../services/categoryService";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await categoryService.listCategories());
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createCategorySchema.parse(req.body);
    const category = await categoryService.createCategory(data, req.user!.id);
    res.status(201).json(category);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateCategorySchema.parse(req.body);
    res.json(await categoryService.updateCategory(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateCategoryStatusSchema.parse(req.body);
    res.json(await categoryService.updateCategoryStatus(req.params.id, status, req.user!.id));
  } catch (err) { next(err); }
}
