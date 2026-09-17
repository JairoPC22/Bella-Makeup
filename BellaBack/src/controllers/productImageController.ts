import { Request, Response, NextFunction } from "express";
import * as productImageService from "../services/productImageService";
import { AppError } from "../utils/AppError";

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new AppError(400, "No se recibió ninguna imagen");
    const image = await productImageService.uploadProductImage(req.params.productId, req.file, req.user!.id);
    res.status(201).json(image);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await productImageService.deleteProductImage(req.params.productId, req.params.imageId, req.user!.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function setPrimary(req: Request, res: Response, next: NextFunction) {
  try {
    const image = await productImageService.setPrimaryProductImage(req.params.productId, req.params.imageId, req.user!.id);
    res.json(image);
  } catch (err) { next(err); }
}
