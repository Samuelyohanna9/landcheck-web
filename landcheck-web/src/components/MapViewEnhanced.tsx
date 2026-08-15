import { memo, useEffect, useRef, useCallback } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "../styles/map-enhanced.css";
import { loadMapboxDraw, loadMapboxGl } from "../utils/mapboxLoader";

type Point = {
  station: string;
  lng: number;
  lat: number;
};

type Props = {
  coordinates: Point[];
  onCoordinatesDrawn?: (coords: Point[]) => void;
  disabled?: boolean;
  lightweight?: boolean;
  coordinateSystem?: string;
};

// Nigeria spans UTM zones 31N-33N, split at fixed meridians - picking the wrong zone for a
// location is a real, easy-to-make mistake, so show the selected zone's boundary on the map as
// soon as it's chosen, before a single point is even entered. Only meaningful for a projected
// system (UTM or Minna Datum, which is UTM on a different reference ellipsoid/datum shift but the
// same zone boundaries) - WGS84 has no zone concept, so nothing is drawn for it.
const UTM_ZONE_BOUNDARIES: Record<string, { label: string; westLng: number; eastLng: number }> = {
  utm_31n: { label: "UTM Zone 31N", westLng: 0, eastLng: 6 },
  minna_31: { label: "Minna Datum Zone 31", westLng: 0, eastLng: 6 },
  utm_32n: { label: "UTM Zone 32N", westLng: 6, eastLng: 12 },
  minna_32: { label: "Minna Datum Zone 32", westLng: 6, eastLng: 12 },
  utm_33n: { label: "UTM Zone 33N", westLng: 12, eastLng: 18 },
  minna_33: { label: "Minna Datum Zone 33", westLng: 12, eastLng: 18 },
};
const ZONE_BOUNDARY_LAT_SPAN: [number, number] = [-2, 16]; // generous margin around Nigeria's real 4°N-14°N extent

const emptyZoneCollection = () => ({
  type: "FeatureCollection" as const,
  features: [] as any[],
});

const zoneBoundaryCollection = (system: string | undefined) => {
  const zone = system ? UTM_ZONE_BOUNDARIES[system] : undefined;
  if (!zone) return emptyZoneCollection();
  const [southLat, northLat] = ZONE_BOUNDARY_LAT_SPAN;
  const meridian = (lng: number) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: [[lng, southLat], [lng, northLat]] },
  });
  return {
    type: "FeatureCollection" as const,
    features: [meridian(zone.westLng), meridian(zone.eastLng)],
  };
};

const drawStyles = [
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.3,
    },
  },
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.2,
    },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "line-color": "#ef4444",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
    paint: {
      "line-color": "#dc2626",
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-line",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"]],
    paint: {
      "line-color": "#ef4444",
      "line-width": 3,
      "line-dasharray": [2, 2],
    },
  },
  {
    id: "gl-draw-point-active",
    type: "circle",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 8,
      "circle-color": "#ef4444",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  },
  {
    id: "gl-draw-point-inactive",
    type: "circle",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 6,
      "circle-color": "#dc2626",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fca5a5",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  },
];

