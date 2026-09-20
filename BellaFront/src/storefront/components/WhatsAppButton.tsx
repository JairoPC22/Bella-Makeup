import { useEffect, useState } from "react";
import { getPublicCompanyInfo } from "../../services/storefrontService";
import "./WhatsAppButton.css";

// lucide-react is a generic icon set with no WhatsApp brand glyph, so the
// recognizable WhatsApp "speech bubble + handset" mark is drawn inline here
// instead (a small, standard path, filled with currentColor like the rest
// of this app's icon usage).
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 32 32" width={28} height={28} fill="currentColor" aria-hidden="true">
      <path d="M16.01 3C9.38 3 4 8.36 4 14.98c0 2.2.59 4.26 1.62 6.04L4 29l8.2-2.15a12.9 12.9 0 0 0 3.8.57h.01c6.63 0 12-5.36 12-11.98C28 8.36 22.64 3 16.01 3Zm0 21.9h-.01a10 10 0 0 1-5.08-1.39l-.36-.21-4.87 1.28 1.3-4.75-.24-.38a9.9 9.9 0 0 1-1.53-5.27c0-5.47 4.46-9.92 9.94-9.92 2.65 0 5.14 1.04 7.02 2.91a9.85 9.85 0 0 1 2.91 7.01c0 5.47-4.46 9.92-9.98 9.92Zm5.44-7.43c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

// Fixed bottom-left floating action button, echoing the visual treatment of
// the admin side's FloatingMessagesButton (circular, gradient-filled, pill
// shadow, scale+fade mount transition) — but this is a storefront-only,
// unauthenticated component, so it's built fresh here rather than reusing
// that admin component (which is gated behind PermissionGate/messages.view
// and lives in the authenticated tree).
export function WhatsAppButton() {
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicCompanyInfo()
      .then((info) => {
        if (cancelled) return;
        const whatsapp = info.socialLinks?.whatsapp;
        setPhone(whatsapp ?? null);
      })
      .catch(() => {
        if (!cancelled) setPhone(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render a dead/broken button — no number, no button.
  if (!phone) return null;

  const digitsOnly = phone.replace(/\D/g, "");
  if (!digitsOnly) return null;

  const href = `https://wa.me/${digitsOnly}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="storefront-whatsapp-button"
      aria-label="Chatea con nosotros por WhatsApp"
    >
      <WhatsAppGlyph />
    </a>
  );
}
