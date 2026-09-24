// Adaptado de React Bits (reactbits.dev) — CodeSlots. Portado a
// TypeScript; reconstruido sobre `motion` para el feedback de relleno/shake
// por casilla, siguiendo el mismo criterio de "un solo motor de animación"
// que RubberSegment/HoldButton/RevealWords/PeekRating.
//
// Se usa exactamente donde se necesita ingresar un código numérico de
// longitud fija — el código de verificación de recogida de pedido (ver
// `Order.pickupCode` y orderService.updateOrderStatus en BellaBack). NO se
// usa para el PIN de supervisor en PinAuthPrompt.tsx: ese PIN es
// deliberadamente de longitud variable (4-6 dígitos) y usa un input de
// password nativo que el navegador nunca debe recordar — forzarlo a 6
// casillas fijas implicaría cambiar esa regla de negocio o simular una UX
// equivalente, algo que no le corresponde decidir a este componente.
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import "./CodeSlots.css";

interface Props {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function CodeSlots({ length = 6, value, onChange, onComplete, error = false, disabled = false, autoFocus = false }: Props) {
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);

  function setDigit(index: number, char: string) {
    const next = digits.slice();
    next[index] = char;
    const joined = next.join("").slice(0, length);
    onChange(joined);
    if (joined.length === length) onComplete?.(joined);
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, char);
    if (char && index < length - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
      setDigit(index - 1, "");
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    if (pasted.length === length) onComplete?.(pasted);
    inputsRef.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className={`code-slots${error ? " code-slots--error" : ""}`} role="group" aria-label={`Código de ${length} dígitos`}>
      {digits.map((digit, i) => (
        <motion.input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          className="code-slots__input"
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onFocus={() => setFocused(i)}
          onBlur={() => setFocused((f) => (f === i ? null : f))}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          animate={error ? { x: [0, -6, 6, -4, 4, 0] } : digit ? { scale: [1.15, 1] } : { scale: 1 }}
          transition={error ? { duration: 0.4 } : { duration: 0.18 }}
          data-filled={digit ? "true" : undefined}
          data-focused={focused === i ? "true" : undefined}
        />
      ))}
    </div>
  );
}
