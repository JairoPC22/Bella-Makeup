import { Loader2, Inbox, AlertTriangle } from "lucide-react";
import "./StatusState.css";

interface StatusStateProps {
  kind: "loading" | "empty" | "error";
  message?: string;
  /** Smaller footprint for use inside cards/widgets instead of a full page. */
  compact?: boolean;
}

const DEFAULTS: Record<StatusStateProps["kind"], string> = {
  loading: "Cargando...",
  empty: "Sin resultados por ahora.",
  error: "Ocurrió un error. Intenta de nuevo.",
};

export function StatusState({ kind, message, compact }: StatusStateProps) {
  const Icon = kind === "loading" ? Loader2 : kind === "empty" ? Inbox : AlertTriangle;
  return (
    <div className={`status-state status-state--${kind}${compact ? " status-state--compact" : ""}`}>
      <Icon size={compact ? 18 : 28} className={kind === "loading" ? "spin" : undefined} />
      <p>{message ?? DEFAULTS[kind]}</p>
    </div>
  );
}
