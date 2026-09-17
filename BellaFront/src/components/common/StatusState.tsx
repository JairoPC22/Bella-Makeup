import { Loader2, Inbox, AlertTriangle } from "lucide-react";
import "./StatusState.css";

interface StatusStateProps {
  kind: "loading" | "empty" | "error";
  message?: string;
}

const DEFAULTS: Record<StatusStateProps["kind"], string> = {
  loading: "Cargando...",
  empty: "Sin resultados por ahora.",
  error: "Ocurrió un error. Intenta de nuevo.",
};

export function StatusState({ kind, message }: StatusStateProps) {
  const Icon = kind === "loading" ? Loader2 : kind === "empty" ? Inbox : AlertTriangle;
  return (
    <div className={`status-state status-state--${kind}`}>
      <Icon size={28} className={kind === "loading" ? "spin" : undefined} />
      <p>{message ?? DEFAULTS[kind]}</p>
    </div>
  );
}
