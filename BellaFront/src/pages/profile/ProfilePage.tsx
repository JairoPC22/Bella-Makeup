import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { AvatarPicker } from "../../components/profile/AvatarPicker";
import * as profileService from "../../services/profileService";
import { ApiError } from "../../services/apiClient";
import type { User } from "../../types/api";
import "./ProfilePage.css";

export function ProfilePage() {
  const { user: sessionUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", displayName: "", email: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);
    try {
      await profileService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordMessage({ type: "success", text: "Contraseña actualizada." });
      setPasswordForm({ currentPassword: "", newPassword: "" });
    } catch (err) {
      setPasswordMessage({ type: "error", text: err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña" });
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !user) return <StatusState kind="error" message="No se pudo cargar tu perfil." />;

  return (
    <div className="profile-page">
      <h1>Mi perfil</h1>

      <section className="profile-card">
        <div className="profile-card__header">
          <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="lg" />
          <div>
            <h2>{user.displayName}</h2>
            <p>{user.role.name}{sessionUser?.allBranches ? " · Todas las sucursales" : ""}</p>
          </div>
        </div>
        <AvatarPicker user={user} onChanged={setUser} />
      </section>

      <form className="profile-card" onSubmit={handleSave}>
        <h2>Datos personales</h2>
        <label>Nombre<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
        <label>Apellido<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
        <label>Nombre mostrado<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
        <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <button type="submit" disabled={saveState === "saving"}>Guardar cambios</button>
        {saveState === "saved" && <p className="profile-card__success">Cambios guardados.</p>}
        {saveState === "error" && <p className="profile-card__error">No se pudo guardar. Intenta de nuevo.</p>}
      </form>

      <form className="profile-card" onSubmit={handlePasswordChange}>
        <h2>Cambiar contraseña</h2>
        <label>Contraseña actual<input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required /></label>
        <label>Nueva contraseña<input type="password" minLength={8} value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required /></label>
        <button type="submit">Actualizar contraseña</button>
        {passwordMessage && <p className={passwordMessage.type === "success" ? "profile-card__success" : "profile-card__error"}>{passwordMessage.text}</p>}
      </form>
    </div>
  );
}