function MapViewEnhanced({
  coordinates,
  onCoordinatesDrawn,
  disabled = false,
  lightweight = false,
  coordinateSystem,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const mapboxglRef = useRef<any>(null);
  const isDrawingRef = useRef(false);

  const handleDrawUpdate = useCallback(() => {
    if (!drawRef.current || !onCoordinatesDrawn) return;

    const data = drawRef.current.getAll();
    if (!data.features.length) {
      return;
    }

    const geom = data.features[0].geometry;
    if (geom.type !== "Polygon") {
      return;
    }

    const ring = geom.coordinates[0] as number[][];
    const cleaned =
      ring.length > 3 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;

    const points: Point[] = cleaned.map((coord, index) => ({
      station: String.fromCharCode(65 + index),
      lng: coord[0],
      lat: coord[1],
    }));

    isDrawingRef.current = true;
    onCoordinatesDrawn(points);

    setTimeout(() => {
      isDrawingRef.current = false;
    }, 100);
  }, [onCoordinatesDrawn]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    containerRef.current.innerHTML = "";
    let disposed = false;

    void (async () => {
      const mapboxgl = await loadMapboxGl();
      if (disposed || !containerRef.current || mapRef.current) return;

      mapboxglRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: lightweight
          ? "mapbox://styles/mapbox/streets-v12"
          : "mapbox://styles/mapbox/satellite-streets-v12",
        center: [7.5, 9.0],
        zoom: 6,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current = map;

      const MapboxDraw = await loadMapboxDraw();
      if (disposed || mapRef.current !== map) return;

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        defaultMode: "simple_select",
        styles: drawStyles,
      });

      map.addControl(draw, "top-left");

      map.on("load", () => {
        map.addSource("plot-polygon", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [[]],
            },
          },
        });

        map.addLayer({
          id: "plot-fill",
          type: "fill",
          source: "plot-polygon",
          paint: {
            "fill-color": "#ef4444",
            "fill-opacity": 0.25,
          },
        });

        map.addLayer({
          id: "plot-outline",
          type: "line",
          source: "plot-polygon",
          paint: {
            "line-color": "#dc2626",
            "line-width": 3,
          },
        });

        map.addSource("utm-zone-boundary", {
          type: "geojson",
          data: zoneBoundaryCollection(coordinateSystem),
        });

        map.addLayer({
          id: "utm-zone-boundary-line",
          type: "line",
          source: "utm-zone-boundary",
          paint: {
            "line-color": "#f59e0b",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });
      });

      map.on("draw.create", handleDrawUpdate);
      map.on("draw.update", handleDrawUpdate);
      map.on("draw.delete", () => {
        if (onCoordinatesDrawn) {
          onCoordinatesDrawn([
            { station: "A", lng: 0, lat: 0 },
            { station: "B", lng: 0, lat: 0 },
            { station: "C", lng: 0, lat: 0 },
          ]);
        }
      });

      drawRef.current = draw;
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      drawRef.current = null;
      mapboxglRef.current = null;
    };
  }, [handleDrawUpdate, lightweight, onCoordinatesDrawn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ctrl = containerRef.current?.querySelector(".mapboxgl-ctrl-top-left") as HTMLElement | null;
    if (!ctrl) return;

    ctrl.style.pointerEvents = disabled ? "none" : "auto";
    ctrl.style.opacity = disabled ? "0.5" : "1";
  }, [disabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyZoneData = () => {
      const source = map.getSource("utm-zone-boundary") as any;
      if (source) source.setData(zoneBoundaryCollection(coordinateSystem));
    };
    if (map.isStyleLoaded() && map.getSource("utm-zone-boundary")) {
      applyZoneData();
    } else {
      map.once("load", applyZoneData);
    }
  }, [coordinateSystem]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;

    const resizeNow = () => {
      try {
        map.resize();
      } catch {
      }
    };

    const observer = new ResizeObserver(() => resizeNow());
    observer.observe(el);

    const onWindowResize = () => resizeNow();
    window.addEventListener("resize", onWindowResize);

    const t1 = window.setTimeout(resizeNow, 0);
    const t2 = window.setTimeout(resizeNow, 180);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onWindowResize);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const draw = drawRef.current;
    const mapboxgl = mapboxglRef.current;
    if (!map || !mapboxgl) return;

    if (isDrawingRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const validCoords = coordinates.filter(
      (c) => c.lng !== 0 || c.lat !== 0
    );

    if (draw) {
      const features = draw.getAll();
      if (features.features.length > 0) {
        draw.deleteAll();
      }
    }

    if (validCoords.length === 0) {
      const source = map.getSource("plot-polygon") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[]],
          },
        });
      }
      return;
    }

    validCoords.forEach((coord, index) => {
      const el = document.createElement("div");
      el.className = "map-marker";
      el.innerHTML = `<span>${coord.station || String.fromCharCode(65 + index)}</span>`;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([coord.lng, coord.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (validCoords.length >= 3) {
      const ringCoords = validCoords.map((c) => [c.lng, c.lat]);
      ringCoords.push(ringCoords[0]);

      const source = map.getSource("plot-polygon") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [ringCoords],
          },
        });
      }

      const bounds = new mapboxgl.LngLatBounds();
      validCoords.forEach((c) => bounds.extend([c.lng, c.lat]));

      map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 18,
        duration: 1000,
      });
    } else {
      const source = map.getSource("plot-polygon") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[]],
          },
        });
      }

      if (validCoords.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        validCoords.forEach((c) => bounds.extend([c.lng, c.lat]));
        map.fitBounds(bounds, {
          padding: 80,
          maxZoom: 16,
          duration: 1000,
        });
      }
    }
  }, [coordinates]);

  const hasValidCoords = coordinates.filter(c => c.lng !== 0 || c.lat !== 0).length > 0;
  const activeZone = coordinateSystem ? UTM_ZONE_BOUNDARIES[coordinateSystem] : undefined;

  return (
    <div className={`map-enhanced-container ${disabled ? "disabled" : ""}`}>
      <div ref={containerRef} className="map-enhanced" />

      {activeZone && (
        <div className="map-zone-badge">
          <span className="map-zone-badge-swatch" aria-hidden="true" />
          <span>{activeZone.label} boundary</span>
        </div>
      )}

      {hasValidCoords && coordinates.filter(c => c.lng !== 0 || c.lat !== 0).length < 3 && (
        <div className="map-warning">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>Need at least 3 points to form a polygon</span>
        </div>
      )}
    </div>
  );
}

export default memo(MapViewEnhanced);
