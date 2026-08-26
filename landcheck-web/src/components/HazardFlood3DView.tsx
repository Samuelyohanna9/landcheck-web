import { useEffect, useRef, useState } from "react";
import { loadMapboxGl, loadMapboxGlCss, MAPBOX_TOKEN } from "../utils/mapboxLoader";
import type { HazardInteractiveMeta, HazardValuePoint } from "./HazardInteractiveOverlay";

// Builds one small square "water tile" per sample point that actually counts as flooded, instead
// of one flat slab across the whole analysis box - so the water's footprint follows the model's
// own grid rather than covering ground the model never flagged as at-risk.
//
// River's value_key is "depth_m", a real modelled depth - a point counts as flooded once it has
// any (>2cm) depth, and each tile is raised to that point's own depth, so deeper cells really do
// look deeper. Floodplain/Rainfall only produce a 0-100 susceptibility score with no physical zero
// point (every location has *some* score), so there "affected" means the upper half of THIS site's
// own score range - the relatively higher-susceptibility ground within the analyzed area - with
// tile height scaled by how far into that range each point sits.
function buildWaterTiles(points: HazardValuePoint[] | undefined, valueKey: string, cellWidthM: number) {
  const features: GeoJSON.Feature[] = [];
  if (!points?.length) return { type: "FeatureCollection" as const, features };

  const isPhysicalDepth = valueKey === "depth_m";
  const values = points
    .map((p) => p[valueKey])
    .filter((v): v is number => typeof v === "number");
  if (!values.length) return { type: "FeatureCollection" as const, features };

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const threshold = isPhysicalDepth ? 0.02 : minV + (maxV - minV) * 0.5;

  for (const p of points) {
    const raw = p[valueKey];
    if (typeof raw !== "number" || raw < threshold) continue;

    const heightM = isPhysicalDepth
      ? Math.max(raw, 0.15)
      : 0.4 + (maxV > minV ? (raw - minV) / (maxV - minV) : 1) * 3.2;

    const halfLat = cellWidthM / 2 / 111320;
    const halfLng = cellWidthM / 2 / (111320 * Math.cos((p.lat * Math.PI) / 180) || 1);
    features.push({
      type: "Feature",
      properties: { heightM },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [p.lng - halfLng, p.lat - halfLat],
          [p.lng + halfLng, p.lat - halfLat],
          [p.lng + halfLng, p.lat + halfLat],
          [p.lng - halfLng, p.lat + halfLat],
          [p.lng - halfLng, p.lat - halfLat],
        ]],
      },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

type Props = {
  overlaySrc: string | null;
  interactive: HazardInteractiveMeta | null;
  engineLabel: string;
  riskClass?: string;
  // Height (metres) of the literal blue water surface drawn over the site. For River this is a
  // real modelled depth (GloFAS); for Floodplain/Rainfall - which only produce a 0-100
  // susceptibility score, not a physical depth - it's a stylized height scaled from that score.
  // `waterDepthModelled` tells the caption which case it is, so a susceptibility score never gets
  // presented as if it were a measured flood depth.
  waterDepthM: number;
  waterDepthModelled: boolean;
  waterDataAvailable: boolean;
};

// A tilted, orbitable 3D view of the same georeferenced result shown flat in the 2D overlay tabs -
// terrain relief plus the existing risk-overlay raster draped on the ground, with the analysis's
// own building footprints extruded and colored by threatened/not-threatened. Not a photorealistic
// flood simulation (no water-surface physics) - it reuses exactly the data already computed for the
// 2D tabs, just rendered from a perspective camera.
export default function HazardFlood3DView({
  overlaySrc,
  interactive,
  engineLabel,
  riskClass,
  waterDepthM,
  waterDepthModelled,
  waterDataAvailable,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const autoRotateRef = useRef(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    if (!containerRef.current || !interactive?.bounds_wgs84) return;
    if (!MAPBOX_TOKEN) {
      setLoadError("3D view needs a Mapbox access token to be configured.");
      return;
    }
    setLoadError(null);

    let disposed = false;
    containerRef.current.innerHTML = "";

    const { west, south, east, north } = interactive.bounds_wgs84;
    const centerLng = (west + east) / 2;
    const centerLat = (south + north) / 2;

    void (async () => {
      const [mapboxgl] = await Promise.all([loadMapboxGl(), loadMapboxGlCss()]);
      if (disposed || !containerRef.current) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [centerLng, centerLat],
        zoom: 15,
        pitch: 0,
        bearing: 0,
        antialias: true,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

      const stopAutoRotate = () => setAutoRotate(false);
      map.on("dragstart", stopAutoRotate);
      map.on("wheel", stopAutoRotate);
      map.on("touchstart", stopAutoRotate);

      map.on("moveend", () => {
        if (disposed || mapRef.current !== map || !autoRotateRef.current) return;
        map.easeTo({ bearing: map.getBearing() + 18, duration: 5000, easing: (t: number) => t });
      });

      map.on("load", () => {
        if (disposed || mapRef.current !== map) return;

        map.addSource("landcheck-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "landcheck-dem", exaggeration: 1.4 });

        if (!map.getLayer("sky")) {
          map.addLayer({
            id: "sky",
            type: "sky",
            paint: { "sky-type": "atmosphere", "sky-atmosphere-sun-intensity": 12 },
          });
        }

        // Hide the style's own generic building extrusions - our analysis-specific footprints
        // (colored by threatened/not-threatened below) would otherwise sit flush against them.
        if (map.getLayer("building")) {
          map.setLayoutProperty("building", "visibility", "none");
        }

        if (overlaySrc) {
          map.addSource("flood-drape", {
            type: "image",
            url: overlaySrc,
            coordinates: [
              [west, north],
              [east, north],
              [east, south],
              [west, south],
            ],
          });
          map.addLayer({
            id: "flood-drape-layer",
            type: "raster",
            source: "flood-drape",
            paint: { "raster-opacity": 0.5, "raster-fade-duration": 0 },
          });
        }

        const buildings = interactive.buildings || [];
        if (buildings.length) {
          map.addSource("flood-buildings", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: buildings.map((b) => ({
                type: "Feature",
                properties: { threatened: !!b.threatened },
                geometry: { type: "Polygon", coordinates: b.rings },
              })),
            },
          });
          map.addLayer({
            id: "flood-buildings-3d",
            type: "fill-extrusion",
            source: "flood-buildings",
            paint: {
              "fill-extrusion-color": ["case", ["get", "threatened"], "#ef4444", "#22c55e"],
              "fill-extrusion-height": 9,
              "fill-extrusion-base": 0,
              "fill-extrusion-opacity": 0.92,
            },
          });
        }

        // The literal "water" a non-technical viewer reads as flooding - one small translucent
        // blue tile per sample point the model actually flagged as flooded/susceptible, each
        // raised to that point's own height, so the water's shape follows the model's grid rather
        // than blanketing the whole analysis box regardless of what was actually at risk there.
        if (waterDataAvailable) {
          const cellWidthM = interactive.snap_threshold_m || 90;
          const waterGeojson = buildWaterTiles(interactive.value_points, interactive.value_key, cellWidthM);
          if (waterGeojson.features.length) {
            map.addSource("flood-water", { type: "geojson", data: waterGeojson });
            map.addLayer({
              id: "flood-water-surface",
              type: "fill-extrusion",
              source: "flood-water",
              paint: {
                "fill-extrusion-color": "#38bdf8",
                "fill-extrusion-height": ["get", "heightM"],
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.6,
                "fill-extrusion-vertical-gradient": true,
              },
            });
          }
        }

        map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding: 40, duration: 0 },
        );
        window.setTimeout(() => {
          if (disposed || mapRef.current !== map) return;
          map.easeTo({ pitch: 58, bearing: -18, duration: 1800 });
        }, 150);
      });
    })();

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [interactive, overlaySrc, waterDepthM, waterDepthModelled, waterDataAvailable]);

  if (!interactive?.bounds_wgs84) {
    return (
      <div className="hazard-empty">
        3D view isn't available for this result yet — switch to a tab with a georeferenced overlay first.
      </div>
    );
  }

  const plainSummary = !waterDataAvailable
    ? `No modelled ${engineLabel.toLowerCase()} at this location — no water shown.`
    : waterDepthModelled
      ? `Modelled floodwater could reach about ${waterDepthM.toFixed(1)} m deep here.`
      : `Illustrative water level for a "${riskClass ?? "—"}" susceptibility score — a stylized picture of the risk, not a measured flood depth.`;

  return (
    <div className="hazard-flood-3d">
      <p className="hazard-flood-3d-plain-summary">🌊 {plainSummary}</p>
      <div className="hazard-flood-3d-map" ref={containerRef} />
      {loadError && <p className="hazard-warning">{loadError}</p>}
      <div className="hazard-flood-3d-footer">
        <button
          type="button"
          className={`btn-outline hazard-flood-3d-rotate ${autoRotate ? "active" : ""}`}
          onClick={() => setAutoRotate((v) => !v)}
        >
          {autoRotate ? "Pause rotation" : "Auto-rotate"}
        </button>
        <div className="hazard-flood-3d-legend">
          <span><i className="hazard-flood-3d-swatch hazard-flood-3d-swatch--blue" /> Floodwater</span>
          <span><i className="hazard-flood-3d-swatch hazard-flood-3d-swatch--red" /> Building at risk</span>
          <span><i className="hazard-flood-3d-swatch hazard-flood-3d-swatch--green" /> Building clear</span>
        </div>
      </div>
      <p className="hazard-interactive-hint">Drag to orbit, scroll to zoom, right-click drag to change pitch.</p>
    </div>
  );
}
