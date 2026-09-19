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

export interface InventoryRow {
  id: string;
  stock: number;
  status: "AVAILABLE" | "LOW" | "CRITICAL" | "OUT";
  product: { id: string; name: string };
  variant?: { id: string; name: string } | null;
  branch: { id: string; name: string };
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface BranchMessage {
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; avatarStyle: string; avatarSeed: string } | null;
  fromBranch: { id: string; name: string };
  attachments: MessageAttachment[];
}

// lastActivityAt is the most recent lastLoginAt among every user who can
// act as this branch (explicit UserBranch assignment, union any
// allBranches:true user) — null if nobody matching either group has ever
// logged in.
export interface MessagingBranch {
  id: string;
  name: string;
  lastActivityAt: string | null;
}

export interface Conversation {
  id: string;
  branchAId: string;
  branchBId: string;
  branchA: MessagingBranch;
  branchB: MessagingBranch;
  createdAt: string;
  updatedAt: string;
  messages: BranchMessage[];
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
