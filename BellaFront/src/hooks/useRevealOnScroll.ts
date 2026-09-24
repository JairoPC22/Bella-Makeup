import { useEffect, useRef, useState } from "react";

// Scroll-reveal ligero: devuelve un ref y si ya entró al viewport. Se
// desconecta tras la primera revelación (no se repite en cada scroll),
// igual que la entrada .animate-in-stagger al montar.
export function useRevealOnScroll<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respeta prefers-reduced-motion: revela de inmediato sin observar.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}
