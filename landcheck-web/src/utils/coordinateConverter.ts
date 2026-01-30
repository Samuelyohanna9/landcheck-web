// Coordinate conversion utilities using proj4
// This converts between WGS84 (used by map) and projected systems (used in Nigeria surveys)

import proj4 from "proj4";

// Define coordinate systems
proj4.defs([
  ["EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs"], // WGS84
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
  utm_31n: "EPSG:32631",
  utm_32n: "EPSG:32632",
  utm_33n: "EPSG:32633",
  minna_31: "EPSG:26331",
  minna_32: "EPSG:26332",
  minna_33: "EPSG:26333",
};

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
  if (targetSystem === "wgs84") {
    return [lng, lat];
  }

  const targetEpsg = SYSTEM_TO_EPSG[targetSystem];
  if (!targetEpsg) {
    console.warn(`Unknown coordinate system: ${targetSystem}`);
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
  if (sourceSystem === "wgs84") {
    return [x, y];
  }

  const sourceEpsg = SYSTEM_TO_EPSG[sourceSystem];
  if (!sourceEpsg) {
    console.warn(`Unknown coordinate system: ${sourceSystem}`);
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

/**
 * Check if coordinates look like projected coordinates (large values)
 */
export function looksLikeProjected(x: number, y: number): boolean {
  // Projected coordinates are typically large (hundreds of thousands)
  // WGS84 lng is -180 to 180, lat is -90 to 90
  return Math.abs(x) > 180 || Math.abs(y) > 90;
}
