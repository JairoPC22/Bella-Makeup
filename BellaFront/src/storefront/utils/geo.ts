// Straight-line (great-circle) distance between two lat/lng points, in
// kilometers. Purely client-side heuristic used to show the shopper an
// informational "se surtirá desde X" note during checkout — the backend is
// the real source of truth for nearest-branch routing once it exists (per
// the client's requirement to route delivery orders by straight-line
// distance), this just previews the same math up front.
export function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function findNearestBranch<T extends { lat: number | null; lng: number | null }>(
  point: { lat: number; lng: number },
  branches: T[]
): T | null {
  let nearest: T | null = null;
  let nearestDistance = Infinity;
  for (const branch of branches) {
    if (branch.lat == null || branch.lng == null) continue;
    const distance = haversineDistanceKm(point, { lat: branch.lat, lng: branch.lng });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = branch;
    }
  }
  return nearest;
}
