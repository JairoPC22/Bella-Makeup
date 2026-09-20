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

// Real shape returned by GET /api/inventory (see
// BellaBack/src/repositories/inventoryRepository.ts's listInventory —
// `include: { product: true, variant: true, branch: true }`) is the FULL
// Prisma row for each relation, not just `{id, name}`. Only fields actually
// consumed by a frontend page are added here (sku/minStock, needed by the
// Inventory page's table + adjustment modal); existing consumers
// (DashboardPage.tsx) only ever read `id`/`name`/`stock`/`status`, so this
// is purely additive.
export interface InventoryRow {
  id: string;
  stock: number;
  status: "AVAILABLE" | "LOW" | "CRITICAL" | "OUT";
  product: { id: string; name: string; sku: string; minStock: number };
  variant?: { id: string; name: string; sku: string; minStock: number } | null;
  branch: { id: string; name: string };
}

// Kardex row — GET /api/inventory/:productId/movements. `user` is scoped
// server-side to a display-safe subset (id/displayName/avatarStyle/
// avatarSeed), never the full User row.
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

export interface MessageAttachment {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
}

// A person on the other end of a message/conversation — the sender is
// always "whoever is logged in", so branch is display-only context here
// (computed live from the user's own branches/allBranches), never stored
// per-message.
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

// One row of a conversation's participant list — the person plus THEIR OWN
// lastReadAt on this conversation. For a 1:1 conversation, the entry whose
// user.id !== me is what the "Visto" indicator (Task 3) is built from: any
// of my own messages with createdAt <= that entry's lastReadAt has been
// seen. Present on both the conversation-list response and the
// conversation-detail (message-list) response.
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

// GET /messages/conversations/:id/messages now returns this envelope
// instead of a bare Message[] — `conversation.participants` is what powers
// the "Visto" indicator and the group participant list inside an open
// thread, without a second round trip.
export interface ConversationMessagesResponse {
  conversation: {
    id: string;
    isGroup: boolean;
    name: string | null;
    participants: ConversationParticipant[];
  };
  messages: Message[];
}

// GET /api/customers, POST /api/customers response shape — every field but
// id/createdAt is nullable since a customer can be quick-created from the
// POS with just a firstName or just a phone (see customer.validators.ts's
// createCustomerSchema .refine).
export interface Customer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
}

// Sale/SaleItem/SalePayment money fields are Prisma Decimal columns, which
// serialize over JSON as strings (e.g. "258", "129.50") — verified live
// against a real POST /api/sales response, not assumed. Every consumer
// (PosPage totals preview, SaleReceipt) must Number(...) these before doing
// arithmetic or formatting as currency.
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

// Shared shape for create/list/detail/cancel (saleRepository.ts's
// saleInclude + saleService.ts's mapSale) — ticketNumber/customerName/
// itemCount are always present; changeDue is only ever present on the
// response from POST /api/sales (createSale), omitted from list/detail/cancel.
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

// Shared shape for create/list/detail/receive/cancel responses — mirrors
// transferRepository.ts's `transferInclude` + transferService.ts's
// mapTransfer exactly (verified against prisma/schema.prisma's Transfer/
// TransferItem models, not guessed). sourceBranch/destinationBranch are
// deliberately the lighter `{id,name}` subset here (not the full Branch
// type), since that's genuinely all the include selects — the page
// cross-references the already-loaded full Branch list when it needs an
// address. requestedBy/receivedBy are display-safe user subsets, never the
// full User row (no passwordHash). transferNumber/itemCount are
// server-computed additions (formatTransferNumber(folio) and
// items.length), same convention as Sale's ticketNumber/itemCount.
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

// ---------- Public storefront ("la tienda en línea") types ----------
// Contract for the not-yet-built /api/public/* backend surface — see
// storefrontService.ts. Deliberately separate/lighter shapes than the
// admin Product/Category/Brand/Branch types above (e.g. no `status`, no
// `cost`/`taxRate`) since a public shopper never needs internal-only
// fields, and this is a distinct read model, not a reuse of the admin one.

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
  createdAt: string;
}
