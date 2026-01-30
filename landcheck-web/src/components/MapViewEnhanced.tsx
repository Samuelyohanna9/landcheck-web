import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/map-enhanced.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

type Point = {
  station: string;
  lng: number;
  lat: number;
};

type Props = {
  coordinates: Point[];
  onCoordinatesDrawn?: (coords: Point[]) => void;
  disabled?: boolean;
};

// Custom styles for Mapbox Draw - RED color scheme
const drawStyles = [
  // Polygon fill - active
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.3,
    },
  },
  // Polygon fill - inactive
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#ef4444",
      "fill-opacity": 0.2,
    },
  },
  // Polygon stroke - active
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "line-color": "#ef4444",
      "line-width": 3,
    },
  },
  // Polygon stroke - inactive
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: ["all", ["==", "active", "false"], ["==", "$type", "Polygon"]],
    paint: {
      "line-color": "#dc2626",
      "line-width": 3,
    },
  },
  // Line (while drawing)
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
  // Vertex points - active
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
  // Vertex points - inactive
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
  // Midpoints
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

export default function MapViewEnhanced({
  coordinates,
  onCoordinatesDrawn,
  disabled = false
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const isDrawingRef = useRef(false);

  // Handle polygon drawn on map
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
    // Remove closing coord if present
    const cleaned =
      ring.length > 3 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;

    // Convert to Point array with station names
    const points: Point[] = cleaned.map((coord, index) => ({
      station: String.fromCharCode(65 + index),
      lng: coord[0],
      lat: coord[1],
    }));

    isDrawingRef.current = true;
    onCoordinatesDrawn(points);

    // Reset flag after a short delay
    setTimeout(() => {
      isDrawingRef.current = false;
    }, 100);
  }, [onCoordinatesDrawn]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    containerRef.current.innerHTML = "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [7.5, 9.0], // Nigeria center
      zoom: 6,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add draw control with custom RED styles
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
      // Add empty source for polygon (from manual coords) - RED color
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

      // Add polygon fill layer - RED
      map.addLayer({
        id: "plot-fill",
        type: "fill",
        source: "plot-polygon",
        paint: {
          "fill-color": "#ef4444",
          "fill-opacity": 0.25,
        },
      });

      // Add polygon outline layer - RED
      map.addLayer({
        id: "plot-outline",
        type: "line",
        source: "plot-polygon",
        paint: {
          "line-color": "#dc2626",
          "line-width": 3,
        },
      });
    });

    // Draw event handlers
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

    mapRef.current = map;
    drawRef.current = draw;

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [handleDrawUpdate, onCoordinatesDrawn]);

  // Disable/enable draw controls
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ctrl = containerRef.current?.querySelector(".mapboxgl-ctrl-top-left") as HTMLElement | null;
    if (!ctrl) return;

    ctrl.style.pointerEvents = disabled ? "none" : "auto";
    ctrl.style.opacity = disabled ? "0.5" : "1";
  }, [disabled]);

  // Update polygon and markers when coordinates change (from manual input)
  useEffect(() => {
    const map = mapRef.current;
    const draw = drawRef.current;
    if (!map) return;

    // Skip if the change came from drawing
    if (isDrawingRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const validCoords = coordinates.filter(
      (c) => c.lng !== 0 || c.lat !== 0
    );

    // Clear draw features when updating from manual input
    if (draw) {
      const features = draw.getAll();
      if (features.features.length > 0) {
        draw.deleteAll();
      }
    }

    if (validCoords.length === 0) {
      // Reset polygon to empty
      const source = map.getSource("plot-polygon") as mapboxgl.GeoJSONSource;
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

    // Add markers for each point - RED markers
    validCoords.forEach((coord, index) => {
      const el = document.createElement("div");
      el.className = "map-marker";
      el.innerHTML = `<span>${coord.station || String.fromCharCode(65 + index)}</span>`;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([coord.lng, coord.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Update polygon if 3+ points
    if (validCoords.length >= 3) {
      const ringCoords = validCoords.map((c) => [c.lng, c.lat]);
      // Close the ring
      ringCoords.push(ringCoords[0]);

      const source = map.getSource("plot-polygon") as mapboxgl.GeoJSONSource;
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

      // Fit bounds to polygon
      const bounds = new mapboxgl.LngLatBounds();
      validCoords.forEach((c) => bounds.extend([c.lng, c.lat]));

      map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 18,
        duration: 1000,
      });
    } else {
      // Clear polygon if less than 3 points
      const source = map.getSource("plot-polygon") as mapboxgl.GeoJSONSource;
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

      // Still zoom to the points we have
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

  return (
    <div className={`map-enhanced-container ${disabled ? "disabled" : ""}`}>
      <div ref={containerRef} className="map-enhanced" />


      {/* Warning for incomplete polygon */}
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
