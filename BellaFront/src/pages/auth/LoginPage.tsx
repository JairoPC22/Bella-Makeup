import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import "./LoginPage.css";

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

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
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Bella Makeup</h1>
        <p className="login-card__subtitle">Inicia sesión para continuar</p>

        <label htmlFor="username">Usuario o correo</label>
        <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />

        <label htmlFor="password">Contraseña</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="login-card__error" role="alert">{error}</p>}

        <button type="submit" disabled={submitting}>{submitting ? "Ingresando..." : "Ingresar"}</button>
      </form>
    </div>
  );
}
