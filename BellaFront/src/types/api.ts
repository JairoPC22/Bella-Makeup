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
