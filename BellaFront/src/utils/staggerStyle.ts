import type { CSSProperties } from "react";

// Genera el valor de --stagger-delay que usa la utilidad .animate-in-stagger
// (global.css) para escalonar la animación de entrada de una lista. Estaba
// duplicada de forma idéntica en una docena de páginas; ahora vive una sola vez.
export function staggerStyle(ms: number): CSSProperties {
  return { "--stagger-delay": `${ms}ms` } as unknown as CSSProperties;
}
