export const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || "").trim();

let mapboxGlPromise: Promise<any> | null = null;
let mapboxDrawPromise: Promise<any> | null = null;

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
