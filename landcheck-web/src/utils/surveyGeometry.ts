// Small hand-rolled geometry helpers for the Survey Plan Production workspace - no turf/geometry
// library is installed in this project, and these are simple enough (haversine distance, a
// latitude-scaled shoelace area, an O(n^2) segment-intersection closure check) not to need one at
// the point counts a hand-drawn survey boundary or measure-tool click path actually reaches.

const EARTH_RADIUS_METERS = 6371008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two WGS84 points, in metres. */
export function haversineDistanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Approximate planar area of a WGS84 polygon ring, in square metres, via the shoelace formula
 * with longitude scaled by cos(mean latitude) to correct for meridian convergence. Accurate to
 * well under 0.1% at parcel scale (a few hundred metres to a few kilometres across) - a full
 * ellipsoidal/geodesic area calc would be overkill for a "roughly how big is this parcel" badge.
 */
export function computeParcelAreaSqMeters(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const meanLat = ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos(toRadians(meanLat));
  const projected = ring.map(([lng, lat]) => [lng * metersPerDegLng, lat * metersPerDegLat]);
  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[(i + 1) % projected.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function formatParcelArea(sqMeters: number): string {
  if (!Number.isFinite(sqMeters) || sqMeters <= 0) return "--";
  if (sqMeters >= 10_000) return `${(sqMeters / 10_000).toFixed(2)} ha`;
  return `${Math.round(sqMeters).toLocaleString()} m²`;
}

const segmentsIntersect = (
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
  [cx, cy]: [number, number],
  [dx, dy]: [number, number],
): boolean => {
  const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
};

export type ClosureStatus = "closed" | "self-intersecting" | "incomplete";

/**
 * Checks whether a boundary ring (as drawn - no need for the caller to repeat the first point at
 * the end) is a simple, non-self-intersecting polygon. Only checks non-adjacent edges, since
 * adjacent edges always share an endpoint and would trivially "intersect" there.
 */
export function checkPolygonClosure(ring: [number, number][]): ClosureStatus {
  if (ring.length < 3) return "incomplete";
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const isAdjacent = j === i || j === (i + 1) % n || (j + 1) % n === i;
      if (isAdjacent) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return "self-intersecting";
    }
  }
  return "closed";
}

/** Same finite/real-degree-range/not-exactly-0,0 guard used by the map view, promoted here so
 * both the map and the sidebar's coordinate-validation table share one definition. */
export function isPlottableLngLat(lng: unknown, lat: unknown): boolean {
  const lngNum = typeof lng === "number" ? lng : Number(lng);
  const latNum = typeof lat === "number" ? lat : Number(lat);
  if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) return false;
  if (lngNum < -180 || lngNum > 180 || latNum < -90 || latNum > 90) return false;
  if (lngNum === 0 && latNum === 0) return false;
  return true;
}
