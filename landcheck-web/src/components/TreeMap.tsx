import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { api } from "../api/client";
import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/tree-map.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export type TreePoint = {
  id: number;
  lng: number;
  lat: number;
  status: string;
  species?: string | null;
  planting_date?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  created_by?: string | null;
};

type Props = {
  trees: TreePoint[];
  onAddTree: (lng: number, lat: number) => void;
  draftPoint?: { lng: number; lat: number } | null;
  onDraftMove?: (lng: number, lat: number) => void;
  enableDraw?: boolean;
  onSelectTree?: (id: number) => void;
  onTreeInspect?: (detail: TreeInspectData | null) => void;
  onViewChange?: (view: { lng: number; lat: number; zoom: number; bearing: number; pitch: number }) => void;
  fitBounds?: { lng: number; lat: number }[] | null;
  minHeight?: number;
};

type TreeFeatureProps = {
  id: number;
  status: string;
  status_label: string;
  species: string;
  planting_date: string;
  notes: string;
  created_by: string;
  photo_url: string;
  outer: string;
  core: string;
  ring: string;
  is_alive: number;
};

type TreePopupDetail = {
  tree: any | null;
  tasks: any[];
  visits: any[];
  maintenance: {
    total: number;
    done: number;
    pending: number;
    overdue: number;
  };
};

export type TreeInspectData = {
  id: number;
  status: string;
  status_label: string;
  species: string;
  planting_date: string;
  notes: string;
  created_by: string;
  photo_url: string;
  maintenance: {
    total: number;
    done: number;
    pending: number;
    overdue: number;
  };
  tasks: any[];
  visits: any[];
  loading: boolean;
};

