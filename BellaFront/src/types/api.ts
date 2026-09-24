export interface Branch {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  schedule?: string | null;
  managerName?: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface BranchRevenueRow {
  branchId: string;
  branchName: string;
  revenue: number;
  saleCount: number;
}

export interface BranchRevenueReport {
  rows: BranchRevenueRow[];
  grandTotal: number;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  assignedUsersCount: number;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  username: string;
  email: string;
  phone?: string | null;
  avatarStyle: string;
  avatarSeed: string;
  roleId: string;
  role: Role;
  status: "ACTIVE" | "DISABLED";
  allBranches: boolean;
  branches: Branch[];
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  address?: string | null;
  phone?: string | null;
  socialLinks?: Record<string, string> | null;
  logoUrl?: string | null;
  currency: string;
  description?: string | null;
  businessHours?: string | null;
  taxId?: string | null;
  website?: string | null;
  returnPolicy?: string | null;
  requirePinForDiscounts: boolean;
  requirePinForReturns: boolean;
  requirePinForShrinkage: boolean;
  allowPinForSaleCancel: boolean;
  allowPinForInventoryAdjust: boolean;
}

export interface Category {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface Brand {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  minStock: number;
  maxStock?: number | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  cost: string;
  price: string;
  promoPrice?: string | null;
  taxRate: string;
  minStock: number;
  maxStock?: number | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  images: ProductImage[];
  variants: ProductVariant[];
  category?: Category | null;
  brand?: Brand | null;
}

// GET /api/inventory devuelve la fila completa de Prisma para cada
// relación, no solo {id, name}. Aquí solo se agregan los campos que
// realmente consume el frontend (sku/minStock).
export interface InventoryRow {
  id: string;
  stock: number;
  status: "AVAILABLE" | "LOW" | "CRITICAL" | "OUT";
  product: { id: string; name: string; sku: string; minStock: number };
  variant?: { id: string; name: string; sku: string; minStock: number } | null;
  branch: { id: string; name: string };
}

// Fila de kardex — GET /api/inventory/:productId/movements. `user` es un
// subconjunto seguro para mostrar, nunca la fila completa de User.
export interface InventoryMovement {
  id: string;
  productId: string;
  variantId?: string | null;
  branchId: string;
  type: "ADJUSTMENT" | "PURCHASE" | "SALE" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN" | "ORDER";
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reference?: string | null;
  userId?: string | null;
  createdAt: string;
  branch: { id: string; name: string };
  user: { id: string; displayName: string; avatarStyle: string; avatarSeed: string } | null;
}

// ---------- Inventarios físicos parciales (conteos por categoría, marca o
// selección manual) ----------
// Refleja el include de inventoryCountRepository + mapCount de
// inventoryCountService (folio -> countNumber, diferencia por ítem).

export type InventoryCountStatus = "OPEN" | "COMPLETED" | "CANCELLED";

export interface InventoryCountItem {
  id: string;
  countId: string;
  productId: string;
  variantId?: string | null;
  // Se omite (no existe como clave) mientras el conteo está OPEN, para no
  // revelar el stock esperado antes de contar (conteo ciego). Solo aparece
  // al quedar COMPLETED o CANCELLED.
  systemStock?: number;
  // Null hasta que esta línea realmente se cuenta.
  countedStock?: number | null;
  countedAt?: string | null;
  // Calculado en el servidor (mapCount): null mientras está OPEN o sin contar.
  difference: number | null;
  product: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
}

export interface InventoryCount {
  id: string;
  folio: number;
  branchId: string;
  categoryId?: string | null;
  brandId?: string | null;
  status: InventoryCountStatus;
  notes?: string | null;
  startedByUserId: string;
  completedByUserId?: string | null;
  createdAt: string;
  completedAt?: string | null;
  branch: { id: string; name: string };
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  startedBy: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  completedBy?: { id: string; displayName: string; avatarStyle: string; avatarSeed: string } | null;
  items: InventoryCountItem[];
  // Calculado en el servidor, no se guarda.
  countNumber: string;
  itemCount: number;
  countedItemCount: number;
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
}

// La persona del otro lado de una conversación. La sucursal es solo
// contexto visual (calculado de sus branches/allBranches), nunca se
// guarda por mensaje.
export interface MessagingParty {
  id: string;
  displayName: string;
  avatarStyle: string;
  avatarSeed: string;
  role: { name: string };
  allBranches: boolean;
  branches: { id: string; name: string }[];
  lastLoginAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  author: MessagingParty;
  attachments: MessageAttachment[];
}

// Una fila de la lista de participantes de una conversación: la persona más
// su propio lastReadAt. En un 1:1, sirve para calcular el indicador "Visto".
export interface ConversationParticipant {
  user: MessagingParty;
  lastReadAt: string | null;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  name: string | null;
  participants: ConversationParticipant[];
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
  messages: Message[]; // last-message preview, same as before
}

// GET /messages/conversations/:id/messages devuelve este sobre en vez de
// un Message[] plano; `conversation.participants` alimenta el indicador
// "Visto" y la lista de participantes sin una segunda petición.
export interface ConversationMessagesResponse {
  conversation: {
    id: string;
    isGroup: boolean;
    name: string | null;
    participants: ConversationParticipant[];
  };
  messages: Message[];
}

// Forma de respuesta de GET/POST /api/customers: todos los campos salvo
// id/createdAt son nulables porque un cliente puede crearse rápido desde el
// POS con solo un nombre o un teléfono.
export interface Customer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
}

// Los campos de dinero de Sale/SaleItem/SalePayment son Decimal de Prisma
// y llegan como strings por JSON. Cada consumidor debe hacer Number(...)
// antes de operar o formatear como moneda.
export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: string;
  discount: string;
  lineTotal: string;
  product: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
}

