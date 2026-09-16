import { createAuditLog, findAuditLogs, AuditFilters } from "../repositories/auditRepository";

export interface LogAuditInput {
  userId: string | null;
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  branchId?: string;
  details?: Record<string, unknown>;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  await createAuditLog({
    userId: input.userId ?? undefined,
    action: input.action,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    branchId: input.branchId,
    details: input.details as any,
  });
}

export async function listAudit(filters: AuditFilters) {
  return findAuditLogs(filters);
}
