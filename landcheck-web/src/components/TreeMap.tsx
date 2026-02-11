import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/tree-map.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export type TreePoint = {
  id: number;
  lng: number;
  lat: number;
  status: string;
};

type Props = {
  trees: TreePoint[];
  onAddTree: (lng: number, lat: number) => void;
  draftPoint?: { lng: number; lat: number } | null;
  onDraftMove?: (lng: number, lat: number) => void;
  enableDraw?: boolean;
  onSelectTree?: (id: number) => void;
  onViewChange?: (view: { lng: number; lat: number; zoom: number; bearing: number; pitch: number }) => void;
};

const statusColors: Record<string, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  needs_attention: "#f59e0b",
  pending_planting: "#3b82f6",
};

export default function TreeMap({
  trees,
  onAddTree,
  draftPoint,
  onDraftMove,
  enableDraw = true,
  onSelectTree,
  onViewChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const draftMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const onAddTreeRef = useRef(onAddTree);
  const onSelectTreeRef = useRef(onSelectTree);
  const mapReadyRef = useRef(false);
  const mapErrorRef = useRef<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onAddTreeRef.current = onAddTree;
  }, [onAddTree]);

  useEffect(() => {
    onSelectTreeRef.current = onSelectTree;
  }, [onSelectTree]);

  useEffect(() => {
    if (mapRef.current) return;

    if (!mapboxgl.accessToken) {
      setMapError("Missing Mapbox token (VITE_MAPBOX_TOKEN).");
      return;
    }

    const initMap = () => {
      if (!containerRef.current || mapRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [7.5, 9.0],
        zoom: 6,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      if (enableDraw) {
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {
            point: true,
            trash: true,
          },
        });
        map.addControl(draw, "top-left");
        drawRef.current = draw;
      }
      map.on("error", (e) => {
        // Surface map errors in console for quick diagnosis
        // eslint-disable-next-line no-console
        console.error("Mapbox error:", e?.error || e);
        setMapError(e?.error?.message || "Map failed to load");
        mapErrorRef.current = e?.error?.message || "Map failed to load";
      });

      const timeout = window.setTimeout(() => {
        if (!mapReadyRef.current && !mapErrorRef.current) {
          setMapError("Map load timed out. Check network/token or domain restrictions.");
        }
      }, 8000);

      map.once("load", () => {
        window.clearTimeout(timeout);
        setMapReady(true);
        mapReadyRef.current = true;
        map.resize();

        if (!map.getSource("draft-point")) {
          map.addSource("draft-point", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [],
            },
          });
          map.addLayer({
            id: "draft-point-layer",
            type: "circle",
            source: "draft-point",
            paint: {
              "circle-radius": 7,
              "circle-color": "#22c55e",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#0f172a",
            },
          });
        }
        if (onViewChange) {
          const center = map.getCenter();
          onViewChange({
            lng: Number(center.lng.toFixed(6)),
            lat: Number(center.lat.toFixed(6)),
            zoom: Number(map.getZoom().toFixed(2)),
            bearing: Number(map.getBearing().toFixed(2)),
            pitch: Number(map.getPitch().toFixed(2)),
          });
        }
      });

      map.on("moveend", () => {
        if (!onViewChange) return;
        const center = map.getCenter();
        onViewChange({
          lng: Number(center.lng.toFixed(6)),
          lat: Number(center.lat.toFixed(6)),
          zoom: Number(map.getZoom().toFixed(2)),
          bearing: Number(map.getBearing().toFixed(2)),
          pitch: Number(map.getPitch().toFixed(2)),
        });
      });

      if (enableDraw) {
        map.on("draw.create", (e: any) => {
          const feature = e?.features?.[0];
          if (!feature || feature.geometry?.type !== "Point") return;
          const [lng, lat] = feature.geometry.coordinates;
          onAddTreeRef.current(lng, lat);
        });

        map.on("draw.delete", () => {
          onAddTreeRef.current(0, 0);
        });
      }

      mapRef.current = map;
      return () => {
        window.clearTimeout(timeout);
        map.remove();
      };
    };

    const timer = window.setInterval(() => {
      initMap();
      if (mapRef.current) {
        window.clearInterval(timer);
      }
    }, 200);

    return () => {
      window.clearInterval(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      if (drawRef.current) {
        drawRef.current = null;
      }
    };
  }, [enableDraw]);

  useEffect(() => {
    if (mapReady) {
      setMapError(null);
    }
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    trees.forEach((t) => {
      const el = document.createElement("div");
      el.className = "tree-marker";
      el.style.background = statusColors[t.status] || "#22c55e";
      el.title = `Tree ${t.id}`;
      el.onclick = () => onSelectTreeRef.current?.(t.id);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([t.lng, t.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [trees]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!draftPoint || (draftPoint.lng === 0 && draftPoint.lat === 0)) {
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      const source = map.getSource("draft-point") as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData({ type: "FeatureCollection", features: [] });
      }
      if (drawRef.current) {
        drawRef.current.deleteAll();
      }
      return;
    }

    if (!draftMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "tree-marker draft";
      const marker = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([draftPoint.lng, draftPoint.lat])
        .addTo(map);

      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        onDraftMove?.(lngLat.lng, lngLat.lat);
      });

      draftMarkerRef.current = marker;
    } else {
      draftMarkerRef.current.setLngLat([draftPoint.lng, draftPoint.lat]);
    }

    const source = map.getSource("draft-point") as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: [draftPoint.lng, draftPoint.lat],
            },
          },
        ],
      });
    }
    if (drawRef.current) {
      drawRef.current.deleteAll();
      drawRef.current.add({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: [draftPoint.lng, draftPoint.lat],
        },
      });
    }
  }, [draftPoint, onDraftMove, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = "crosshair";
  }, []);

  return (
    <div className="tree-map-wrap">
      <div ref={containerRef} className="tree-map" style={{ minHeight: 420 }} />
      {!mapReady && !mapError && (
        <div className="tree-map-overlay">Loading map…</div>
      )}
      {mapError && (
        <div className="tree-map-overlay">
          <strong>Map error</strong>
          <span>{mapError}</span>
          {!mapboxgl.accessToken && <span>Missing Mapbox token.</span>}
        </div>
      )}
    </div>
  );
}
