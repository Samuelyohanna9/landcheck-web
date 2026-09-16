export type UnitSystem = "m" | "ft";

const FT_PER_M = 3.28084;
const SQFT_PER_SQM = 10.7639;

export const metersToFeet = (meters: number): number => meters * FT_PER_M;
export const feetToMeters = (feet: number): number => feet / FT_PER_M;
export const sqmToSqft = (sqm: number): number => sqm * SQFT_PER_SQM;
export const sqftToSqm = (sqft: number): number => sqft / SQFT_PER_SQM;

/** Formats a stored square-meter area for display, converting to sq ft when the estate's unit preference is "ft". */
export function formatArea(areaSqm: number, unit: UnitSystem = "m"): string {
  if (unit === "ft") {
    return `${sqmToSqft(areaSqm).toLocaleString("en-NG", { maximumFractionDigits: 0 })} ft²`;
  }
  return `${areaSqm.toLocaleString("en-NG", { maximumFractionDigits: 0 })} m²`;
}

/** Formats a stored meter distance for display, converting to feet when the estate's unit preference is "ft". */
export function formatDistance(distanceM: number, unit: UnitSystem = "m"): string {
  if (unit === "ft") {
    return `${metersToFeet(distanceM).toFixed(2)} ft`;
  }
  return `${distanceM.toFixed(2)} m`;
}

/** Labels the area-unit for an input field, e.g. "Target plot size (m²)" vs "(ft²)". */
export const areaUnitLabel = (unit: UnitSystem = "m"): string => (unit === "ft" ? "ft²" : "m²");
