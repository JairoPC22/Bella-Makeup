// Selector de calificación de 5 estrellas donde cada estrella "asoma" al
// pasar el cursor antes de confirmar. Usa `motion` para mantener un solo
// motor de animación en el proyecto (igual que RubberSegment/RevealWords).
//
// Widget de retroalimentación anónimo del storefront (sin login). Envía
// mediante storefrontService.submitSiteRating (POST /api/public/ratings).
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Star, Check } from "lucide-react";
import { submitSiteRating } from "../../services/storefrontService";
import "./PeekRating.css";

interface Props {
  // Ruta actual, se envía solo como contexto administrativo (no identifica al visitante).
  page?: string;
}

type Status = "idle" | "submitting" | "done" | "error";

export default function PeekRating({ page }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const active = hovered ?? selected ?? 0;

  async function handleSubmit() {
    if (!selected || status === "submitting") return;
    setStatus("submitting");
    try {
      await submitSiteRating({ rating: selected, comment: comment.trim() || undefined, page });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="peek-rating peek-rating--done">
        <motion.div
          className="peek-rating__done-icon"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          <Check size={20} aria-hidden="true" />
        </motion.div>
        <div>
          <p className="peek-rating__title">¡Gracias por tu opinión!</p>
          <p className="peek-rating__subtitle">Nos ayuda a mejorar tu experiencia.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="peek-rating">
      <p className="peek-rating__title">¿Qué tal tu experiencia en la página?</p>
      <div className="peek-rating__stars" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= active;
          return (
            <motion.button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected === n}
              aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
              // El color se calcula a partir de `filled` (no solo con CSS :hover),
              // así al pasar el cursor o seleccionar la estrella 3 se iluminan 1-2-3 juntas.
              className={`peek-rating__star${filled ? " peek-rating__star--filled" : ""}`}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(n)}
              onBlur={() => setHovered(null)}
              onClick={() => setSelected(n)}
              animate={{ y: filled ? -6 : 0, scale: filled ? 1.08 : 1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 16 }}
            >
              <Star size={26} aria-hidden="true" fill={filled ? "currentColor" : "transparent"} />
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected !== null && (
          <motion.div
            className="peek-rating__followup"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <textarea
              className="peek-rating__comment"
              placeholder="Cuéntanos más (opcional)"
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="peek-rating__actions">
              {status === "error" && <span className="peek-rating__error">No se pudo enviar, intenta de nuevo.</span>}
              <button
                type="button"
                className="peek-rating__submit"
                onClick={handleSubmit}
                disabled={status === "submitting"}
              >
                {status === "submitting" ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
