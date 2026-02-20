import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const canRegisterGreenSw =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  (import.meta.env.PROD || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

if (canRegisterGreenSw) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Auto-check for SW updates every 30 minutes
        setInterval(() => registration.update(), 30 * 60 * 1000);

        // Pre-cache Vite build assets (hashed JS/CSS bundles) so the app
        // shell is fully available offline. We scrape <link> and <script>
        // tags from the current page since Vite injects them at build time.
        if (navigator.serviceWorker.controller) {
          precacheBuildAssets();
        } else {
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            precacheBuildAssets();
          }, { once: true });
        }
      })
      .catch(() => {
        // Ignore registration errors in UI flow.
      });
  });
}

function precacheBuildAssets() {
  const urls: string[] = [];
  document.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]').forEach((el) => {
    const href = (el as HTMLLinkElement).href;
    if (href) urls.push(href);
  });
  document.querySelectorAll('script[src*="/assets/"]').forEach((el) => {
    const src = (el as HTMLScriptElement).src;
    if (src) urls.push(src);
  });
  // Also cache the logo
  urls.push("/green-logo-cropped-760.png");
  urls.push("/green-logo-cropped-700.png");

  if (urls.length > 0 && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "PRECACHE_BUILD_ASSETS",
      urls,
    });
  }
}