export interface SalePayment {
  id: string;
  saleId: string;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  amount: string;
  reference?: string | null;
}

// Forma compartida entre create/list/detail/cancel. ticketNumber/
// customerName/itemCount siempre están presentes; changeDue solo aparece
// en la respuesta de POST /api/sales (createSale).
export interface Sale {
  id: string;
  folio: number;
  branchId: string;
  userId: string;
  customerId?: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  status: "COMPLETED" | "CANCELLED";
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  branch: Branch;
  user: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  customer?: Customer | null;
  items: SaleItem[];
  payments: SalePayment[];
  ticketNumber: string;
  customerName: string;
  itemCount: number;
  changeDue?: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarStyle: string; avatarSeed: string } | null;
  branch: { id: string; name: string } | null;
  details?: Record<string, unknown> | null;
}

// Forma compartida de las respuestas create/list/detail/receive/cancel.
// sourceBranch/destinationBranch son el subconjunto ligero {id,name} (la
// página cruza con la lista completa de sucursales para direcciones).
// requestedBy/receivedBy son subconjuntos seguros de usuario (sin
// passwordHash). transferNumber/itemCount se calculan en el servidor.
export interface TransferItem {
  id: string;
  transferId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  product: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
}

export interface Transfer {
  id: string;
  folio: number;
  sourceBranchId: string;
  destinationBranchId: string;
  status: "PENDING" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  requestedByUserId: string;
  receivedByUserId?: string | null;
  notes?: string | null;
  cancelReason?: string | null;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  sourceBranch: { id: string; name: string };
  destinationBranch: { id: string; name: string };
  requestedBy: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  receivedBy?: { id: string; displayName: string; avatarStyle: string; avatarSeed: string } | null;
  items: TransferItem[];
  transferNumber: string;
  itemCount: number;
}

// ---------- Tipos públicos del storefront ("la tienda en línea") ----------
// Contrato de /api/public/* (ver storefrontService.ts). Formas separadas y
// más ligeras que los tipos admin de arriba (sin `status`, `cost`,
// `taxRate`...), ya que un comprador público no necesita campos internos.

export interface PublicCategory { id: string; name: string; }
export interface PublicBrand { id: string; name: string; }
export interface PublicProductImage { id: string; url: string; }
export interface PublicProductVariant {
  id: string; name: string; sku: string;
  price: string | null; // null = uses parent product's price
  imageUrl: string | null;
  inStock: boolean;
}
export interface PublicProduct {
  id: string; sku: string; name: string; description: string | null;
  category: PublicCategory | null;
  brand: PublicBrand | null;
  price: string; // Decimal-as-string, same convention as Sale
  promoPrice: string | null;
  images: PublicProductImage[];
  variants: PublicProductVariant[];
  inStock: boolean;
}
export interface PublicProductListResponse {
  items: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
}
export interface PublicBranch {
  id: string; name: string; address: string | null; phone: string | null;
  schedule: string | null; lat: number | null; lng: number | null;
}
// GET /api/public/company: info de contacto para el storefront (botón de
// WhatsApp, mapa del footer, etc). Distinto del CompanySettings
// autenticado del panel admin; este es el modelo público más ligero.
export interface PublicCompanyInfo {
  companyName: string;
  address: string | null;
  phone: string | null;
  businessHours: string | null;
  socialLinks: { whatsapp?: string; instagram?: string } | null;
}
export interface OnlineOrderItemInput { productId: string; variantId?: string; quantity: number; }
export type OnlineOrderFulfillment =
  | { type: "PICKUP"; branchId: string }
  | { type: "DELIVERY"; branchId: string; address: string; lat?: number; lng?: number };
