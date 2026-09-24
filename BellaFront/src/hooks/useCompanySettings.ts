import { useEffect, useState } from "react";
import * as companySettingsService from "../services/companySettingsService";
import type { CompanySettings } from "../types/api";

// GET /api/company-settings solo exige sesión (no un permiso específico):
// cualquier pantalla que necesite saber si el negocio exige PIN de
// supervisor para descuentos/devoluciones/mermas puede usar este hook.
export function useCompanySettings(): CompanySettings | null {
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  useEffect(() => {
    companySettingsService.getCompanySettings().then(setSettings).catch(() => {});
  }, []);

  return settings;
}
