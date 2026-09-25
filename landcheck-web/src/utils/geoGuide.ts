export type LngLat = [number, number];

const R = 6371008.8;
const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

export function polygonRing(geometry: any): LngLat[] {
  const ring = geometry?.type === "MultiPolygon" ? geometry?.coordinates?.[0]?.[0] : geometry?.coordinates?.[0];
  if (!Array.isArray(ring)) return [];
  const points = ring.map((pair: number[]) => [Number(pair[0]), Number(pair[1])] as LngLat).filter((pair: LngLat) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) points.pop();
  }
  return points;
}

export function centroid(ring: LngLat[]): LngLat {
  const sum = ring.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return [sum[0] / Math.max(ring.length, 1), sum[1] / Math.max(ring.length, 1)];
}

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(from: LngLat, to: LngLat): number {
  const phi1 = toRad(from[1]);
  const phi2 = toRad(to[1]);
  const dLng = toRad(to[0] - from[0]);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const CARDINALS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export function cardinal(degrees: number): string {
  return CARDINALS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

export function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance in metres from a point to a polygon's edge (local flat-earth approximation). */
export function distanceToRing(point: LngLat, ring: LngLat[]): number {
  if (ring.length < 2) return Infinity;
  const kx = Math.cos(toRad(point[1])) * 111320;
  const ky = 110574;
  const local = ring.map((p) => [(p[0] - point[0]) * kx, (p[1] - point[1]) * ky]);
  let best = Infinity;
  for (let i = 0; i < local.length; i++) {
    const [x1, y1] = local[i];
    const [x2, y2] = local[(i + 1) % local.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / lengthSq));
    best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return best;
}

export function beaconLabel(index: number): string {
  return String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : "");
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "-";
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
