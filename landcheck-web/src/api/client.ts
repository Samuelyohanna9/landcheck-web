import axios from "axios";

const browserHost = typeof window !== "undefined" ? String(window.location.hostname || "").trim().toLowerCase() : "";
const isLocalHost = (value: string) =>
  value === "localhost" || value === "127.0.0.1" || value === "0.0.0.0";

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
});

// Export the base URL for components that need direct links
export const BACKEND_URL = API_URL;
