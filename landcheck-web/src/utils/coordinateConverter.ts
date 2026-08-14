// Coordinate conversion utilities using proj4
// This converts between WGS84 (used by map) and projected systems (used in Nigeria surveys)

import proj4 from "proj4";

// Define coordinate systems
proj4.defs([
  ["EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs"], // WGS84
  ["EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs"], // Web Mercator
  ["EPSG:32631", "+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs"], // UTM Zone 31N
  ["EPSG:32632", "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs"], // UTM Zone 32N
  ["EPSG:32633", "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs"], // UTM Zone 33N
  ["EPSG:26331", "+proj=utm +zone=31 +ellps=clrk80 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs"], // Minna Zone 31
  ["EPSG:26332", "+proj=utm +zone=32 +ellps=clrk80 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs"], // Minna Zone 32
  ["EPSG:26333", "+proj=utm +zone=33 +ellps=clrk80 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs"], // Minna Zone 33
]);

// Map coordinate system keys to EPSG codes
const SYSTEM_TO_EPSG: Record<string, string> = {
  wgs84: "EPSG:4326",
  wgs84_nigeria_meters: "EPSG:32632",
  utm_31n: "EPSG:32631",
  utm_32n: "EPSG:32632",
  utm_33n: "EPSG:32633",
  minna_31: "EPSG:26331",
  minna_32: "EPSG:26332",
  minna_33: "EPSG:26333",
};

export const WGS84_NIGERIA_METERS = "wgs84_nigeria_meters";

const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  wgs84: "WGS84 (Lat/Lon)",
  wgs84_nigeria_meters: "WGS84 Nigeria Metres",
  utm_31n: "UTM Zone 31N",
  utm_32n: "UTM Zone 32N",
  utm_33n: "UTM Zone 33N",
  minna_31: "Minna Datum Zone 31",
  minna_32: "Minna Datum Zone 32",
  minna_33: "Minna Datum Zone 33",
};

const SYSTEM_EPSG_LABELS: Record<string, string> = {
  wgs84: "EPSG:4326",
  wgs84_nigeria_meters: "EPSG:32631/32632/32633",
  utm_31n: "EPSG:32631",
  utm_32n: "EPSG:32632",
  utm_33n: "EPSG:32633",
  minna_31: "EPSG:26331",
  minna_32: "EPSG:26332",
  minna_33: "EPSG:26333",
};

const NIGERIA_BOUNDS = {
  minLng: 2.5,
  maxLng: 14.7,
  minLat: 4.0,
  maxLat: 14.1,
} as const;

const NIGERIA_UTM_ZONES = ["utm_31n", "utm_32n", "utm_33n"] as const;

export function isNigeriaAutoUtmCoordinateSystem(system: string): boolean {
  return String(system || "").trim().toLowerCase() === WGS84_NIGERIA_METERS;
}

export function resolveNigeriaWgs84MetersZone(lng: number): "utm_31n" | "utm_32n" | "utm_33n" {
  if (!Number.isFinite(lng)) {
    return "utm_32n";
  }
  if (lng < 6) return "utm_31n";
  if (lng < 12) return "utm_32n";
  return "utm_33n";
}

function isWithinNigeriaBounds(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= NIGERIA_BOUNDS.minLng &&
    lng <= NIGERIA_BOUNDS.maxLng &&
    lat >= NIGERIA_BOUNDS.minLat &&
    lat <= NIGERIA_BOUNDS.maxLat
  );
}

function inferNigeriaWgs84MetersZoneFromProjected(
  x: number,
  y: number
): "utm_31n" | "utm_32n" | "utm_33n" {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return "utm_32n";
  }

  const candidates = NIGERIA_UTM_ZONES.flatMap((zone) => {
    const epsg = SYSTEM_TO_EPSG[zone];
    if (!epsg) return [];
    try {
      const [lng, lat] = proj4(epsg, "EPSG:4326", [x, y]);
      if (!isWithinNigeriaBounds(lng, lat)) return [];
      return [{ zone, lng, lat }];
    } catch {
      return [];
    }
  });

  if (candidates.length === 1) {
    return candidates[0].zone;
  }

  if (candidates.length > 1) {
    const best = candidates.find((candidate) => resolveNigeriaWgs84MetersZone(candidate.lng) === candidate.zone);
    return best?.zone || candidates[0].zone;
  }

  return "utm_32n";
}

