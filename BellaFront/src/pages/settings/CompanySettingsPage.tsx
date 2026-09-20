import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, Camera, Share2, MessageCircle, CheckCircle2, FileText, Globe, Receipt, Link2, Undo2, ScrollText, ArrowUpRight } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { PermissionGate } from "../../components/auth/PermissionGate";
import * as settingsService from "../../services/companySettingsService";
import type { CompanySettings } from "../../types/api";
import "./CompanySettingsPage.css";

// socialLinks is a flexible JSON bag on the backend (no dedicated columns
// per network) — these are the three keys this form reads/writes from it.
const SOCIAL_KEYS = ["instagram", "facebook", "whatsapp"] as const;
type SocialKey = (typeof SOCIAL_KEYS)[number];

export function CompanySettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    settingsService.getCompanySettings()
      .then((s) => { setSettings(s); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  function setSocial(key: SocialKey, value: string) {
    setSettings((prev) => (prev ? { ...prev, socialLinks: { ...prev.socialLinks, [key]: value } } : prev));
  }

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
        description: settings.description ?? undefined,
        businessHours: settings.businessHours ?? undefined,
        socialLinks: settings.socialLinks ?? undefined,
        taxId: settings.taxId ?? undefined,
        website: settings.website ?? undefined,
        returnPolicy: settings.returnPolicy ?? undefined,
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
      <p className="settings-page__subtitle">Datos generales, identidad y canales de contacto de la empresa.</p>

      <form className="settings-form" onSubmit={handleSubmit}>
        <section className="settings-section">
          <header className="settings-section__header">
            <Building2 size={18} />
            <div>
              <h2>Información general</h2>
              <p>Nombre comercial, dirección y moneda de operación.</p>
            </div>
          </header>
          <div className="settings-section__grid">
            <label>Nombre comercial<input value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} required /></label>
            <label>Moneda
              <select value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
                <option value="MXN">MXN — Peso mexicano</option>
                <option value="USD">USD — Dólar estadounidense</option>
                <option value="EUR">EUR — Euro</option>
                <option value="COP">COP — Peso colombiano</option>
              </select>
            </label>
            <label>Dirección<input value={settings.address ?? ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></label>
            <label>Teléfono<input value={settings.phone ?? ""} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></label>
            <label>
              <span className="settings-section__label-with-icon"><Receipt size={14} /> RFC / Identificación fiscal</span>
              <input placeholder="XAXX010101000" value={settings.taxId ?? ""} onChange={(e) => setSettings({ ...settings, taxId: e.target.value })} />
            </label>
            <label>
              <span className="settings-section__label-with-icon"><Link2 size={14} /> Sitio web</span>
              <input placeholder="https://bellamakeup.com" value={settings.website ?? ""} onChange={(e) => setSettings({ ...settings, website: e.target.value })} />
            </label>
            <label className="settings-section__span2">Horario de atención
              <input placeholder="Lun–Sáb 9:00–19:00" value={settings.businessHours ?? ""} onChange={(e) => setSettings({ ...settings, businessHours: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <header className="settings-section__header">
            <FileText size={18} />
            <div>
              <h2>Identidad y políticas</h2>
              <p>Una breve descripción de marca y la política de devoluciones que verán los clientes.</p>
            </div>
          </header>
          <div className="settings-section__grid">
            <label className="settings-section__span2">Descripción / eslogan
              <textarea
                maxLength={500}
                rows={3}
                placeholder="Belleza y cuidado personal para cada momento."
                value={settings.description ?? ""}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
              />
            </label>
            <label className="settings-section__span2">
              <span className="settings-section__label-with-icon"><Undo2 size={14} /> Política de devoluciones</span>
              <textarea
                maxLength={1000}
                rows={3}
                placeholder="Cambios y devoluciones dentro de los primeros 15 días con ticket de compra."
                value={settings.returnPolicy ?? ""}
                onChange={(e) => setSettings({ ...settings, returnPolicy: e.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <header className="settings-section__header">
            <Globe size={18} />
            <div>
              <h2>Redes sociales y contacto</h2>
              <p>Enlaces que aparecerán en materiales orientados al cliente.</p>
            </div>
          </header>
          <div className="settings-section__grid">
            <label>
              <span className="settings-section__label-with-icon"><Camera size={14} /> Instagram</span>
              <input placeholder="https://instagram.com/bellamakeup" value={settings.socialLinks?.instagram ?? ""} onChange={(e) => setSocial("instagram", e.target.value)} />
            </label>
            <label>
              <span className="settings-section__label-with-icon"><Share2 size={14} /> Facebook</span>
              <input placeholder="https://facebook.com/bellamakeup" value={settings.socialLinks?.facebook ?? ""} onChange={(e) => setSocial("facebook", e.target.value)} />
            </label>
            <label>
              <span className="settings-section__label-with-icon"><MessageCircle size={14} /> WhatsApp</span>
              <input placeholder="+52 55 1234 5678" value={settings.socialLinks?.whatsapp ?? ""} onChange={(e) => setSocial("whatsapp", e.target.value)} />
            </label>
          </div>
        </section>

        <div className="settings-form__actions">
          <button type="submit" disabled={saveState === "saving"}>{saveState === "saving" ? "Guardando..." : "Guardar cambios"}</button>
          {saveState === "saved" && <p className="settings-card__success"><CheckCircle2 size={14} /> Cambios guardados.</p>}
          {saveState === "error" && <p className="settings-card__error">No se pudo guardar. Intenta de nuevo.</p>}
        </div>
      </form>

      <PermissionGate code="audit.view">
        <section className="settings-section">
          <header className="settings-section__header">
            <ScrollText size={18} />
            <div>
              <h2>Actividad reciente</h2>
              <p>Historial completo de acciones realizadas en el sistema.</p>
            </div>
          </header>
          <Link to="/admin/auditoria" className="settings-section__audit-link">
            Ver actividad reciente
            <ArrowUpRight size={16} />
          </Link>
        </section>
      </PermissionGate>
    </div>
  );
}
