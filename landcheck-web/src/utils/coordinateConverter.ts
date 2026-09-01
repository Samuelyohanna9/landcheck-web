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
  // Nigeria's older cadastral "Belt"/NTM system (Federal Surveys, pre-1975) - still seen on some
  // (especially older) survey plans alongside or instead of the modern UTM zones. Distinguished
  // from UTM by a completely different false-easting baseline per belt (~230738 West, ~670553
  // Mid, ~1110370 East) rather than UTM's ~500000 central-zone easting - see coordinateConverter's
  // Nigeria-belt detection helpers below.
  ["EPSG:26391", "+proj=tmerc +lat_0=4 +lon_0=4.5 +k=0.99975 +x_0=230738.26 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs"], // Minna / Nigeria West Belt
  ["EPSG:26392", "+proj=tmerc +lat_0=4 +lon_0=8.5 +k=0.99975 +x_0=670553.98 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs"], // Minna / Nigeria Mid Belt
  ["EPSG:26393", "+proj=tmerc +lat_0=4 +lon_0=12.5 +k=0.99975 +x_0=1110369.7 +y_0=0 +a=6378249.145 +rf=293.465 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs"], // Minna / Nigeria East Belt
  // Ghana - UTM Zone 30N (WGS84, covers nearly all of Ghana) and the Leigon / Ghana Metre Grid,
  // the national cadastral grid in use since 1978 (EPSG:25000, Clarke 1880 RGS ellipsoid).
  ["EPSG:32630", "+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs"],
  ["EPSG:25000", "+proj=tmerc +lat_0=4.66666666666667 +lon_0=-1 +k=0.99975 +x_0=274319.51 +y_0=0 +ellps=clrk80 +towgs84=-130,29,364,0,0,0,0 +units=m +no_defs"],
  // Uganda - straddles UTM zones 35N/36N (split at 30E). WGS84 UTM for modern GPS work; Arc 1960
  // (same Clarke 1880 RGS ellipsoid as Ghana, different datum shift) for older cadastral records.
  ["EPSG:32635", "+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs"],
  ["EPSG:32636", "+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs"],
  ["EPSG:21095", "+proj=utm +zone=35 +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs"],
  ["EPSG:21096", "+proj=utm +zone=36 +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs"],
  // Uganda also dips south of the equator (Lake Victoria/Masaka/Kabale area) - southern-
  // hemisphere UTM zones (+south flag adds the standard 10,000,000m false northing).
  ["EPSG:32735", "+proj=utm +zone=35 +south +datum=WGS84 +units=m +no_defs"],
  ["EPSG:32736", "+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs"],
  ["EPSG:21035", "+proj=utm +zone=35 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs"],
  ["EPSG:21036", "+proj=utm +zone=36 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs"],
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
  nigeria_west_belt: "EPSG:26391",
  nigeria_mid_belt: "EPSG:26392",
  nigeria_east_belt: "EPSG:26393",
  ghana_utm_30n: "EPSG:32630",
  ghana_leigon_grid: "EPSG:25000",
  uganda_utm_35n: "EPSG:32635",
  uganda_utm_36n: "EPSG:32636",
  uganda_arc1960_35n: "EPSG:21095",
  uganda_arc1960_36n: "EPSG:21096",
  uganda_utm_35s: "EPSG:32735",
  uganda_utm_36s: "EPSG:32736",
  uganda_arc1960_35s: "EPSG:21035",
  uganda_arc1960_36s: "EPSG:21036",
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
  nigeria_west_belt: "Nigeria West Belt (Minna)",
  nigeria_mid_belt: "Nigeria Mid Belt (Minna)",
  nigeria_east_belt: "Nigeria East Belt (Minna)",
  ghana_utm_30n: "Ghana UTM Zone 30N",
  ghana_leigon_grid: "Ghana Leigon National Grid",
  uganda_utm_35n: "Uganda UTM Zone 35N",
  uganda_utm_36n: "Uganda UTM Zone 36N",
  uganda_arc1960_35n: "Uganda Arc 1960 Zone 35N",
  uganda_arc1960_36n: "Uganda Arc 1960 Zone 36N",
  uganda_utm_35s: "Uganda UTM Zone 35S",
  uganda_utm_36s: "Uganda UTM Zone 36S",
  uganda_arc1960_35s: "Uganda Arc 1960 Zone 35S",
  uganda_arc1960_36s: "Uganda Arc 1960 Zone 36S",
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
  nigeria_west_belt: "EPSG:26391",
  nigeria_mid_belt: "EPSG:26392",
  nigeria_east_belt: "EPSG:26393",
  ghana_utm_30n: "EPSG:32630",
  ghana_leigon_grid: "EPSG:25000",
  uganda_utm_35n: "EPSG:32635",
  uganda_utm_36n: "EPSG:32636",
  uganda_arc1960_35n: "EPSG:21095",
  uganda_arc1960_36n: "EPSG:21096",
  uganda_utm_35s: "EPSG:32735",
  uganda_utm_36s: "EPSG:32736",
  uganda_arc1960_35s: "EPSG:21035",
  uganda_arc1960_36s: "EPSG:21036",
};