export function resolveCoordinateSystemKey(system: string, xOrLng?: number | null, yOrLat?: number | null): string {
  const clean = String(system || "wgs84").trim().toLowerCase();
  if (clean === WGS84_NIGERIA_METERS) {
    if (Number.isFinite(Number(xOrLng)) && Number.isFinite(Number(yOrLat)) && looksLikeProjected(Number(xOrLng), Number(yOrLat))) {
      return inferNigeriaWgs84MetersZoneFromProjected(Number(xOrLng), Number(yOrLat));
    }
    return resolveNigeriaWgs84MetersZone(Number(xOrLng));
  }
  return clean;
}

export function getCoordinateSystemLabel(system: string): string {
  return SYSTEM_DISPLAY_NAMES[String(system || "wgs84").trim().toLowerCase()] || "WGS84 (Lat/Lon)";
}

export function getCoordinateSystemEpsgLabel(system: string): string {
  return SYSTEM_EPSG_LABELS[String(system || "wgs84").trim().toLowerCase()] || "EPSG:4326";
}

export function isProjectedCoordinateSystem(system: string): boolean {
  return resolveCoordinateSystemKey(system) !== "wgs84";
}

/**
 * Convert coordinates from WGS84 (lng, lat) to a projected system
 * @param lng Longitude in WGS84
 * @param lat Latitude in WGS84
 * @param targetSystem The target coordinate system key
 * @returns [easting, northing] in the target system, or [lng, lat] if target is WGS84
 */
export function fromWGS84(
  lng: number,
  lat: number,
  targetSystem: string
): [number, number] {
  const resolvedTargetSystem = resolveCoordinateSystemKey(targetSystem, lng);
  if (resolvedTargetSystem === "wgs84") {
    return [lng, lat];
  }

  const targetEpsg = SYSTEM_TO_EPSG[resolvedTargetSystem];
  if (!targetEpsg) {
    console.warn(`Unknown coordinate system: ${resolvedTargetSystem}`);
    return [lng, lat];
  }

  try {
    const result = proj4("EPSG:4326", targetEpsg, [lng, lat]);
    // Round to 2 decimal places for meters
    return [Math.round(result[0] * 100) / 100, Math.round(result[1] * 100) / 100];
  } catch (e) {
    console.error("Coordinate conversion error:", e);
    return [lng, lat];
  }
}

/**
 * Convert coordinates from a projected system to WGS84 (lng, lat)
 * @param x Easting or Longitude
 * @param y Northing or Latitude
 * @param sourceSystem The source coordinate system key
 * @returns [lng, lat] in WGS84
 */
export function toWGS84(
  x: number,
  y: number,
  sourceSystem: string
): [number, number] {
  const resolvedSourceSystem = resolveCoordinateSystemKey(sourceSystem, x, y);
  if (resolvedSourceSystem === "wgs84") {
    return [x, y];
  }

  const sourceEpsg = SYSTEM_TO_EPSG[resolvedSourceSystem];
  if (!sourceEpsg) {
    console.warn(`Unknown coordinate system: ${resolvedSourceSystem}`);
    return [x, y];
  }

  try {
    const result = proj4(sourceEpsg, "EPSG:4326", [x, y]);
    // Round to 6 decimal places for degrees
    return [Math.round(result[0] * 1000000) / 1000000, Math.round(result[1] * 1000000) / 1000000];
  } catch (e) {
    console.error("Coordinate conversion error:", e);
    return [x, y];
  }
}

export function mercatorToWGS84(x: number, y: number): [number, number] {
  try {
    const result = proj4("EPSG:3857", "EPSG:4326", [x, y]);
    return [Math.round(result[0] * 1000000) / 1000000, Math.round(result[1] * 1000000) / 1000000];
  } catch (e) {
    console.error("Mercator to WGS84 conversion error:", e);
    return [x, y];
  }
}

/**
 * Check if coordinates look like projected coordinates (large values)
 */
export function looksLikeProjected(x: number, y: number): boolean {
  // Projected coordinates are typically large (hundreds of thousands)
  // WGS84 lng is -180 to 180, lat is -90 to 90
  return Math.abs(x) > 180 || Math.abs(y) > 90;
}
