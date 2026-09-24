import { Request, Response, NextFunction } from "express";
import * as ratingService from "../services/ratingService";
import { listRatingsQuerySchema } from "../validators/rating.validators";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page } = listRatingsQuerySchema.parse(req.query);
    res.json(await ratingService.listRatings(page));
  } catch (err) { next(err); }
}

export async function summary(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await ratingService.getRatingSummary());
  } catch (err) { next(err); }
}