// Country grouping for the coordinate-system picker UI (CoordinateInput.tsx,
// SurveyPlanGeoreferenceSetupStep.tsx) - one entry per country, in the order they should appear.
export type CoordinateSystemOption = { key: string; name: string; epsgLabel: string; description: string };
export type CoordinateSystemCountryGroup = { country: string; systems: CoordinateSystemOption[] };

export const COORDINATE_SYSTEM_GROUPS: CoordinateSystemCountryGroup[] = [
  {
    country: "Global",
    systems: [
      { key: "wgs84", name: "WGS84 (Lat/Lon)", epsgLabel: "EPSG:4326", description: "Global GPS coordinates" },
    ],
  },
  {
    country: "Nigeria",
    systems: [
      {
        key: WGS84_NIGERIA_METERS,
        name: "WGS84 Nigeria Metres",
        epsgLabel: "EPSG:32631/32632/32633",
        description: "Auto-UTM metres for Nigeria. Best for map-picked or georeferenced jobs.",
      },
      { key: "utm_31n", name: "UTM Zone 31N", epsgLabel: "EPSG:32631", description: "Western Nigeria" },
      { key: "utm_32n", name: "UTM Zone 32N", epsgLabel: "EPSG:32632", description: "Central Nigeria" },
      { key: "utm_33n", name: "UTM Zone 33N", epsgLabel: "EPSG:32633", description: "Eastern Nigeria" },
      { key: "minna_31", name: "Minna Datum Zone 31", epsgLabel: "EPSG:26331", description: "Nigerian Grid - West" },
      { key: "minna_32", name: "Minna Datum Zone 32", epsgLabel: "EPSG:26332", description: "Nigerian Grid - Central" },
      { key: "minna_33", name: "Minna Datum Zone 33", epsgLabel: "EPSG:26333", description: "Nigerian Grid - East" },
      {
        key: "nigeria_west_belt",
        name: "Nigeria West Belt (Minna)",
        epsgLabel: "EPSG:26391",
        description: "Older cadastral grid, west of 6°30'E - still seen on some older survey plans",
      },
      {
        key: "nigeria_mid_belt",
        name: "Nigeria Mid Belt (Minna)",
        epsgLabel: "EPSG:26392",
        description: "Older cadastral grid, 6°30'E to 10°30'E - still seen on some older survey plans",
      },
      {
        key: "nigeria_east_belt",
        name: "Nigeria East Belt (Minna)",
        epsgLabel: "EPSG:26393",
        description: "Older cadastral grid, east of 10°30'E - still seen on some older survey plans",
      },
    ],
  },
  {
    country: "Ghana",
    systems: [
      { key: "ghana_utm_30n", name: "UTM Zone 30N", epsgLabel: "EPSG:32630", description: "Modern GPS grid, covers nearly all of Ghana" },
      { key: "ghana_leigon_grid", name: "Leigon National Grid", epsgLabel: "EPSG:25000", description: "Ghana's cadastral grid since 1978" },
    ],
  },
  {
    country: "Uganda",
    systems: [
      { key: "uganda_utm_35n", name: "UTM Zone 35N", epsgLabel: "EPSG:32635", description: "Modern GPS grid, north of equator, west of 30°E" },
      { key: "uganda_utm_36n", name: "UTM Zone 36N", epsgLabel: "EPSG:32636", description: "Modern GPS grid, north of equator, east of 30°E" },
      { key: "uganda_utm_35s", name: "UTM Zone 35S", epsgLabel: "EPSG:32735", description: "Modern GPS grid, south of equator, west of 30°E" },
      { key: "uganda_utm_36s", name: "UTM Zone 36S", epsgLabel: "EPSG:32736", description: "Modern GPS grid, south of equator, east of 30°E" },
      { key: "uganda_arc1960_35n", name: "Arc 1960 Zone 35N", epsgLabel: "EPSG:21095", description: "Local cadastral datum, north of equator, west of 30°E" },
      { key: "uganda_arc1960_36n", name: "Arc 1960 Zone 36N", epsgLabel: "EPSG:21096", description: "Local cadastral datum, north of equator, east of 30°E" },
      { key: "uganda_arc1960_35s", name: "Arc 1960 Zone 35S", epsgLabel: "EPSG:21035", description: "Local cadastral datum, south of equator, west of 30°E" },
      { key: "uganda_arc1960_36s", name: "Arc 1960 Zone 36S", epsgLabel: "EPSG:21036", description: "Local cadastral datum, south of equator, east of 30°E" },
    ],
  },
];

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

