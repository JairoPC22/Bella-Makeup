import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { paginationParams, buildPageResult } from "../utils/pagination";

const PAGE_SIZE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCategory(category: any) {
  return { id: category.id, name: category.name };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBrand(brand: any) {
  return { id: brand.id, name: brand.name };
}

// Al cliente no le importa QUÉ sucursal tiene stock, solo si el producto se
// puede pedir; la disponibilidad real por sucursal se revalida en el
// checkout (orderService.createOnlineOrder valida contra el branchId
// elegido). `inStock` aquí es entonces "¿alguna sucursal tiene stock > 0?",
// calculado con una sola consulta agregada por página, no N+1 consultas.
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

// Construye { productId -> stock total en todas las sucursales/variantes,
// variantId -> stock total en todas las sucursales } para exactamente los
// ids dados, en una sola consulta agrupada — usado por listPublicProducts y
// getPublicProduct para no pagar un costo N+1.
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

// Subconjunto público seguro de CompanySettings — el GET /api/settings
// autenticado expone la fila completa (incluyendo taxId, válido para staff
// pero no para una respuesta pública), así que el storefront tiene su
// propio endpoint con solo lo que necesita un footer/botón de contacto.
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
  // isPrimary primero para que images[0] (el thumbnail que muestra el
  // storefront) sea siempre la imagen primaria real del producto, no la que
  // gane el desempate solo por sortOrder — ver el mismo ajuste en
  // productRepository.ts.
  images: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
  // Solo se muestran variantes ACTIVE al público, igual regla que para los
  // productos mismos.
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
      ...paginationParams(page, PAGE_SIZE),
    }),
    prisma.product.count({ where }),
  ]);

  const { productStock, variantStock } = await loadStockTotals(items.map((p) => p.id));

  return buildPageResult(items.map((p) => mapProduct(p, productStock, variantStock)), total, page, PAGE_SIZE);
}

export async function getPublicProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: publicProductInclude });
  if (!product || product.status !== "ACTIVE") throw new AppError(404, "Producto no encontrado");

  const { productStock, variantStock } = await loadStockTotals([product.id]);
  return mapProduct(product, productStock, variantStock);
}
