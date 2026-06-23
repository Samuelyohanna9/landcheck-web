import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

const browserHost = typeof window !== "undefined" ? String(window.location.hostname || "").trim().toLowerCase() : "";
const isLocalHost = (value: string) =>
  value === "localhost" || value === "127.0.0.1" || value === "0.0.0.0";

const GREEN_AUTH_STORAGE_KEY = "landcheck_green_auth";
const WORK_AUTH_STORAGE_KEY = "landcheck_work_auth";

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

const API_URL = (shouldOverrideLocalConfiguredApi ? defaultApiUrl : configuredApiUrl || defaultApiUrl).replace(/\/+$/, "");

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

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
  user?: StoredSessionUser | null;
};

const readStoredSession = (key: string): StoredSession | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
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
  const activeSession = cleanPathname.startsWith("/green-work")
    ? workSession || greenSession
    : cleanPathname.startsWith("/green")
      ? greenSession || workSession
      : workSession || greenSession;
  const headers = config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
  config.headers = headers;
  headers.set("X-LC-Client", resolveWebClientLabel(pathname, greenSession));
  headers.set("X-LC-App-Route", pathname || "/");
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

api.interceptors.request.use((config) => attachLandCheckHeaders(config));

// Export the base URL for components that need direct links
export const BACKEND_URL = API_URL;
