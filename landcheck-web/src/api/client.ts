import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

const browserHost = typeof window !== "undefined" ? String(window.location.hostname || "").trim().toLowerCase() : "";
const isLocalHost = (value: string) =>
  value === "localhost" || value === "127.0.0.1" || value === "0.0.0.0";

const GREEN_AUTH_STORAGE_KEY = "landcheck_green_auth";
const WORK_AUTH_STORAGE_KEY = "landcheck_work_auth";
const SURVEY_AUTH_STORAGE_KEY = "landcheck_survey_auth";
const ESTATE_AUTH_STORAGE_KEY = "landcheck_estate_auth";

const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
let configuredApiHost = "";
if (configuredApiUrl) {
  try {
    configuredApiHost = String(new URL(configuredApiUrl).hostname || "").trim().toLowerCase();
  } catch {
    configuredApiHost = "";
  }
}

const defaultApiUrl =
  isLocalHost(browserHost)
    ? "http://localhost:8000"
    : "https://api.landcheck.online";

const shouldOverrideLocalConfiguredApi = Boolean(
  configuredApiUrl && configuredApiHost && isLocalHost(configuredApiHost) && browserHost && !isLocalHost(browserHost),
);

export const API_URL = (shouldOverrideLocalConfiguredApi ? defaultApiUrl : configuredApiUrl || defaultApiUrl).replace(/\/+$/, "");

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: true,
});

let estateReadOnly = false;

/** Set by EstateShell after billing status is resolved. The API remains the final authority. */
export function setEstateReadOnly(value: boolean): void {
  estateReadOnly = value;
}

