import type { ReactNode } from "react";
import "./Badge.css";

export function Badge({ tone, children }: { tone: "success" | "neutral" | "danger"; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
