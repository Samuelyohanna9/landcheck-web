import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getWorkspaceTheme } from "./utils/workspaceTheme";

import "./index.css";

if (typeof document !== "undefined") {
  const initialWorkspaceTheme = getWorkspaceTheme();
  document.documentElement.dataset.workspaceTheme = initialWorkspaceTheme;
  const isGreenFieldRoute = window.location.pathname === "/green" || window.location.pathname === "/green/";
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    isGreenFieldRoute || initialWorkspaceTheme === "light" ? "#F8FAFC" : "#0F172A",
  );
}

const rootElement = document.getElementById("root")!;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const canRegisterSiteSw =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  (import.meta.env.PROD || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

if (canRegisterSiteSw) {
  window.addEventListener("load", () => {
    // The entry module filename changes on every production build. Carry that identity into the
    // worker URL so browsers and edge caches cannot keep an older worker script after a release.
    const workerUrl = `/sw.js?build=${encodeURIComponent(new URL(import.meta.url).pathname)}`;
    navigator.serviceWorker
      .register(workerUrl, { scope: "/" })
      .then((registration) => {
        // Check immediately as well as periodically so a released worker can replace an older
        // cached asset set before the next navigation.
        void registration.update().catch(() => {});
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
  urls.push("/logo-icon-192.png");
  urls.push("/logo-icon-512.png");
  urls.push("/background-sponsor.webp");

  if (urls.length > 0 && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "PRECACHE_BUILD_ASSETS",
      urls,
    });
  }
}
