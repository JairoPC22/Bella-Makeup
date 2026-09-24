import { KeyRound, Loader2, AlertTriangle } from "lucide-react";
import "./PinAuthPrompt.css";

/**
 * Panel de co-firma con PIN de supervisor: el cajero sigue con su sesión
 * abierta y el supervisor teclea 4-6 dígitos en la misma pantalla para
 * autorizar la acción. No es un cambio de sesión, solo una co-firma.
 *
 * Este componente NO llama a `/api/auth/verify-pin` directamente: los
 * consumidores (`createReturn`, `createMerma`) envían `pinCode` en su propia
 * petición y el servidor lo valida dentro de la misma transacción. Así se
 * evita una ventana entre "PIN verificado" y "acción ejecutada".
 *
 * Se renderiza inline (no como `Modal`) porque los flujos que lo usan ya
 * están dentro de un Modal propio, y anidar modales complica el foco y Escape.
 */
export function PinAuthPrompt({
  value,
  onChange,
  onSubmit,
  submitLabel,
  submittingLabel,
  error,
  busy = false,
  disabled = false,
  description,
}: {
  value: string;
  onChange: (pin: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  submittingLabel: string;
  /** Mensaje de error de la petición fallida del padre, se muestra tal cual. */
  error?: string | null;
  busy?: boolean;
  /** Validez del resto del formulario (ajena al PIN), para deshabilitar el envío hasta que todo esté listo. */
  disabled?: boolean;
  /** Contexto opcional de una línea, ej. qué acción se está autorizando. */
  description?: string;
}) {
  // Solo 4-6 dígitos (igual que PIN_REGEX en el servidor). Se filtran los
  // caracteres no numéricos en silencio en vez de mostrar un error.
  function handleChange(raw: string) {
    onChange(raw.replace(/\D/g, "").slice(0, 6));
  }

  const canSubmit = value.length >= 4 && !busy && !disabled;

  return (
    <div className="pin-auth">
      <div className="pin-auth__head">
        <KeyRound size={15} />
        <p className="pin-auth__title">Autorización de supervisor</p>
      </div>
      {description && <p className="pin-auth__description">{description}</p>}

      <label className="pin-auth__field">
        <span>PIN de autorización de supervisor</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          // El navegador nunca debe recordar esto: un PIN autocompletado
          // anularía la garantía de que hubo una persona presente.
          name="supervisor-pin"
          placeholder="••••"
          maxLength={6}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </label>

      {/* El servidor devuelve un mensaje genérico único para cualquier fallo
          (por seguridad, para no revelar la estructura organizacional), así
          que aquí solo se muestra tal cual, sin agregar pistas adicionales. */}
      {error && (
        <p className="pin-auth__error" role="alert">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      <button type="button" className="pin-auth__submit" onClick={onSubmit} disabled={!canSubmit}>
        {busy ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}
        {busy ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