// Mutation callers keep this key while retrying the same logical action. The API uses it to
// return the original allocation/payment instead of creating a second financial record.
export function createIdempotencyKey(prefix = "estate-action") {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`.slice(0, 128);
}

type StoredSessionUser = {
  id?: number | null;
  full_name?: string | null;
  role_key?: string | null;
  role?: string | null;
  organization_id?: number | null;
};

type StoredSession = {
  auth_mode?: string | null;
  appMode?: string | null;
  access_token?: string | null;
  user?: StoredSessionUser | null;
};

const readStoredSession = (key: string): StoredSession | null => {
  if (typeof window === "undefined") return null;
  // Browser auth is carried by an HttpOnly cookie. Remove legacy bearer tokens that older
  // releases may have left in localStorage; never read them back into JavaScript.
  window.localStorage.removeItem(key);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
};

const resolveWebClientLabel = (pathname: string, greenSession: StoredSession | null) => {
  const cleanPath = pathname.trim().toLowerCase();
  const sponsorSession = greenSession?.auth_mode === "sponsor_user" || greenSession?.appMode === "green_sponsor";
  if (cleanPath.startsWith("/green-work")) return "green-work-web";
  if (cleanPath.startsWith("/survey-plan") || cleanPath.startsWith("/survey")) return "survey-plan-web";
  if (cleanPath.startsWith("/estates")) return "estates-web";
  if (cleanPath.startsWith("/hazard-analysis") || cleanPath.startsWith("/flood")) return "flood-web";
  if (cleanPath.startsWith("/feedback")) return "feedback-web";
  if (cleanPath.startsWith("/green")) {
    if (sponsorSession || cleanPath.includes("/login/sponsor")) return "green-sponsor-web";
    return "green-field-pwa";
  }
  return "landcheck-web";
};

const attachLandCheckHeaders = (config: InternalAxiosRequestConfig) => {
  if (typeof window === "undefined") return config;
  const pathname = String(window.location.pathname || "").trim();
  const cleanPathname = pathname.toLowerCase();
  const greenSession = readStoredSession(GREEN_AUTH_STORAGE_KEY);
  const workSession = readStoredSession(WORK_AUTH_STORAGE_KEY);
  const surveySession = readStoredSession(SURVEY_AUTH_STORAGE_KEY);
  const estateSession = readStoredSession(ESTATE_AUTH_STORAGE_KEY);
  const requestPath = String(config.url || "").trim().toLowerCase();
  const isEstateRequest = requestPath.startsWith("/estates") || requestPath.includes("/estates/");
  const isSurveyRoute =
    cleanPathname.startsWith("/survey-plan") ||
    cleanPathname.startsWith("/survey") ||
    cleanPathname.startsWith("/dashboard") ||
    cleanPathname.startsWith("/hazard-analysis");
  const activeSession = isEstateRequest
    ? estateSession
    : isSurveyRoute
    ? surveySession
    : cleanPathname.startsWith("/green-work")
      ? workSession || greenSession
      : cleanPathname.startsWith("/green")
        ? greenSession || workSession
        : workSession || greenSession;
  const headers = config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
  config.headers = headers;
  headers.set("X-LC-Client", resolveWebClientLabel(pathname, greenSession));
  headers.set("X-LC-App-Route", pathname || "/");
  headers.delete("Authorization");
  if (activeSession?.auth_mode) headers.set("X-LC-Auth-Mode", String(activeSession.auth_mode));
  if (activeSession?.appMode) headers.set("X-LC-Session-App-Mode", String(activeSession.appMode));
  if (activeSession?.user?.role_key || activeSession?.user?.role) {
    headers.set("X-LC-Role-Key", String(activeSession.user?.role_key || activeSession.user?.role || ""));
  }
  if (activeSession?.user?.id != null) headers.set("X-LC-User-Id", String(activeSession.user.id));
  if (activeSession?.user?.full_name) headers.set("X-LC-User-Name", String(activeSession.user.full_name));
  if (activeSession?.user?.organization_id != null) headers.set("X-LC-Organization-Id", String(activeSession.user.organization_id));
  return config;
};

api.interceptors.request.use((config) => {
  const next = attachLandCheckHeaders(config);
  const method = String(next.method || "get").toLowerCase();
  const pathname = typeof window !== "undefined" ? String(window.location.pathname || "").toLowerCase() : "";
  const requestPath = String(next.url || "").toLowerCase();
  const isMutation = ["post", "put", "patch", "delete"].includes(method);
  const isEstateWorkspace = pathname.startsWith("/estates/") && !pathname.startsWith("/estates/public/");
  const isEstateRequest = requestPath.startsWith("/estates") || requestPath.includes("/estates/");
  const isBillingRequest = requestPath.startsWith("/estates/billing") || requestPath.includes("/estates/billing/");
  const isDpaRequest = requestPath.includes("/estates/legal/");
  if (estateReadOnly && isMutation && (isEstateWorkspace || isEstateRequest) && !isBillingRequest && !isDpaRequest) {
    return Promise.reject(new Error("Your Estate subscription has ended. Renew your subscription to make changes."));
  }
  return next;
});

// Export the base URL for components that need direct links
export const BACKEND_URL = API_URL;

const isNetworkLevelFailure = (err: unknown) => {
  if (!axios.isAxiosError(err)) return false;
  // A caller deliberately aborted this request (for example, starting a new survey plan).
  // It must never be retried as a transient network failure.
  if (err.code === "ERR_CANCELED") return false;
  // No `response` means the request never got a reply (timeout, dropped connection, DNS
  // failure, etc.) - a real 4xx/5xx from the server is a rejection, not a network fault, and
  // should surface immediately rather than being retried.
  return !err.response;
};

/**
 * Retries `fn` only on network-level failures (dropped connection, timeout) - never on a real
 * HTTP error response, which should surface to the caller immediately. Intended for calls that
 * are safe to repeat (idempotency-keyed writes, or reads/renders keyed by a stable signature).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number }
): Promise<T> {
  const retries = options?.retries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 800;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isNetworkLevelFailure(err)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

/**
 * Pulls the backend's actual `detail` message out of a failed request, falling back to a caller
 *-supplied message. Three things otherwise hide that message: axios errors are `instanceof Error`,
 * so a naive `err instanceof Error ? err.message : ...` check always wins and shows axios's
 * generic "Request failed with status code 400/500" instead; for a request made with
 * `responseType: "blob"` (every preview/orthophoto/topo/export render), a JSON error body still
 * arrives as a Blob, not a parsed object, so `err.response.data.detail` is undefined unless that
 * blob is read back out as text first; and `detail` is sometimes an object, not a string - every
 * "upgrade_required"/"subscription_required" 402 in this app (hazard analysis, soil analysis, the
 * Estates billing gate) raises `detail: {code, message}`, which a plain `typeof === "string"` check
 * skips entirely, falling through to the same generic axios message.
 */
export async function extractApiErrorMessage(err: any, fallback: string): Promise<string> {
  const data = err?.response?.data;
  const messageFromDetail = (detail: unknown): string | null => {
    if (typeof detail === "string" && detail) return detail;
    if (detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string") {
      return (detail as { message: string }).message;
    }
    return null;
  };
  if (data && typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      const message = messageFromDetail(parsed?.detail);
      if (message) return message;
    } catch {
      // Not JSON (a genuinely broken/binary response) - fall through to the other checks.
    }
  } else {
    const message = messageFromDetail(data?.detail);
    if (message) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
