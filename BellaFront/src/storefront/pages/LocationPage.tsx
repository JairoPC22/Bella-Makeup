import { useEffect, useState } from "react";
import { Clock3, MapPin, Phone, MapPinned } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { listPublicBranches } from "../../services/storefrontService";
import type { PublicBranch } from "../../types/api";
import "./LocationPage.css";

type FetchStatus = "loading" | "ready" | "error";

// No API key available or needed — this is Google's key-free "basic" Maps
// embed pattern (a plain <iframe src="https://www.google.com/maps?q=...
// &output=embed">), not the JS Maps Embed API which requires a key. Good
// enough for a simple "here's roughly where we are" pin per branch.
function mapEmbedSrc(branch: PublicBranch): string {
  const query = branch.address ? `${branch.name}, ${branch.address}` : branch.name;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

export function LocationPage() {
  const [branches, setBranches] = useState<PublicBranch[]>([]);
  const [status, setStatus] = useState<FetchStatus>("loading");

  useEffect(() => {
    listPublicBranches()
      .then((data) => { setBranches(data); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="storefront-location">
      <section className="storefront-page-header">
        <span className="storefront-page-header__eyebrow">
          <MapPinned size={14} aria-hidden="true" /> Ubicación
        </span>
        <h1>Visítanos en cualquiera de nuestras sucursales.</h1>
        <p>
          Encuentra la sucursal más cercana a ti, con su dirección, teléfono y horario. También puedes recoger
          tu pedido en línea directamente en cualquiera de estos puntos.
        </p>
      </section>

      <section className="storefront-section storefront-location__list">
        {status === "loading" && <StatusState kind="loading" />}
        {status === "error" && (
          <StatusState kind="error" message="No se pudieron cargar las sucursales. Intenta más tarde." />
        )}
        {status === "ready" && branches.length === 0 && (
          <StatusState kind="empty" message="Aún no hay sucursales registradas." />
        )}
        {status === "ready" && branches.length > 0 && (
          <div className="storefront-location__grid">
            {branches.map((branch) => (
              <article className="storefront-location-card" key={branch.id}>
                <h2>{branch.name}</h2>
                <ul className="storefront-location-card__facts">
                  {branch.address && (
                    <li>
                      <MapPin size={15} aria-hidden="true" />
                      <span>{branch.address}</span>
                    </li>
                  )}
                  {branch.phone && (
                    <li>
                      <Phone size={15} aria-hidden="true" />
                      <span>{branch.phone}</span>
                    </li>
                  )}
                  {branch.schedule && (
                    <li>
                      <Clock3 size={15} aria-hidden="true" />
                      <span>{branch.schedule}</span>
                    </li>
                  )}
                </ul>
                {branch.address && (
                  <div className="storefront-location-card__map">
                    <iframe
                      src={mapEmbedSrc(branch)}
                      title={branch.name}
                      loading="lazy"
                      style={{ border: 0 }}
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
