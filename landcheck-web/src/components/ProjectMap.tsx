import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "../styles/green-impact.css";

const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || "").trim();
mapboxgl.accessToken = MAPBOX_TOKEN;

export type ProjectMapFeature = {
  type: "Feature";
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
};

export function ProjectMap({
  points,
  features = [],
  mode = "green",
}: {
  points: { lng: number; lat: number }[];
  features?: ProjectMapFeature[];
  mode?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const accentColor =
    mode === "agric" ? "#b45309" : mode === "relief_recovery" ? "#1d4ed8" : "#16a34a";

  const hasPolygons = features.length > 0;
  const totalLocations = hasPolygons ? features.length : points.length;

  useEffect(() => {
    const hasPoints = points.length > 0;
    const hasFeats = features.length > 0;
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN || (!hasPoints && !hasFeats)) return;

    const center: [number, number] = hasPoints
      ? [points[0].lng, points[0].lat]
      : (() => {
          const geom = features[0]?.geometry as { coordinates?: unknown } | undefined;
          const coords = geom?.coordinates;
          const flat = Array.isArray(coords) ? (coords.flat(Infinity) as number[]) : [];
          return flat.length >= 2 ? ([flat[0], flat[1]] as [number, number]) : ([0, 0] as [number, number]);
        })();

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center,
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      if (!mapRef.current) return;

      if (hasPoints) {
        const pointGeoJson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: points.map((p) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
            properties: {},
          })),
        };
        map.addSource("impact-points", { type: "geojson", data: pointGeoJson, cluster: true, clusterMaxZoom: 14, clusterRadius: 40 });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "impact-points",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": accentColor,
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 30],
            "circle-opacity": 0.88,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "impact-points",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#fff" },
        });

        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "impact-points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": accentColor,
            "circle-radius": 6,
            "circle-opacity": 0.9,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#fff",
          },
        });
      }

      if (hasFeats) {
        const polyGeoJson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: features as unknown as GeoJSON.Feature[],
        };
        map.addSource("impact-polygons", { type: "geojson", data: polyGeoJson });
        map.addLayer({
          id: "polygon-fill",
          type: "fill",
          source: "impact-polygons",
          paint: { "fill-color": accentColor, "fill-opacity": 0.25 },
        });
        map.addLayer({
          id: "polygon-outline",
          type: "line",
          source: "impact-polygons",
          paint: { "line-color": accentColor, "line-width": 2.5, "line-opacity": 0.95 },
        });

        map.addLayer({
          id: "polygon-labels",
          type: "symbol",
          source: "impact-polygons",
          layout: {
            "text-field": [
              "concat",
              ["coalesce", ["get", "custodian_name"], ""],
              "\n",
              ["coalesce", ["get", "commodity"], ""],
              [
                "case",
                ["!=", ["get", "area_ha"], null],
                ["concat", "  ·  ", ["to-string", ["get", "area_ha"]], " ha"],
                "",
              ],
            ],
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 11,
            "text-anchor": "center",
            "text-max-width": 12,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            "symbol-placement": "point",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": accentColor,
            "text-halo-width": 1.8,
            "text-halo-blur": 0.4,
          },
        });

        map.on("mouseenter", "polygon-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "polygon-fill", () => {
          map.getCanvas().style.cursor = "";
        });
      }

      if (points.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        points.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 44, maxZoom: 17, duration: 800 });
      }
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (points.length === 0 && features.length === 0) return null;

  return (
    <div className="gi-map-wrap">
      <div ref={containerRef} className="gi-map-canvas" />
      <div className="gi-map-badge">
        {totalLocations.toLocaleString()} verified GPS {totalLocations === 1 ? "location" : "locations"}
        {hasPolygons ? " · click plot for details" : ""}
      </div>
    </div>
  );
}