// Which COORDINATE_SYSTEM_GROUPS country a system key belongs to - drives the interactive map's
// "recenter on the chosen country" behavior (see MapViewEnhanced.tsx) without a second, separately
// maintained key->country table.
const SYSTEM_TO_COUNTRY: Record<string, string> = COORDINATE_SYSTEM_GROUPS.reduce(
  (acc, group) => {
    group.systems.forEach((sys) => {
      acc[sys.key] = group.country;
    });
    return acc;
  },
  {} as Record<string, string>,
);

export function getCoordinateSystemCountry(system: string): string {
  return SYSTEM_TO_COUNTRY[String(system || "wgs84").trim().toLowerCase()] || "Global";
}

// Roughly-centered "home view" per country - both interactive maps (the main boundary-drawing
// map in MapViewEnhanced.tsx and the georeference ground-control-point map in
// SurveyPlanGeoreferenceSetupStep.tsx) fly here whenever the chosen coordinate system's country
// changes, so picking a Ghana or Uganda system doesn't leave a surveyor stranded looking at
// Nigeria (each map's default view) with no real data on screen yet to navigate by.
export const COUNTRY_MAP_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  Nigeria: { center: [7.5, 9.0], zoom: 6 },
  Ghana: { center: [-1.1, 7.9], zoom: 6.3 },
  Uganda: { center: [32.3, 1.4], zoom: 6.8 },
};

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

// Tried in this order when nothing else disambiguates: modern WGS84 UTM zones first (the current
// GPS-era default), then the geometrically-distinct Belt/NTM system, then Minna's UTM-datum
// equivalents last - since a Minna zone and its WGS84 counterpart differ only by a ~100-200m datum
// shift, whichever of the two comes first in this list wins when both happen to fit.
const NIGERIA_PROJECTED_CANDIDATES = [
  "utm_31n", "utm_32n", "utm_33n",
  "nigeria_west_belt", "nigeria_mid_belt", "nigeria_east_belt",
  "minna_31", "minna_32", "minna_33",
] as const;

// Each candidate's own nominal longitude span - used as a self-consistency check (does reversing
// THIS candidate land somewhere THIS candidate would actually be used for?). Verified against real
// projected values (see coordinateConverter's dev notes) that this reliably tells a UTM/Minna zone
// apart from the Belt/NTM system, since they use different central meridians and zone widths (6
// deg UTM zones vs the Belt's non-uniform ~4/4/6 deg-equivalent spans) - a wrong system in the
// wrong family produces a longitude outside its own span almost every time. It can NOT reliably
// tell adjacent same-family zones apart (31N vs 32N vs 33N, or their Minna equivalents) for a point
// near a zone boundary - reprojecting under a neighbouring zone can coincidentally still land in
// that neighbour's own span, since UTM zone width and spacing are the same 6 degrees. That
// ambiguity is inherent to magnitude-only detection (professional GIS tools resolve it with an
// independent location prior, not pure geometry) - the visible, editable coordinate-system picker
// this feeds into is the intended safety net for that residual case, not a bug to chase away here.
const NIGERIA_SYSTEM_OWN_SPAN: Record<string, (lng: number) => boolean> = {
  utm_31n: (lng) => lng < 6,
  utm_32n: (lng) => lng >= 6 && lng < 12,
  utm_33n: (lng) => lng >= 12,
  minna_31: (lng) => lng < 6,
  minna_32: (lng) => lng >= 6 && lng < 12,
  minna_33: (lng) => lng >= 12,
  nigeria_west_belt: (lng) => lng < 6.5,
  nigeria_mid_belt: (lng) => lng >= 6.5 && lng < 10.5,
  nigeria_east_belt: (lng) => lng >= 10.5,
};