const markerPalettes: Record<string, { outer: string; core: string; ring: string }> = {
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
const TREE_LAYER_IDS = [TREE_CORE_LAYER_ID, TREE_OUTER_LAYER_ID];

const normalizeStatus = (status: string | null | undefined) => (status || "").trim().toLowerCase();
const statusLabel = (status: string | null | undefined) =>
  normalizeStatus(status)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Unknown";

const escapeHtml = (value: string | null | undefined) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

const getFeatureProps = (feature: mapboxgl.MapboxGeoJSONFeature | undefined): TreeFeatureProps | null => {
  if (!feature) return null;
  const raw = feature.properties || {};
  const id = Number(raw.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    status: String(raw.status || "unknown"),
    status_label: String(raw.status_label || "Unknown"),
    species: String(raw.species || "-"),
    planting_date: String(raw.planting_date || ""),
    notes: String(raw.notes || ""),
    created_by: String(raw.created_by || "-"),
    photo_url: String(raw.photo_url || ""),
    outer: String(raw.outer || markerPalettes.alive.outer),
    core: String(raw.core || markerPalettes.alive.core),
    ring: String(raw.ring || markerPalettes.alive.ring),
    is_alive: Number(raw.is_alive || 0),
  };
};

const buildTreeFeatureCollection = (items: TreePoint[]) => {
  const features = items
    .map((tree) => {
      const lng = Number(tree.lng);
      const lat = Number(tree.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

      const normalizedStatus = normalizeStatus(tree.status) || "alive";
      const palette = markerPalettes[normalizedStatus] || markerPalettes.alive;

      return {
        type: "Feature",
        properties: {
          id: tree.id,
          status: normalizedStatus,
          status_label: statusLabel(normalizedStatus),
          species: tree.species || "-",
          planting_date: tree.planting_date || "",
          notes: tree.notes || "",
          created_by: tree.created_by || "-",
          photo_url: tree.photo_url || "",
          is_alive: normalizedStatus === "alive" ? 1 : 0,
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

const buildPopupHtml = (base: TreeFeatureProps, detail?: TreePopupDetail | null, loading = false) => {
  const tree = detail?.tree || {};
  const status = String(tree.status || base.status || "unknown");
  const species = String(tree.species || base.species || "-");
  const plantedBy = String(tree.created_by || base.created_by || "-");
  const plantedDate = String(tree.planting_date || base.planting_date || "");
  const notes = String(tree.notes || base.notes || "");
  const maintenance = detail?.maintenance || { total: 0, done: 0, pending: 0, overdue: 0 };
  const visitsCount = detail?.visits?.length || 0;
  const taskPhoto = (detail?.tasks || []).find((task: any) => String(task?.photo_url || "").trim())?.photo_url;
  const visitPhoto = (detail?.visits || []).find((visit: any) => String(visit?.photo_url || "").trim())?.photo_url;
  const hasPhoto = Boolean(tree.photo_url || base.photo_url || taskPhoto || visitPhoto);

  const recentTasks = (detail?.tasks || [])
    .slice(0, 3)
    .map((task: any) => {
      const taskType = escapeHtml(task.task_type || "task");
      const taskStatus = escapeHtml(statusLabel(task.status || "pending"));
      const assignee = escapeHtml(task.assignee_name || "-");
      return `<li>${taskType} (${taskStatus}) - ${assignee}</li>`;
    })
    .join("");

  return `
    <div class="tree-popup-card">
      <h4>Tree #${base.id}</h4>
      <p><strong>Status:</strong> ${escapeHtml(statusLabel(status))}</p>
      <p><strong>Planter:</strong> ${escapeHtml(plantedBy)}</p>
      <p><strong>Planted:</strong> ${escapeHtml(formatDate(plantedDate))}</p>
      <p><strong>Species:</strong> ${escapeHtml(species)}</p>
      ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ""}
      <p><strong>Photo:</strong> ${hasPhoto ? "Available" : "None"}</p>
      ${
        loading
          ? `<p class="tree-popup-muted">Loading maintenance...</p>`
          : `<p><strong>Maintenance:</strong> ${maintenance.total} total, ${maintenance.done} done, ${maintenance.pending} pending, ${maintenance.overdue} overdue</p>
             <p><strong>Visits:</strong> ${visitsCount}</p>
             ${recentTasks ? `<ul>${recentTasks}</ul>` : `<p class="tree-popup-muted">No maintenance records yet.</p>`}`
      }
    </div>
  `;
};

const buildInspectData = (base: TreeFeatureProps, detail?: TreePopupDetail | null, loading = false): TreeInspectData => {
  const tree = detail?.tree || {};
  const status = String(tree.status || base.status || "unknown");
  const taskPhoto = (detail?.tasks || []).find((task: any) => String(task?.photo_url || "").trim())?.photo_url;
  const visitPhoto = (detail?.visits || []).find((visit: any) => String(visit?.photo_url || "").trim())?.photo_url;
  return {
    id: base.id,
    status,
    status_label: statusLabel(status),
    species: String(tree.species || base.species || "-"),
    planting_date: String(tree.planting_date || base.planting_date || ""),
    notes: String(tree.notes || base.notes || ""),
    created_by: String(tree.created_by || base.created_by || "-"),
    photo_url: String(tree.photo_url || base.photo_url || taskPhoto || visitPhoto || ""),
    maintenance: detail?.maintenance || { total: 0, done: 0, pending: 0, overdue: 0 },
    tasks: detail?.tasks || [],
    visits: detail?.visits || [],
    loading,
  };
};

export default function TreeMap({
  trees,
  onAddTree,
  draftPoint,
  onDraftMove,
  enableDraw = true,
  onSelectTree,
  onTreeInspect,
  onViewChange,
  fitBounds,
  minHeight = 420,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const draftMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const onAddTreeRef = useRef(onAddTree);
  const onSelectTreeRef = useRef(onSelectTree);
  const onTreeInspectRef = useRef(onTreeInspect);
  const mapReadyRef = useRef(false);
  const mapErrorRef = useRef<string | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const clickPopupRef = useRef<mapboxgl.Popup | null>(null);
  const hoverTreeIdRef = useRef<number | null>(null);
  const clickTreeIdRef = useRef<number | null>(null);
  const detailCacheRef = useRef<Map<number, TreePopupDetail>>(new Map());
  const pendingDetailRef = useRef<Map<number, Promise<TreePopupDetail>>>(new Map());
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const getTreeDetail = async (treeId: number): Promise<TreePopupDetail> => {
    const cached = detailCacheRef.current.get(treeId);
    if (cached) return cached;

    const pending = pendingDetailRef.current.get(treeId);
    if (pending) return pending;

    const request = (async () => {
      const [tasksRes, timelineRes] = await Promise.allSettled([
        api.get(`/green/trees/${treeId}/tasks`),
        api.get(`/green/trees/${treeId}/timeline`),
      ]);

      const tasks = tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data) ? tasksRes.value.data : [];
      const timeline = timelineRes.status === "fulfilled" ? timelineRes.value.data : null;
      const visits = Array.isArray(timeline?.visits) ? timeline.visits : [];

      const maintenance = {
        total: tasks.length,
        done: tasks.filter((task: any) => normalizeStatus(task.status) === "done").length,
        pending: tasks.filter((task: any) => normalizeStatus(task.status) === "pending").length,
        overdue: tasks.filter((task: any) => normalizeStatus(task.status) === "overdue").length,
      };

      const detail: TreePopupDetail = {
        tree: timeline?.tree || null,
        tasks,
        visits,
        maintenance,
      };
      detailCacheRef.current.set(treeId, detail);
      pendingDetailRef.current.delete(treeId);
      return detail;
    })();

    pendingDetailRef.current.set(treeId, request);
    return request;
  };

  useEffect(() => {
    onAddTreeRef.current = onAddTree;
  }, [onAddTree]);

  useEffect(() => {
    onSelectTreeRef.current = onSelectTree;
  }, [onSelectTree]);

  useEffect(() => {
    onTreeInspectRef.current = onTreeInspect;
  }, [onTreeInspect]);

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

          // Only active (alive) trees keep the outer halo circle.
          map.addLayer({
            id: TREE_OUTER_LAYER_ID,
            type: "circle",
            source: TREE_SOURCE_ID,
            filter: ["==", ["get", "is_alive"], 1],
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
              "circle-stroke-color": ["coalesce", ["get", "ring"], "#2f7e34"],
            },
          });

          const supportsHover =
            typeof window !== "undefined" &&
            window.matchMedia("(hover: hover) and (pointer: fine)").matches;

          const openDetailPopup = (
            props: TreeFeatureProps,
            lngLat: mapboxgl.LngLatLike,
            mode: "hover" | "click"
          ) => {
            const popupRef = mode === "hover" ? hoverPopupRef : clickPopupRef;
            const currentTreeRef = mode === "hover" ? hoverTreeIdRef : clickTreeIdRef;

            currentTreeRef.current = props.id;
            const detail = detailCacheRef.current.get(props.id);

            if (!popupRef.current) {
              popupRef.current = new mapboxgl.Popup({
                closeButton: mode === "click",
                closeOnClick: false,
                offset: mode === "click" ? 16 : 14,
                className: "tree-detail-popup",
              });
            }

            popupRef.current
              .setLngLat(lngLat)
              .setHTML(buildPopupHtml(props, detail, !detail))
              .addTo(map);

            getTreeDetail(props.id)
              .then((loadedDetail) => {
                if (currentTreeRef.current !== props.id || !popupRef.current) return;
                popupRef.current.setHTML(buildPopupHtml(props, loadedDetail, false));
              })
              .catch(() => {
                if (currentTreeRef.current !== props.id || !popupRef.current) return;
                popupRef.current.setHTML(buildPopupHtml(props, null, false));
              });
          };

          if (supportsHover) {
            map.on("mousemove", (event) => {
              const feature = map.queryRenderedFeatures(event.point, { layers: TREE_LAYER_IDS })[0];
              const props = getFeatureProps(feature);
              if (!props) {
                hoverTreeIdRef.current = null;
                if (hoverPopupRef.current) {
                  hoverPopupRef.current.remove();
                  hoverPopupRef.current = null;
                }
                if (!clickPopupRef.current) {
                  map.getCanvas().style.cursor = "crosshair";
                }
                return;
              }
              map.getCanvas().style.cursor = "pointer";
              openDetailPopup(props, event.lngLat, "hover");
            });
          }

          const onTreePress = (event: mapboxgl.MapLayerMouseEvent | mapboxgl.MapTouchEvent) => {
            const props = getFeatureProps(event.features?.[0]);
            if (!props) return;
            onSelectTreeRef.current?.(props.id);

            const cachedDetail = detailCacheRef.current.get(props.id);
            if (onTreeInspectRef.current) {
              onTreeInspectRef.current(buildInspectData(props, cachedDetail, !cachedDetail));
              getTreeDetail(props.id)
                .then((loadedDetail) => {
                  onTreeInspectRef.current?.(buildInspectData(props, loadedDetail, false));
                })
                .catch(() => {
                  onTreeInspectRef.current?.(buildInspectData(props, null, false));
                });
              return;
            }

            openDetailPopup(props, event.lngLat, "click");
          };

          map.on("click", TREE_CORE_LAYER_ID, onTreePress);
          map.on("click", TREE_OUTER_LAYER_ID, onTreePress);
          map.on("touchstart", TREE_CORE_LAYER_ID, onTreePress);
          map.on("touchstart", TREE_OUTER_LAYER_ID, onTreePress);

          map.on("click", (event) => {
            const feature = map.queryRenderedFeatures(event.point, { layers: TREE_LAYER_IDS })[0];
            if (feature) return;
            clickTreeIdRef.current = null;
            if (clickPopupRef.current) {
              clickPopupRef.current.remove();
              clickPopupRef.current = null;
            }
            onTreeInspectRef.current?.(null);
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
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
      if (clickPopupRef.current) {
        clickPopupRef.current.remove();
        clickPopupRef.current = null;
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
      <div ref={containerRef} className="tree-map" style={{ minHeight }} />
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
