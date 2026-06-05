import axios from "axios";

const browserHost = typeof window !== "undefined" ? String(window.location.hostname || "").trim().toLowerCase() : "";
const defaultApiUrl =
  browserHost === "localhost" || browserHost === "127.0.0.1" || browserHost === "0.0.0.0"
    ? "http://localhost:8000"
    : "https://api.landcheck.online";

const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/+$/, "");

export const api = axios.create({
  baseURL: API_URL,
});

// Export the base URL for components that need direct links
export const BACKEND_URL = API_URL;
