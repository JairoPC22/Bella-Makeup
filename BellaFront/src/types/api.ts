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
  type: "ADJUSTMENT" | "PURCHASE" | "SALE" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN";
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
