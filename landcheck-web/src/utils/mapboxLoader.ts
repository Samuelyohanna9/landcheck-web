export const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || "").trim();

let mapboxGlPromise: Promise<any> | null = null;
let mapboxDrawPromise: Promise<any> | null = null;
let mapboxGlCssPromise: Promise<unknown> | null = null;
let mapboxDrawCssPromise: Promise<unknown> | null = null;

export const loadMapboxGl = async () => {
  if (!mapboxGlPromise) {
    mapboxGlPromise = import("mapbox-gl").then((mod) => {
      const mapboxgl = mod.default;
      if (MAPBOX_TOKEN) {
        mapboxgl.accessToken = MAPBOX_TOKEN;
      }
      return mapboxgl;
    });
  }
  return mapboxGlPromise;
};

export const loadMapboxDraw = async () => {
  if (!mapboxDrawPromise) {
    mapboxDrawPromise = import("@mapbox/mapbox-gl-draw").then((mod) => mod.default);
  }
  return mapboxDrawPromise;
};

export const loadMapboxGlCss = async () => {
  if (!mapboxGlCssPromise) {
    mapboxGlCssPromise = import("mapbox-gl/dist/mapbox-gl.css");
  }
  return mapboxGlCssPromise;
};

export const loadMapboxDrawCss = async () => {
  if (!mapboxDrawCssPromise) {
    mapboxDrawCssPromise = import("@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css");
  }
  return mapboxDrawCssPromise;
};

export const prefetchMapboxCore = async () => {
  await Promise.all([loadMapboxGl(), loadMapboxGlCss()]);
};

export const prefetchMapboxDrawBundle = async () => {
  await Promise.all([loadMapboxGl(), loadMapboxGlCss(), loadMapboxDraw(), loadMapboxDrawCss()]);
};
