import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";
import { paginationParams, buildPageResult } from "../utils/pagination";

export function createRating(data: Prisma.SiteRatingUncheckedCreateInput) {
  return prisma.siteRating.create({ data });
}

const LIST_PAGE_SIZE = 30;

export async function listRatings(page = 1) {
  const [items, total] = await Promise.all([
    prisma.siteRating.findMany({
      orderBy: { createdAt: "desc" },
      ...paginationParams(page, LIST_PAGE_SIZE),
    }),
    prisma.siteRating.count(),
  ]);
  return buildPageResult(items, total, page, LIST_PAGE_SIZE);
}

// Single grouped aggregate for the admin-facing summary (average + count +
// a 1-5 breakdown for a simple bar) instead of pulling every row into JS.
export async function getRatingSummary() {
  const [agg, breakdown] = await Promise.all([
    prisma.siteRating.aggregate({ _avg: { rating: true }, _count: { rating: true } }),
    prisma.siteRating.groupBy({ by: ["rating"], _count: { rating: true } }),
  ]);

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of breakdown) counts[row.rating] = row._count.rating;

  return {
    average: agg._avg.rating ?? 0,
    total: agg._count.rating,
    counts,
  };
}
