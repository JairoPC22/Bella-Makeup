import { Request, Response, NextFunction } from "express";
import * as publicCatalogService from "../services/publicCatalogService";
import * as orderService from "../services/orderService";
import * as ratingService from "../services/ratingService";
import { listPublicProductsQuerySchema, publicIdParamSchema } from "../validators/publicCatalog.validators";
import { createOnlineOrderSchema, trackOnlineOrderQuerySchema } from "../validators/order.validators";
import { createRatingSchema } from "../validators/rating.validators";

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await publicCatalogService.listPublicCategories());
  } catch (err) { next(err); }
}

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listPublicProductsQuerySchema.parse(req.query);
    res.json(await publicCatalogService.listPublicProducts(filters));
  } catch (err) { next(err); }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = publicIdParamSchema.parse(req.params);
    res.json(await publicCatalogService.getPublicProduct(id));
  } catch (err) { next(err); }
}

export async function listBranches(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await publicCatalogService.listPublicBranches());
  } catch (err) { next(err); }
}

export async function getCompanyInfo(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await publicCatalogService.getPublicCompanyInfo());
  } catch (err) { next(err); }
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createOnlineOrderSchema.parse(req.body);
    const order = await orderService.createOnlineOrder(data);
    res.status(201).json(order);
  } catch (err) { next(err); }
}

export async function trackOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone } = trackOnlineOrderQuerySchema.parse(req.query);
    const order = await orderService.trackOnlineOrder(req.params.orderNumber, phone);
    res.json(order);
  } catch (err) { next(err); }
}

export async function createRating(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createRatingSchema.parse(req.body);
    const rating = await ratingService.submitRating(data);
    res.status(201).json(rating);
  } catch (err) { next(err); }
}