export interface CreateOnlineOrderInput {
  customer: { firstName: string; lastName?: string; phone: string; email?: string };
  fulfillment: OnlineOrderFulfillment;
  paymentMethod: "CASH" | "CARD" | "TRANSFER";
  items: OnlineOrderItemInput[];
  notes?: string;
}
export interface OnlineOrderItem {
  id: string; product: { id: string; name: string; sku: string }; variant: { id: string; name: string; sku: string } | null;
  quantity: number; unitPrice: string; lineTotal: string;
}
export type OnlineOrderStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export interface OnlineOrder {
  id: string; orderNumber: string; status: OnlineOrderStatus;
  customerName: string; customerPhone: string; customerEmail: string | null;
  fulfillmentType: "PICKUP" | "DELIVERY"; branch: { id: string; name: string; address: string | null };
  deliveryAddress: string | null;
  paymentMethod: "CASH" | "CARD" | "TRANSFER";
  subtotal: string; taxTotal: string; total: string;
  items: OnlineOrderItem[];
  notes: string | null;
  cancelReason: string | null;
  // Promesa de listo definida por el personal; null hasta que se define.
  estimatedReadyAt: string | null;
  // Código de verificación de 6 dígitos para recoger, se define al llegar
  // a READY. Siempre null en pedidos DELIVERY.
  pickupCode: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  // Presente solo cuando el pedido queda COMPLETED: el folio de venta real
  // ("V-000123") en que se convirtió.
  saleNumber: string | null;
}

// ---------- Compras ("purchases") ----------
// Refleja purchaseRepository.purchaseInclude + el wrapper mapPurchase de
// purchaseService.ts. `unitCost` es Decimal de Prisma y llega como string,
// misma convención que los campos de dinero de Sale.

export type SupplierStatus = "ACTIVE" | "INACTIVE";

export interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: SupplierStatus;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  variantId?: string | null;
  expectedQuantity: number;
  // Null hasta que se recibe la compra. 0 es distinto y significativo:
  // "esta línea se contó y no llegó nada".
  receivedQuantity: number | null;
  unitCost: string;
  product: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
}

export type PurchaseStatus = "PENDING" | "COMPLETED" | "RECEIVED_WITH_DISCREPANCIES" | "CANCELLED";

export interface Purchase {
  id: string;
  folio: number;
  supplierId: string;
  branchId: string;
  reference?: string | null;
  status: PurchaseStatus;
  createdByUserId: string;
  receivedByUserId?: string | null;
  notes?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  receivedAt?: string | null;
  cancelledAt?: string | null;
  updatedAt: string;
  // purchaseInclude solo selecciona estas columnas de supplier, sin createdAt.
  supplier: { id: string; name: string; contactName: string | null; phone: string | null; email: string | null; status: SupplierStatus };
  branch: { id: string; name: string };
  createdBy: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  receivedBy?: { id: string; displayName: string; avatarStyle: string; avatarSeed: string } | null;
  items: PurchaseItem[];
  // Calculado en el servidor en mapPurchase, no se guarda.
  purchaseNumber: string;
  itemCount: number;
  discrepancyCount: number;
}

// ---------- Caja (sesiones de cajón de efectivo) ----------
// Refleja cashSessionRepository.cashSessionInclude + la lista estricta de
// campos de mapSession en cashSessionService.ts. Los campos de dinero son
// Decimal de Prisma y llegan como strings, igual que los totales de Sale.

export type CashSessionStatus = "OPEN" | "CLOSED" | "CLOSED_WITH_DISCREPANCY";

// Una línea del conteo físico ciego, capturada a mano. Se guarda como
// columna JSON en el servidor, así que llega como números crudos (no
// strings de Decimal), los únicos campos numéricos de este tipo que no son string.
export interface CashBreakdownLine {
  denomination: number;
  count: number;
}

