import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Camera, Share2, MessageCircle, CheckCircle2, FileText, Globe, Receipt, Link2, Undo2, Settings, Users, ShieldCheck, ScrollText, CircleUserRound, KeyRound, Tag, RotateCcw, PackageX, Ban, SlidersHorizontal } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { usePermission } from "../../hooks/usePermission";
import { UsersPage } from "../users/UsersPage";
import { RolesPage } from "../roles/RolesPage";
import { AuditPage } from "../audit/AuditPage";
import { ProfilePage } from "../profile/ProfilePage";
import * as settingsService from "../../services/companySettingsService";
import type { CompanySettings } from "../../types/api";
import "./CompanySettingsPage.css";
import "./SettingsPage.css";

// socialLinks is a flexible JSON bag on the backend (no dedicated columns
// per network) — these are the three keys this form reads/writes from it.
const SOCIAL_KEYS = ["instagram", "facebook", "whatsapp"] as const;
type SocialKey = (typeof SOCIAL_KEYS)[number];

type TabKey = "general" | "usuarios" | "roles" | "actividad" | "perfil";

function CompanySettingsTab() {
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
        requirePinForDiscounts: settings.requirePinForDiscounts,
        requirePinForReturns: settings.requirePinForReturns,
        requirePinForShrinkage: settings.requirePinForShrinkage,
        allowPinForSaleCancel: settings.allowPinForSaleCancel,
        allowPinForInventoryAdjust: settings.allowPinForInventoryAdjust,
      });
      setSettings(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  // Vuelve los cinco interruptores a su valor de fábrica (no guarda solo):
  // el primer grupo queda obligatorio, el segundo queda sin atajo de PIN.
  function resetPinDefaults() {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            requirePinForDiscounts: true,
            requirePinForReturns: true,
            requirePinForShrinkage: true,
            allowPinForSaleCancel: false,
            allowPinForInventoryAdjust: false,
          }
        : prev
    );
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !settings) return <StatusState kind="error" message="No se pudo cargar la configuración." />;

  return (
    <div className="settings-general-layout">
      <div className="settings-general-layout__form">
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
              <Select value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
                <option value="MXN">MXN — Peso mexicano</option>
                <option value="USD">USD — Dólar estadounidense</option>
                <option value="EUR">EUR — Euro</option>
                <option value="COP">COP — Peso colombiano</option>
              </Select>
            </label>
            <label>Dirección<input value={settings.address ?? ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></label>
            <label>
              Teléfono
              <input
                type="tel"
                inputMode="numeric"
                placeholder="555 123 4567"
                value={settings.phone ?? ""}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value.replace(/[^\d\s+()-]/g, "") })}
              />
              <small className="settings-section__hint">Solo números (puedes usar espacios, guiones o +).</small>
            </label>
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

        <section className="settings-section settings-section--pin">
          <header className="settings-section__header">
            <KeyRound size={18} />
            <div>
              <h2>Autorización con PIN de supervisor</h2>
              <p>
                El PIN es un co-firma: un supervisor lo teclea en la pantalla de otra persona para
                autorizar una acción puntual, sin cerrar su sesión ni la de nadie más.
              </p>
            </div>
            <button type="button" className="settings-section__reset" onClick={resetPinDefaults}>
              <RotateCcw size={13} /> Restaurar valores de fábrica
            </button>
          </header>

          <div className="settings-section__pin-group">
            <p className="settings-section__pin-group-title">
              Acciones que ya son parte del flujo normal — el PIN es la segunda confirmación
            </p>
            <p className="settings-section__pin-group-hint">
              Si desactivas una, esa acción ya no pide ninguna confirmación: queda enteramente a cargo
              de quien la realiza.
            </p>
            <div className="settings-section__pin-toggles">
              <label className="settings-section__toggle-row">
                <input
                  type="checkbox"
                  checked={settings.requirePinForDiscounts}
                  onChange={(e) => setSettings({ ...settings, requirePinForDiscounts: e.target.checked })}
                />
                <Tag size={16} className="settings-section__toggle-icon" />
                <span>
                  <strong>Descuentos grandes en el punto de venta</strong>
                  <small>Un descuento que supera el límite propio del cajero exige el PIN de un supervisor.</small>
                </span>
                <span className={`settings-section__toggle-badge${settings.requirePinForDiscounts ? " is-on" : ""}`}>
                  {settings.requirePinForDiscounts ? "Exigido" : "Libre"}
                </span>
              </label>
              <label className="settings-section__toggle-row">
                <input
                  type="checkbox"
                  checked={settings.requirePinForReturns}
                  onChange={(e) => setSettings({ ...settings, requirePinForReturns: e.target.checked })}
                />
                <Undo2 size={16} className="settings-section__toggle-icon" />
                <span>
                  <strong>Devoluciones y cambios</strong>
                  <small>Toda devolución exige el PIN de alguien con permiso para autorizarla.</small>
                </span>
                <span className={`settings-section__toggle-badge${settings.requirePinForReturns ? " is-on" : ""}`}>
                  {settings.requirePinForReturns ? "Exigido" : "Libre"}
                </span>
              </label>
              <label className="settings-section__toggle-row">
                <input
                  type="checkbox"
                  checked={settings.requirePinForShrinkage}
                  onChange={(e) => setSettings({ ...settings, requirePinForShrinkage: e.target.checked })}
                />
                <PackageX size={16} className="settings-section__toggle-icon" />
                <span>
                  <strong>Registro de mermas</strong>
                  <small>Toda merma exige el PIN de alguien con permiso para autorizarla.</small>
                </span>
                <span className={`settings-section__toggle-badge${settings.requirePinForShrinkage ? " is-on" : ""}`}>
                  {settings.requirePinForShrinkage ? "Exigido" : "Libre"}
                </span>
              </label>
            </div>
          </div>

          <div className="settings-section__pin-group">
            <p className="settings-section__pin-group-title">
              Acciones restringidas a un permiso — el PIN es un atajo, no un requisito nuevo
            </p>
            <p className="settings-section__pin-group-hint">
              Estas acciones ya están limitadas a quien tiene el permiso correspondiente. Activarlas no
              quita esa restricción: solo agrega la posibilidad de que un supervisor la autorice con su
              PIN en el mostrador, en vez de tener que iniciar sesión él mismo. Desactivada (su valor de
              fábrica), la acción sigue siendo exclusiva de quien ya tiene el permiso.
            </p>
            <div className="settings-section__pin-toggles">
              <label className="settings-section__toggle-row">
                <input
                  type="checkbox"
                  checked={settings.allowPinForSaleCancel}
                  onChange={(e) => setSettings({ ...settings, allowPinForSaleCancel: e.target.checked })}
                />
                <Ban size={16} className="settings-section__toggle-icon" />
                <span>
                  <strong>Cancelar una venta</strong>
                  <small>Deja que un cajero sin el permiso cancele una venta con el PIN de un supervisor presente.</small>
                </span>
                <span className={`settings-section__toggle-badge${settings.allowPinForSaleCancel ? " is-on" : ""}`}>
                  {settings.allowPinForSaleCancel ? "Con atajo" : "Solo permiso"}
                </span>
              </label>
              <label className="settings-section__toggle-row">
                <input
                  type="checkbox"
                  checked={settings.allowPinForInventoryAdjust}
                  onChange={(e) => setSettings({ ...settings, allowPinForInventoryAdjust: e.target.checked })}
                />
                <SlidersHorizontal size={16} className="settings-section__toggle-icon" />
                <span>
                  <strong>Ajustar inventario</strong>
                  <small>Deja que alguien sin el permiso corrija el stock con el PIN de un supervisor presente.</small>
                </span>
                <span className={`settings-section__toggle-badge${settings.allowPinForInventoryAdjust ? " is-on" : ""}`}>
                  {settings.allowPinForInventoryAdjust ? "Con atajo" : "Solo permiso"}
                </span>
              </label>
            </div>
          </div>
        </section>

        <div className="settings-form__actions">
          <button type="submit" disabled={saveState === "saving"}>{saveState === "saving" ? "Guardando..." : "Guardar cambios"}</button>
          {saveState === "saved" && <p className="settings-card__success"><CheckCircle2 size={14} /> Cambios guardados.</p>}
          {saveState === "error" && <p className="settings-card__error">No se pudo guardar. Intenta de nuevo.</p>}
        </div>
      </form>
      </div>

      <aside className="settings-preview">
        <p className="settings-preview__eyebrow">Vista previa</p>
        <div className="settings-preview__card">
          <div className="settings-preview__brand">
            <Building2 size={20} />
            <span>{settings.companyName || "Nombre comercial"}</span>
          </div>
          {settings.description && <p className="settings-preview__tagline">{settings.description}</p>}
          <ul className="settings-preview__facts">
            {settings.address && <li>{settings.address}</li>}
            {settings.phone && <li>{settings.phone}</li>}
            {settings.businessHours && <li>{settings.businessHours}</li>}
            {settings.website && <li>{settings.website}</li>}
          </ul>
          {(settings.socialLinks?.instagram || settings.socialLinks?.facebook || settings.socialLinks?.whatsapp) && (
            <div className="settings-preview__socials">
              {settings.socialLinks?.instagram && <span title="Instagram"><Camera size={14} /></span>}
              {settings.socialLinks?.facebook && <span title="Facebook"><Share2 size={14} /></span>}
              {settings.socialLinks?.whatsapp && <span title="WhatsApp"><MessageCircle size={14} /></span>}
            </div>
          )}
        </div>
        <p className="settings-preview__hint">Así se verán tus datos generales en materiales y pantallas orientadas al cliente. Se actualiza mientras escribes.</p>
      </aside>
    </div>
  );
}

