import * as repo from "../repositories/companySettingsRepository";
import { logAudit } from "./auditService";

export const getSettings = () => repo.getCompanySettings();

export async function updateSettings(input: any, actorId: string) {
  const current = await repo.getCompanySettings();
  const updated = await repo.updateCompanySettings(current.id, input);
  await logAudit({ userId: actorId, action: "settings.update", module: "settings", entityType: "company_settings", entityId: updated.id, details: { changes: input } });
  return updated;
}