export interface CashSession {
  id: string;
  branchId: string;
  userId: string;
  openingFloat: string;
  status: CashSessionStatus;
  // La declaración ciega del propio cajero. Null mientras la sesión está
  // OPEN (claves realmente en null, a diferencia de los 4 campos de abajo).
  declaredCashBreakdown?: CashBreakdownLine[] | null;
  declaredCashTotal?: string | null;
  declaredCardTotal?: string | null;

  // ---- Solo se revelan al cerrar ----
  // OPCIONAL (no `| null`) a propósito: mapSession OMITE estas cuatro
  // claves por completo en una sesión abierta, en vez de enviarlas como
  // null, para que el cajero no pueda ver el total esperado y ajustar su
  // conteo para que coincida (el fraude que el cierre ciego busca detectar).
  // El código consumidor debe tratar `undefined` como "aún no revelado" y
  // nunca convertirlo a 0 (`Number(undefined)` es NaN y `?? 0` inventaría
  // un total que el servidor decidió no revelar).
  systemCashTotal?: string;
  systemCardTotal?: string;
  cashDifference?: string;
  cardDifference?: string;

  openedAt: string;
  closedAt?: string | null;
  branch: { id: string; name: string };
  user: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
}

// ---------- Devoluciones y cambios ----------
// Refleja returnRepository.returnInclude + mapReturn de returnService.ts.
// `originalSale` es el select acotado que realmente especifica el include
// (id/folio/total/createdAt/status/branchId), NO un Sale completo.

export type ReturnResolution = "EXACT_EXCHANGE" | "CUSTOMER_OWES" | "REFUND_OWED";
export type ReturnItemDirection = "RETURNED" | "NEW";

export interface ReturnItem {
  id: string;
  returnId: string;
  direction: ReturnItemDirection;
  // Null en líneas NEW, que no vienen de un ítem de venta original.
  saleItemId?: string | null;
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: string;
  // Solo aplica a líneas RETURNED; siempre false en las NEW.
  restocked: boolean;
  product: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
}

export interface Return {
  id: string;
  folio: number;
  originalSaleId: string;
  branchId: string;
  processedByUserId: string;
  authorizedByUserId: string;
  returnedTotal: string;
  newItemsTotal: string;
  // newItemsTotal - returnedTotal, con signo: positivo = el cliente debe,
  // negativo = se le debe reembolso, exactamente 0 = cambio parejo.
  balance: string;
  resolution: ReturnResolution;
  // Solo se guarda cuando resolution es CUSTOMER_OWES.
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "OTHER" | null;
  notes?: string | null;
  createdAt: string;
  originalSale: { id: string; folio: number; total: string; createdAt: string; status: Sale["status"]; branchId: string };
  branch: { id: string; name: string };
  processedBy: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  // El supervisor cuyo PIN coincidió. Nunca la fila completa de User (esa
  // relación lleva el pinHash bcrypt del que depende este control).
  authorizedBy: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  items: ReturnItem[];
  // Calculado en el servidor en mapReturn, no se guarda.
  returnNumber: string;
  originalTicketNumber?: string;
  returnedItemCount: number;
  newItemCount: number;
}

// ---------- Mermas (bajas por pérdida) ----------
// Refleja mermaRepository.mermaInclude + mapMerma de mermaService.ts.

export type MermaType =
  | "TESTER_EXHIBICION"
  | "DANO_EN_TIENDA"
  | "CADUCIDAD_VENCIDO"
  | "MUESTRA_REGALO_CLIENTE"
  | "DEFECTO_PROVEEDOR";

export interface MermaItem {
  id: string;
  mermaId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  // Se captura al momento de la baja, así un cambio de precio posterior
  // nunca reescribe una pérdida histórica. cost es el golpe real a P&L,
  // retail es el ingreso que se perdió.
  unitCost: string;
  unitRetail: string;
  product: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
}

export interface Merma {
  id: string;
  folio: number;
  branchId: string;
  requestedByUserId: string;
  authorizedByUserId: string;
  type: MermaType;
  comments: string;
  totalCostImpact: string;
  totalRetailImpact: string;
  createdAt: string;
  branch: { id: string; name: string };
  requestedBy: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  authorizedBy: { id: string; displayName: string; avatarStyle: string; avatarSeed: string };
  items: MermaItem[];
  // Calculado en el servidor en mapMerma, no se guarda.
  mermaNumber: string;
  itemCount: number;
  totalUnits: number;
}
