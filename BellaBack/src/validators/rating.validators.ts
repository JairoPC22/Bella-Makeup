import { z } from "zod";

// Public, unauthenticated storefront endpoint — mirrors
// publicCatalog.validators.ts's stance on bounding untrusted input, even
// though nothing here is as expensive as a DB scan: rating is a strict 1-5
// int (matches the PeekRating widget's 5-star scale), comment/page are
// capped so a bad-faith caller can't post an arbitrarily huge blob.
export const createRatingSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500).optional(),
  page: z.string().trim().min(1).max(200).optional(),
});

export const listRatingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).optional(),
});
