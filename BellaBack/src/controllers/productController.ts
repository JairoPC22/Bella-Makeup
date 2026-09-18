import { Request, Response, NextFunction } from "express";
import {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  listProductsQuerySchema,
} from "../validators/product.validators";
import * as productService from "../services/productService";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listProductsQuerySchema.parse(req.query);
    res.json(await productService.listProducts(filters));
  } catch (err) { next(err); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await productService.getProduct(req.params.id));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createProductSchema.parse(req.body);
    const product = await productService.createProduct(data, req.user!.id);
    res.status(201).json(product);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateProductSchema.parse(req.body);
    res.json(await productService.updateProduct(req.params.id, data, req.user!.id));
  } catch (err) { next(err); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateProductStatusSchema.parse(req.body);
    res.json(await productService.updateProductStatus(req.params.id, status, req.user!.id));
  } catch (err) { next(err); }
}
