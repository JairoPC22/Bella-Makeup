import { type FormEvent, useEffect, useState } from "react";
import { IdCard, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { AvatarPicker } from "../../components/profile/AvatarPicker";
import * as profileService from "../../services/profileService";
import { ApiError } from "../../services/apiClient";
import type { User } from "../../types/api";
import "./ProfilePage.css";

export function ProfilePage({ embedded = false }: { embedded?: boolean }) {
  const { updateUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", displayName: "", email: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pinForm, setPinForm] = useState({ pin: "", currentPassword: "" });
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    profileService
      .getProfile()
      .then((u) => {
        setUser(u);
        setForm({ firstName: u.firstName, lastName: u.lastName, displayName: u.displayName, email: u.email, phone: u.phone ?? "" });
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    try {
      const updated = await profileService.updateProfile(form);
      setUser(updated);
      updateUser(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordSaving(true);
    try {
      await profileService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordMessage({ type: "success", text: "Contraseña actualizada." });
      setPasswordForm({ currentPassword: "", newPassword: "" });
    } catch (err) {
      setPasswordMessage({ type: "error", text: err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña" });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSetPin(e: FormEvent) {
    e.preventDefault();
    setPinMessage(null);
    setPinSaving(true);
    try {
      await profileService.setOwnPin(pinForm.pin, pinForm.currentPassword);
      setPinMessage({ type: "success", text: "PIN actualizado." });
      setPinForm({ pin: "", currentPassword: "" });
    } catch (err) {
      setPinMessage({ type: "error", text: err instanceof ApiError ? err.message : "No se pudo guardar el PIN" });
    } finally {
      setPinSaving(false);
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !user) return <StatusState kind="error" message="No se pudo cargar tu perfil." />;

  return (
    <div className="profile-page">
      {!embedded && (
        <>
          <h1>Mi perfil</h1>
          <p className="profile-page__subtitle">Tus datos personales, avatar y seguridad de la cuenta.</p>
        </>
      )}

      <section className="profile-card profile-card--identity">
        <div className="profile-card__header">
          <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="lg" />
          <div>
            <h2>{user.displayName}</h2>
            <p className="profile-card__role">{user.role.name}{user.allBranches ? " · Todas las sucursales" : ""}</p>
          </div>
        </div>
        <AvatarPicker
          user={user}
          onChanged={(updated) => {
            setUser(updated);
            updateUser(updated);
          }}
        />
      </section>

      <form className="profile-card" onSubmit={handleSave}>
        <header className="profile-card__section-header">
          <IdCard size={18} />
          <div>
            <h2>Datos personales</h2>
            <p>Información de contacto asociada a tu cuenta.</p>
          </div>
        </header>
        <div className="profile-card__grid">
          <label>Nombre<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
          <label>Apellido<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
          <label className="profile-card__span2">Nombre mostrado<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
          <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>
            Teléfono
            <input
              type="tel"
              inputMode="numeric"
              placeholder="555 123 4567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d\s+()-]/g, "") })}
            />
            <small className="profile-card__hint">Solo números (puedes usar espacios, guiones o +).</small>
          </label>
        </div>
        <div className="profile-card__actions">
          <button type="submit" disabled={saveState === "saving"}>{saveState === "saving" ? "Guardando..." : "Guardar cambios"}</button>
          {saveState === "saved" && <p className="profile-card__success">Cambios guardados.</p>}
          {saveState === "error" && <p className="profile-card__error">No se pudo guardar. Intenta de nuevo.</p>}
        </div>
      </form>

      <form className="profile-card" onSubmit={handlePasswordChange}>
        <header className="profile-card__section-header">
          <KeyRound size={18} />
          <div>
            <h2>Cambiar contraseña</h2>
            <p>Usa una contraseña de al menos 8 caracteres que no compartas con otras cuentas.</p>
          </div>
        </header>
        <div className="profile-card__grid">
          <label>Contraseña actual<input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required /></label>
          <label>Nueva contraseña<input type="password" minLength={8} value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required /></label>
        </div>
        <div className="profile-card__actions">
          <button type="submit" disabled={passwordSaving}>{passwordSaving ? "Actualizando..." : "Actualizar contraseña"}</button>
          {passwordMessage && <p className={passwordMessage.type === "success" ? "profile-card__success" : "profile-card__error"}>{passwordMessage.text}</p>}
        </div>
      </form>

      <form className="profile-card" onSubmit={handleSetPin}>
        <header className="profile-card__section-header">
          <ShieldCheck size={18} />
          <div>
            <h2>PIN de supervisor</h2>
            <p>
              Solo necesario si vas a autorizar acciones de otra persona (devoluciones, mermas, descuentos)
              tecleando tu PIN en su pantalla. No es tu contraseña de acceso.
            </p>
          </div>
        </header>
        <div className="profile-card__grid">
          <label>
            Contraseña actual
            <input
              type="password"
              value={pinForm.currentPassword}
              onChange={(e) => setPinForm({ ...pinForm, currentPassword: e.target.value })}
              required
            />
          </label>
          <label>
            Nuevo PIN (4 a 6 dígitos)
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pinForm.pin}
              onChange={(e) => setPinForm({ ...pinForm, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              required
            />
          </label>
        </div>
        <div className="profile-card__actions">
          <button type="submit" disabled={pinSaving || pinForm.pin.length < 4}>
            {pinSaving ? "Guardando..." : "Guardar PIN"}
          </button>
          {pinMessage && <p className={pinMessage.type === "success" ? "profile-card__success" : "profile-card__error"}>{pinMessage.text}</p>}
        </div>
      </form>
    </div>
  );
}