// Configuración agrupa ajustes de empresa y las listas de Usuarios/Roles
// (antes con su propia entrada en el sidebar) como pestañas, solo por
// organización; cada una sigue protegida por su propio permiso. "Mi perfil"
// siempre está disponible para cualquier usuario autenticado, aunque no
// tenga ningún otro permiso, para que nunca llegue a un callejón sin salida.
export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasGeneral = usePermission("settings.manage");
  const hasUsers = usePermission("users.view");
  const hasRoles = usePermission("roles.view");
  const hasAudit = usePermission("audit.view");

  const tabs: { key: TabKey; label: string; icon: typeof Settings }[] = [
    { key: "perfil", label: "Mi perfil", icon: CircleUserRound },
    ...(hasGeneral ? [{ key: "general" as const, label: "General", icon: Settings }] : []),
    ...(hasUsers ? [{ key: "usuarios" as const, label: "Usuarios", icon: Users }] : []),
    ...(hasRoles ? [{ key: "roles" as const, label: "Roles", icon: ShieldCheck }] : []),
    // "Actividad" va justo después de Roles: es la bitácora de auditoría.
    ...(hasAudit ? [{ key: "actividad" as const, label: "Actividad", icon: ScrollText }] : []),
  ];

  const requested = searchParams.get("tab") as TabKey | null;
  const active: TabKey = (requested && tabs.some((t) => t.key === requested)) ? requested : (tabs[0]?.key ?? "perfil");

  function selectTab(key: TabKey) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", key);
      return next;
    });
  }

  return (
    <div className="settings-page">
      <h1>Configuración</h1>
      <p className="settings-page__subtitle">Datos de la empresa, usuarios, roles y actividad del sistema.</p>

      <div className="settings-tabs" role="tablist">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`settings-tabs__tab${active === key ? " is-active" : ""}`}
            onClick={() => selectTab(key)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="settings-tabs__panel">
        {active === "perfil" && <ProfilePage embedded />}
        {active === "general" && hasGeneral && <CompanySettingsTab />}
        {active === "usuarios" && hasUsers && <UsersPage embedded />}
        {active === "roles" && hasRoles && <RolesPage embedded />}
        {active === "actividad" && hasAudit && <AuditPage embedded />}
      </div>
    </div>
  );
}
