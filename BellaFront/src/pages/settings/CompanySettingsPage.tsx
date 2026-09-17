import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { StatusState } from "../../components/common/StatusState";
import * as settingsService from "../../services/companySettingsService";
import type { CompanySettings } from "../../types/api";
import "./CompanySettingsPage.css";

export function CompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    settingsService.getCompanySettings()
      .then((s) => { setSettings(s); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaveState("saving");
    try {
      const updated = await settingsService.updateCompanySettings({
        companyName: settings.companyName,
        address: settings.address ?? undefined,
        phone: settings.phone ?? undefined,
        currency: settings.currency,
      });
      setSettings(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !settings) return <StatusState kind="error" message="No se pudo cargar la configuración." />;

  return (
    <div className="settings-page">
      <h1>Configuración de la empresa</h1>
      <form className="settings-card" onSubmit={handleSubmit}>
        <label>Nombre comercial<input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} required /></label>
        <label>Dirección<input value={settings.address ?? ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></label>
        <label>Teléfono<input value={settings.phone ?? ""} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></label>
        <label>Moneda<input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} /></label>
        <button type="submit" disabled={saveState === "saving"}>Guardar cambios</button>
        {saveState === "saved" && <p className="settings-card__success">Cambios guardados.</p>}
        {saveState === "error" && <p className="settings-card__error">No se pudo guardar. Intenta de nuevo.</p>}
      </form>
    </div>
  );
}
