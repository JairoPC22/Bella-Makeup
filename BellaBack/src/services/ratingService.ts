import * as ratingRepository from "../repositories/ratingRepository";

export interface CreateRatingInput {
  rating: number;
  comment?: string;
  page?: string;
}

// Deliberately anonymous — see the SiteRating model comment in schema.prisma.
// No dedupe/rate-limit by IP or fingerprint on purpose: there's no visitor
// identity to key that on without adding the very tracking the anonymous
// design is avoiding, and this is a low-stakes feedback box, not a vote.
export function submitRating(data: CreateRatingInput) {
  return ratingRepository.createRating({
    rating: data.rating,
    comment: data.comment ?? null,
    page: data.page ?? null,
  });
}

export function listRatings(page?: number) {
  return ratingRepository.listRatings(page);
}

export function getRatingSummary() {
  return ratingRepository.getRatingSummary();
}
