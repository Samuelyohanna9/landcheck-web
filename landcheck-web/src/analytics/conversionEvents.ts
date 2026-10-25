import { readCookieConsentRecord } from "../privacy/cookieConsent";

export type ConversionEventName =
  | "estate_demo_request"
  | "estate_trial_start"
  | "survey_workspace_open"
  | "survey_project_created"
  | "survey_export_started"
  | "survey_export_completed";

type SafeValue = string | number | boolean;
type ConversionParameters = Record<string, SafeValue | undefined>;

const SESSION_EVENT_PREFIX = "landcheck:conversion:";
const memoryEventKeys = new Set<string>();

const cleanParameters = (parameters: ConversionParameters = {}) =>
  Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, SafeValue>;

/**
 * Provider-neutral conversion sink. It emits only after measurement consent and deliberately
 * carries no PII, land coordinates, plot records, payment data, or customer data. A future
 * consent-controlled provider can subscribe to the CustomEvent or provide window.gtag without
 * changing product components.
 */
export function trackConversion(
  name: ConversionEventName,
  parameters: ConversionParameters = {},
  dedupeKey?: string,
): boolean {
  if (typeof window === "undefined") return false;
  if (!readCookieConsentRecord()?.preferences.measurement) return false;

  const safeParameters = cleanParameters(parameters);
  const eventKey = `${SESSION_EVENT_PREFIX}${name}:${dedupeKey || "once"}`;
  if (memoryEventKeys.has(eventKey)) return false;
  try {
    if (window.sessionStorage.getItem(eventKey) === "1") return false;
    window.sessionStorage.setItem(eventKey, "1");
  } catch {
    // Tracking must never block the product when storage is unavailable.
  }
  memoryEventKeys.add(eventKey);

  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") {
    gtag("event", name, safeParameters);
  }
  window.dispatchEvent(
    new CustomEvent("landcheck:conversion", {
      detail: { name, parameters: safeParameters },
    }),
  );
  return true;
}
