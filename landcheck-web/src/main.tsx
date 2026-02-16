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
      .register("/green/sw.js", { scope: "/green/" })
      .catch(() => {
        // Ignore registration errors in UI flow.
      });
  });
}
