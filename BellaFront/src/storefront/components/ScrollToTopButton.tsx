import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import "./ScrollToTopButton.css";

const SHOW_AFTER_PX = 400;

// Fixed bottom-right, opposite corner from WhatsAppButton (bottom-left) so
// the two never overlap. Hidden until the visitor has scrolled down a
// meaningful amount, same mount/visible-class pattern as the admin side's
// FloatingMessagesButton.
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function handleClick() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      className={`storefront-scroll-top-button${visible ? " storefront-scroll-top-button--visible" : ""}`}
      onClick={handleClick}
      aria-label="Volver arriba"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={22} aria-hidden="true" />
    </button>
  );
}
