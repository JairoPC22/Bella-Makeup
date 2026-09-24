// Small in-house equivalent of React Bits' AnimatedContent, built on
// `motion` instead of adding GSAP as a second animation library — the app
// already installed `motion` for RubberSegment, and running two different
// animation engines for the same kind of job (entrance reveals) is real
// weight for zero benefit. Splits text into words and staggers each one
// in with a bounce, for "las palabras de inicio" on the storefront hero
// and the admin dashboard greeting.
import { motion } from "motion/react";

interface Props {
  text: string;
  className?: string;
  /** ms before the first word starts. */
  delay?: number;
  /** ms between each word. */
  stagger?: number;
  /** px the words travel in from below. */
  distance?: number;
  as?: "h1" | "h2" | "p" | "span";
  /** When true, the reveal fires the first time the text scrolls into
   * view instead of immediately on mount — for headings further down the
   * page (section titles), where an on-mount delay would already be long
   * finished by the time a visitor actually scrolls to it. */
  inView?: boolean;
}

const BOUNCE = { type: "spring" as const, stiffness: 300, damping: 18, mass: 0.7 };

export function RevealWords({ text, className, delay = 0, stagger = 70, distance = 22, as = "span", inView = false }: Props) {
  const words = text.split(" ");
  const Tag = motion[as];
  const triggerProps = inView
    ? { whileInView: { opacity: 1, y: 0, scale: 1 }, viewport: { once: true, amount: 0.6 } }
    : { animate: { opacity: 1, y: 0, scale: 1 } };
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden="true"
          style={{ display: "inline-block", willChange: "transform, opacity" }}
          initial={{ opacity: 0, y: distance, scale: 0.92 }}
          {...triggerProps}
          transition={{ ...BOUNCE, delay: (delay + i * stagger) / 1000 }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}