/**
 * Given raw projected x/y values, deterministically works out which Nigerian coordinate system
 * they're actually in by reverse-projecting through every candidate and keeping whichever one(s)
 * land inside Nigeria's real geographic bounds AND within that same candidate's own nominal zone/
 * belt span (see NIGERIA_SYSTEM_OWN_SPAN above) - the second check is what actually separates the
 * Belt/NTM system from a standard UTM zone, since a country-bounds check alone isn't tight enough
 * on its own (Nigeria is compact enough that a several-hundred-km misprojection can still land
 * somewhere else inside it). Returns null if nothing fits (the data likely isn't Nigerian projected
 * coordinates at all - e.g. a Ghana/Uganda file, or noise).
 */
export function resolveBestFitNigeriaCoordinateSystem(
  x: number,
  y: number
): { system: string; alternates: string[] } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const fits: string[] = [];
  for (const system of NIGERIA_PROJECTED_CANDIDATES) {
    const epsg = SYSTEM_TO_EPSG[system];
    if (!epsg) continue;
    try {
      const [lng, lat] = proj4(epsg, "EPSG:4326", [x, y]);
      const ownSpanCheck = NIGERIA_SYSTEM_OWN_SPAN[system];
      if (isWithinNigeriaBounds(lng, lat) && (!ownSpanCheck || ownSpanCheck(lng))) fits.push(system);
    } catch {
      // Not a fit - try the next candidate.
    }
  }

  if (fits.length === 0) return null;
  return { system: fits[0], alternates: fits.slice(1) };
}

/**
 * Cross-checks (and corrects, if needed) a coordinate-system guess against the raw values it's
 * meant to describe. A named Nigerian-projected guess is trusted only if it actually projects
 * back into Nigeria; if it doesn't (or there was no confident guess at all, just "unknown"), this
 * deterministically resolves a system that does fit, instead of silently defaulting to wgs84 and
 * feeding raw Easting/Northing values into the map as degrees. A non-Nigeria guess (already
 * WGS84, or an explicit Ghana/Uganda system) is left untouched - this resolver only understands
 * Nigeria. Returns "" when nothing useful can be determined, leaving the caller's own default.
 */
export function verifyOrResolveNigeriaCoordinateSystem(
  x: number,
  y: number,
  guessedSystem?: string | null
): string {
  const guess = String(guessedSystem || "").trim().toLowerCase();
  const guessIsNigeriaCandidate = (NIGERIA_PROJECTED_CANDIDATES as readonly string[]).includes(guess);

  if (guess && guess !== "unknown" && !guessIsNigeriaCandidate) {
    return guess;
  }

  if (guessIsNigeriaCandidate) {
    const epsg = SYSTEM_TO_EPSG[guess];
    try {
      const [lng, lat] = proj4(epsg, "EPSG:4326", [x, y]);
      const ownSpanCheck = NIGERIA_SYSTEM_OWN_SPAN[guess];
      if (isWithinNigeriaBounds(lng, lat) && (!ownSpanCheck || ownSpanCheck(lng))) return guess;
    } catch {
      // Fall through to the deterministic resolver below.
    }
  }

  if (!looksLikeProjected(x, y)) {
    return guessIsNigeriaCandidate ? guess : "";
  }

  const resolved = resolveBestFitNigeriaCoordinateSystem(x, y);
  return resolved?.system || (guessIsNigeriaCandidate ? guess : "");
}
