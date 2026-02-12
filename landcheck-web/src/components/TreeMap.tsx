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
  fitBounds?: { lng: number; lat: number }[] | null;
};

const markerPalettes: Record<string, { outer: string; core: string; ring: string }> = {
  // Requested style: soft green circle with a smaller center dot.
  alive: {
    outer: "rgba(150, 223, 138, 0.78)",
    core: "#4caf50",
    ring: "rgba(88, 171, 80, 0.72)",
  },
  dead: {
    outer: "rgba(253, 176, 176, 0.74)",
    core: "#e25353",
    ring: "rgba(190, 68, 68, 0.68)",
  },
  needs_attention: {
    outer: "rgba(252, 218, 150, 0.76)",
    core: "#de9a1f",
    ring: "rgba(176, 118, 24, 0.68)",
  },
  pending_planting: {
    outer: "rgba(170, 211, 255, 0.78)",
    core: "#3b82f6",
    ring: "rgba(41, 104, 215, 0.7)",
  },
};

const TREE_SOURCE_ID = "tree-points";
const TREE_OUTER_LAYER_ID = "tree-points-outer";
const TREE_CORE_LAYER_ID = "tree-points-core";

const buildTreeFeatureCollection = (items: TreePoint[]) => {
  const features = items
    .map((tree) => {
      const lng = Number(tree.lng);
      const lat = Number(tree.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      const palette = markerPalettes[tree.status] || markerPalettes.alive;
      return {
        type: "Feature",
        properties: {
          id: tree.id,
          outer: palette.outer,
          core: palette.core,
          ring: palette.ring,
        },
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      };
    })
    .filter((feature) => feature !== null);

  return {
    type: "FeatureCollection",
    features,
  } as any;
};

export default function TreeMap({
  trees,
  onAddTree,
  draftPoint,
  onDraftMove,
  enableDraw = true,
  onSelectTree,
  onViewChange,
  fitBounds,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
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
            id: "draft-point-layer-outer",
            type: "circle",
            source: "draft-point",
            paint: {
              "circle-radius": 12,
              "circle-color": "#95df8a",
              "circle-opacity": 0.72,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#57ab4f",
            },
          });
          map.addLayer({
            id: "draft-point-layer-core",
            type: "circle",
            source: "draft-point",
            paint: {
              "circle-radius": 4,
              "circle-color": "#4caf50",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#337f38",
            },
          });
        }

        if (!map.getSource(TREE_SOURCE_ID)) {
          map.addSource(TREE_SOURCE_ID, {
            type: "geojson",
            data: buildTreeFeatureCollection(trees),
          });
          map.addLayer({
            id: TREE_OUTER_LAYER_ID,
            type: "circle",
            source: TREE_SOURCE_ID,
            paint: {
              "circle-radius": 12,
              "circle-color": ["coalesce", ["get", "outer"], markerPalettes.alive.outer],
              "circle-stroke-width": 1,
              "circle-stroke-color": ["coalesce", ["get", "ring"], markerPalettes.alive.ring],
            },
          });
          map.addLayer({
            id: TREE_CORE_LAYER_ID,
            type: "circle",
            source: TREE_SOURCE_ID,
            paint: {
              "circle-radius": 4,
              "circle-color": ["coalesce", ["get", "core"], markerPalettes.alive.core],
              "circle-stroke-width": 1,
              "circle-stroke-color": "#2f7e34",
            },
          });

          const onTreeClick = (event: mapboxgl.MapLayerMouseEvent) => {
            const feature = event.features?.[0];
            if (!feature) return;
            const id = Number(feature.properties?.id);
            if (!Number.isFinite(id)) return;
            onSelectTreeRef.current?.(id);
          };

          const onPointerEnter = () => {
            map.getCanvas().style.cursor = "pointer";
          };
          const onPointerLeave = () => {
            map.getCanvas().style.cursor = "crosshair";
          };

          map.on("click", TREE_OUTER_LAYER_ID, onTreeClick);
          map.on("click", TREE_CORE_LAYER_ID, onTreeClick);
          map.on("mouseenter", TREE_OUTER_LAYER_ID, onPointerEnter);
          map.on("mouseleave", TREE_OUTER_LAYER_ID, onPointerLeave);
          map.on("mouseenter", TREE_CORE_LAYER_ID, onPointerEnter);
          map.on("mouseleave", TREE_CORE_LAYER_ID, onPointerLeave);
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
    if (!map || !mapReady || !fitBounds || fitBounds.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    fitBounds.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 17 });
  }, [fitBounds, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(TREE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildTreeFeatureCollection(trees));
  }, [trees, mapReady]);

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
      el.innerHTML = '<span class="tree-marker-core" aria-hidden="true"></span>';
      const marker = new mapboxgl.Marker({ element: el, draggable: true, anchor: "center", offset: [0, 0] })
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
        <div className="tree-map-overlay">Loading map...</div>
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

