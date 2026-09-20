import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";

const PAGE_SIZE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCategory(category: any) {
  return { id: category.id, name: category.name };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBrand(brand: any) {
  return { id: brand.id, name: brand.name };
}

// A shopper doesn't care WHICH branch has stock, only whether the item is
// orderable at all — the actual branch-level availability is re-checked at
// checkout time (orderService.createOnlineOrder validates against the
// specific chosen branchId). `inStock` here is therefore "does ANY branch
// have stock > 0", computed via a single grouped aggregate query per
// product page rather than N+1 per-product queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(product: any, productStock: Map<string, number>, variantStock: Map<string, number>) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category ? mapCategory(product.category) : null,
    brand: product.brand ? mapBrand(product.brand) : null,
    price: product.price,
    promoPrice: product.promoPrice,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    images: product.images.map((img: any) => ({ id: img.id, url: img.url })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variants: product.variants.map((v: any) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      price: v.price,
      imageUrl: v.imageUrl,
      inStock: (variantStock.get(v.id) ?? 0) > 0,
    })),
    inStock: (productStock.get(product.id) ?? 0) > 0,
  };
}

// Builds { productId -> total stock across all branches/variants, variantId
// -> total stock across all branches } for exactly the given product ids, in
// one grouped query — used by both listPublicProducts (page of N products)
// and getPublicProduct (single product) so neither pays an N+1 cost.
async function loadStockTotals(productIds: string[]): Promise<{ productStock: Map<string, number>; variantStock: Map<string, number> }> {
  const productStock = new Map<string, number>();
  const variantStock = new Map<string, number>();
  if (productIds.length === 0) return { productStock, variantStock };

  const rows = await prisma.inventory.groupBy({
    by: ["productId", "variantId"],
    where: { productId: { in: productIds } },
    _sum: { stock: true },
  });

  for (const row of rows) {
    const sum = row._sum.stock ?? 0;
    productStock.set(row.productId, (productStock.get(row.productId) ?? 0) + sum);
    if (row.variantId) variantStock.set(row.variantId, (variantStock.get(row.variantId) ?? 0) + sum);
  }

  return { productStock, variantStock };
}

// Safe public subset of CompanySettings — the authenticated GET /api/settings
// exposes the full row (including taxId, which is fine for staff but not
// meant for a public unauthenticated response), so the storefront gets its
// own endpoint with only what a customer-facing footer/contact button needs.
export async function getPublicCompanyInfo() {
  const settings = await prisma.companySettings.findFirst();
  if (!settings) return null;
  return {
    companyName: settings.companyName,
    address: settings.address,
    phone: settings.phone,
    businessHours: settings.businessHours,
    socialLinks: settings.socialLinks as Record<string, string> | null,
  };
}

export function listPublicCategories() {
  return prisma.category
    .findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } })
    .then((rows) => rows.map(mapCategory));
}

export function listPublicBranches() {
  return prisma.branch.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }).then((rows) =>
    rows.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      schedule: b.schedule,
      lat: b.lat,
      lng: b.lng,
    }))
  );
}

export interface ListPublicProductsFilters {
  categoryId?: string;
  search?: string;
  page?: number;
}

const publicProductInclude = {
  // isPrimary first so images[0] (what the storefront shows as the single
  // thumbnail) is always the product's actual primary image, not whichever
  // image happens to tie-break first on sortOrder alone — see
  // productRepository.ts's identical fix for the same reasoning.
  images: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
  // Only ACTIVE variants are shown to a public shopper — mirrors the same
  // "active only" rule applied to the products themselves.
  variants: { where: { status: "ACTIVE" as const } },
  category: true,
  brand: true,
};

export async function listPublicProducts(filters: ListPublicProductsFilters) {
  const page = filters.page ?? 1;

  const where = {
    status: "ACTIVE" as const,
    categoryId: filters.categoryId,
    OR: filters.search
      ? [
          { name: { contains: filters.search, mode: "insensitive" as const } },
          { sku: { contains: filters.search, mode: "insensitive" as const } },
        ]
      : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: publicProductInclude,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);

  const { productStock, variantStock } = await loadStockTotals(items.map((p) => p.id));

  return {
    items: items.map((p) => mapProduct(p, productStock, variantStock)),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getPublicProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: publicProductInclude });
  if (!product || product.status !== "ACTIVE") throw new AppError(404, "Producto no encontrado");

  const { productStock, variantStock } = await loadStockTotals([product.id]);
  return mapProduct(product, productStock, variantStock);
}
