// Distancia en línea recta entre dos puntos lat/lng, en km. Heurística solo
// de cliente para mostrar "se surtirá desde X" en checkout; el backend es
// la fuente real de verdad cuando exista el ruteo por sucursal más cercana.
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
