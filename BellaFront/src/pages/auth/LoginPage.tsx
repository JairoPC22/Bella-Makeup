import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, UserRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import "./LoginPage.css";

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/admin" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <aside className="login-brand" aria-hidden="true">
        <div className="login-brand__glow" />
        <div className="login-brand__grid" />
        <div className="login-brand__content">
          <span className="login-brand__eyebrow">Panel administrativo</span>
          <img src="/brand/monogram-transparent.png" alt="Bella Makeup" className="login-brand__logo" />
          <p className="login-brand__tagline">
            Sucursales, equipos y operación diaria, todo en una sola cuenta.
          </p>
        </div>
        <p className="login-brand__footnote">Bella Makeup &copy; {new Date().getFullYear()}</p>
      </aside>

      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form__header">
            <img src="/brand/monogram-transparent.png" alt="Bella Makeup" className="login-form__brand-mobile" />
            <h2>Bienvenida de nuevo</h2>
            <p className="login-form__subtitle">Ingresa tus credenciales para continuar.</p>
          </div>

          <div className="login-field">
            <label htmlFor="username">Usuario o correo</label>
            <div className="login-field__control">
              <UserRound size={18} className="login-field__icon" aria-hidden="true" />
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="password">Contraseña</label>
            <div className="login-field__control login-field__control--with-toggle">
              <Lock size={18} className="login-field__icon" aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-field__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="login-form__error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}

          <button type="submit" className="login-form__submit" disabled={submitting}>
            {submitting && <Loader2 size={18} className="login-form__spinner" aria-hidden="true" />}
            <span>{submitting ? "Ingresando..." : "Ingresar"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
