import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import { api } from "../api/client";
import {
  cacheTreeTasksOffline,
  cacheTreeTimelineOffline,
  getCachedTreeTasksOffline,
  getCachedTreeTimelineOffline,
} from "../offline/greenOffline";
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
  tree_height_m?: number | null;
  tree_origin?: string | null;
  attribution_scope?: string | null;
  count_in_planting_kpis?: boolean;
  count_in_carbon_scope?: boolean;
  custodian_name?: string | null;
};

type Props = {
  trees: TreePoint[];
  onAddTree: (lng: number, lat: number) => void;
  draftPoint?: { lng: number; lat: number } | null;
  onDraftMove?: (lng: number, lat: number) => void;
  enableDraw?: boolean;
  drawMode?: "point" | "polygon";
  drawActive?: boolean;
  onPolygonChange?: (geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any } | null) => void;
  onSelectTree?: (id: number) => void;
  onTreeInspect?: (detail: TreeInspectData | null) => void;
  onViewChange?: (view: { lng: number; lat: number; zoom: number; bearing: number; pitch: number }) => void;
  fitBounds?: { lng: number; lat: number }[] | null;
  assignmentAreas?: Array<{ id?: number | string; label?: string | null; geojson: any }>;
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
  tree_height_m: number | null;
  tree_origin: string;
  attribution_scope: string;
  count_in_planting_kpis: number;
  count_in_carbon_scope: number;
  custodian_name: string;
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
  tree_height_m: number | null;
  tree_origin: string;
  attribution_scope: string;
  count_in_planting_kpis: boolean;
  count_in_carbon_scope: boolean;
  custodian_name: string;
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
  healthy: {
    outer: "rgba(140, 223, 132, 0.8)",
    core: "#2f9e44",
    ring: "rgba(47, 158, 68, 0.74)",
  },
  pest: {
    outer: "rgba(252, 236, 179, 0.82)",
    core: "#e0a800",
    ring: "rgba(176, 125, 10, 0.74)",
  },
  disease: {
    outer: "rgba(255, 216, 173, 0.82)",
    core: "#f08c00",
    ring: "rgba(199, 95, 16, 0.74)",
  },
  need_watering: {
    outer: "rgba(180, 231, 255, 0.82)",
    core: "#0ea5e9",
    ring: "rgba(3, 105, 161, 0.74)",
  },
  need_protection: {
    outer: "rgba(230, 210, 255, 0.82)",
    core: "#a855f7",
    ring: "rgba(109, 40, 217, 0.74)",
  },
  need_replacement: {
    outer: "rgba(253, 176, 176, 0.82)",
    core: "#ef4444",
    ring: "rgba(185, 28, 28, 0.74)",
  },
  needs_replacement: {
    outer: "rgba(253, 176, 176, 0.82)",
    core: "#ef4444",
    ring: "rgba(185, 28, 28, 0.74)",
  },
  damaged: {
    outer: "rgba(253, 176, 176, 0.82)",
    core: "#dc2626",
    ring: "rgba(153, 27, 27, 0.74)",
  },
  dead: {
    outer: "rgba(253, 176, 176, 0.74)",
    core: "#e25353",
    ring: "rgba(190, 68, 68, 0.68)",
  },
  removed: {
    outer: "rgba(223, 223, 223, 0.82)",
    core: "#6b7280",
    ring: "rgba(75, 85, 99, 0.68)",
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
const ASSIGNMENT_AREA_SOURCE_ID = "assigned-planting-areas";
const ASSIGNMENT_AREA_FILL_LAYER_ID = "assigned-planting-areas-fill";
const ASSIGNMENT_AREA_LINE_LAYER_ID = "assigned-planting-areas-line";

const ACTIVE_TREE_STATUSES = new Set([
  "alive",
  "healthy",
  "pest",
  "disease",
  "needs_attention",
  "need_watering",
  "need_protection",
]);
const normalizeStatus = (status: string | null | undefined) => {
  const raw = (status || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (raw === "deseas" || raw === "diseased") return "disease";
  if (raw === "needreplacement" || raw === "needsreplacement") return "need_replacement";
  if (raw === "needs_replacement") return "need_replacement";
  return raw;
};
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
const formatHeight = (value: number | null | undefined) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "-";
  return `${numeric.toFixed(2)} m`;
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
    tree_height_m:
      Number.isFinite(Number(raw.tree_height_m)) && Number(raw.tree_height_m) >= 0
        ? Number(raw.tree_height_m)
        : null,
    tree_origin: String(raw.tree_origin || "new_planting"),
    attribution_scope: String(raw.attribution_scope || "full"),
    count_in_planting_kpis: Number(raw.count_in_planting_kpis ? 1 : 0),
    count_in_carbon_scope: Number(raw.count_in_carbon_scope ? 1 : 0),
    custodian_name: String(raw.custodian_name || ""),
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
          tree_height_m:
            Number.isFinite(Number(tree.tree_height_m)) && Number(tree.tree_height_m) >= 0
              ? Number(tree.tree_height_m)
              : null,
          tree_origin: String(tree.tree_origin || "new_planting"),
          attribution_scope: String(tree.attribution_scope || "full"),
          count_in_planting_kpis: tree.count_in_planting_kpis === false ? 0 : 1,
          count_in_carbon_scope: tree.count_in_carbon_scope === false ? 0 : 1,
          custodian_name: tree.custodian_name || "",
          is_alive: ACTIVE_TREE_STATUSES.has(normalizedStatus) ? 1 : 0,
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

const normalizeAreaGeometry = (value: any): { type: "Polygon" | "MultiPolygon"; coordinates: any } | null => {
  if (!value) return null;
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const geometry = raw?.type === "Feature" ? raw?.geometry : raw;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return null;
  return { type: geometry.type, coordinates: geometry.coordinates };
};

const buildAssignmentAreaFeatureCollection = (areas: Array<{ id?: number | string; label?: string | null; geojson: any }>) => {
  const features = (areas || [])
    .map((area, index) => {
      const geometry = normalizeAreaGeometry(area.geojson);
      if (!geometry) return null;
      return {
        type: "Feature",
        properties: {
          id: area.id ?? index + 1,
          label: area.label || `Assigned area ${index + 1}`,
        },
        geometry,
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
  const treeHeight = Number.isFinite(Number(tree.tree_height_m)) ? Number(tree.tree_height_m) : base.tree_height_m;
  const treeOrigin = String(tree.tree_origin || base.tree_origin || "new_planting");
  const attributionScope = String(tree.attribution_scope || base.attribution_scope || "full");
  const plantingScope = tree.count_in_planting_kpis ?? Boolean(base.count_in_planting_kpis);
  const carbonScope = tree.count_in_carbon_scope ?? Boolean(base.count_in_carbon_scope);
  const custodianName = String(tree.custodian_name || base.custodian_name || "");
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
      <p><strong>Height:</strong> ${escapeHtml(formatHeight(treeHeight))}</p>
      <p><strong>Origin:</strong> ${escapeHtml(statusLabel(treeOrigin))}</p>
      <p><strong>Attribution:</strong> ${escapeHtml(statusLabel(attributionScope))}</p>
      <p><strong>Scope:</strong> ${plantingScope ? "Planting KPI" : "No KPI"} / ${carbonScope ? "Carbon" : "No Carbon"}</p>
      ${custodianName ? `<p><strong>Custodian:</strong> ${escapeHtml(custodianName)}</p>` : ""}
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
  const treeHeight = Number.isFinite(Number(tree.tree_height_m)) ? Number(tree.tree_height_m) : base.tree_height_m;
  const treeOrigin = String(tree.tree_origin || base.tree_origin || "new_planting");
  const attributionScope = String(tree.attribution_scope || base.attribution_scope || "full");
  const plantingScope = tree.count_in_planting_kpis ?? Boolean(base.count_in_planting_kpis);
  const carbonScope = tree.count_in_carbon_scope ?? Boolean(base.count_in_carbon_scope);
  const custodianName = String(tree.custodian_name || base.custodian_name || "");
  return {
    id: base.id,
    status,
    status_label: statusLabel(status),
    species: String(tree.species || base.species || "-"),
    planting_date: String(tree.planting_date || base.planting_date || ""),
    notes: String(tree.notes || base.notes || ""),
    created_by: String(tree.created_by || base.created_by || "-"),
    photo_url: String(tree.photo_url || base.photo_url || taskPhoto || visitPhoto || ""),
    tree_height_m: Number.isFinite(Number(treeHeight)) ? Number(treeHeight) : null,
    tree_origin: treeOrigin,
    attribution_scope: attributionScope,
    count_in_planting_kpis: Boolean(plantingScope),
    count_in_carbon_scope: Boolean(carbonScope),
    custodian_name: custodianName,
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
  drawMode = "point",
  drawActive = true,
  onPolygonChange,
  onSelectTree,
  onTreeInspect,
  onViewChange,
  fitBounds,
  assignmentAreas = [],
  minHeight = 420,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const draftMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const onAddTreeRef = useRef(onAddTree);
  const onPolygonChangeRef = useRef(onPolygonChange);
  const onSelectTreeRef = useRef(onSelectTree);
  const onTreeInspectRef = useRef(onTreeInspect);
  const mapReadyRef = useRef(false);
  const mapErrorRef = useRef<string | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const clickPopupRef = useRef<mapboxgl.Popup | null>(null);
  const hoverTreeIdRef = useRef<number | null>(null);
  const clickTreeIdRef = useRef<number | null>(null);
  const suppressNextDrawDeleteRef = useRef(false);
  const drawActiveRef = useRef(drawActive);
  const drawModeRef = useRef<"point" | "polygon">(drawMode);
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
      try {
        const [tasksRes, timelineRes] = await Promise.allSettled([
          api.get(`/green/trees/${treeId}/tasks`),
          api.get(`/green/trees/${treeId}/timeline`),
        ]);

        let tasks = tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data) ? tasksRes.value.data : [];
        let timeline = timelineRes.status === "fulfilled" ? timelineRes.value.data : null;

        if (tasksRes.status === "fulfilled") {
          await cacheTreeTasksOffline(treeId, tasks).catch(() => {});
        } else {
          tasks = await getCachedTreeTasksOffline(treeId);
        }

        if (timelineRes.status === "fulfilled") {
          await cacheTreeTimelineOffline(treeId, timelineRes.value.data).catch(() => {});
        } else {
          timeline = await getCachedTreeTimelineOffline(treeId);
        }

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
        return detail;
      } finally {
        pendingDetailRef.current.delete(treeId);
      }
    })();

    pendingDetailRef.current.set(treeId, request);
    return request;
  };

  useEffect(() => {
    onAddTreeRef.current = onAddTree;
  }, [onAddTree]);

  useEffect(() => {
    onPolygonChangeRef.current = onPolygonChange;
  }, [onPolygonChange]);

  useEffect(() => {
    drawModeRef.current = drawMode;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !drawRef.current) return;
    if (!drawActiveRef.current) return;
    try {
      drawRef.current.changeMode(drawMode === "polygon" ? "draw_polygon" : "draw_point");
    } catch {
      // noop
    }
  }, [drawMode]);

  useEffect(() => {
    onSelectTreeRef.current = onSelectTree;
  }, [onSelectTree]);

  useEffect(() => {
    onTreeInspectRef.current = onTreeInspect;
  }, [onTreeInspect]);

  useEffect(() => {
    drawActiveRef.current = drawActive;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    if (drawActive) {
      map.getCanvas().style.cursor = "crosshair";
      // Re-enable draw controls if they exist
      if (drawRef.current) {
        try {
          drawRef.current.changeMode(drawModeRef.current === "polygon" ? "draw_polygon" : "draw_point");
        } catch { /* noop */ }
      }
    } else {
      map.getCanvas().style.cursor = "";
      // Switch draw to simple_select so it doesn't intercept taps
      if (drawRef.current) {
        try {
          drawRef.current.changeMode("simple_select");
          if (drawModeRef.current === "point") {
            drawRef.current.deleteAll();
          }
        } catch { /* noop */ }
      }
    }
  }, [drawActive]);

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
            point: drawMode === "point",
            polygon: drawMode === "polygon",
            trash: true,
          },
        });
        map.addControl(draw, "top-left");
        drawRef.current = draw;
      }

      map.on("error", (e) => {
        // eslint-disable-next-line no-console
        console.warn("Mapbox error:", e?.error || e);
        // Only show fatal error if the map never managed to load at all.
        // Tile/style loading errors when offline are expected and non-fatal —
        // the map still renders with cached tiles and blank areas for uncached ones.
        if (!mapReadyRef.current) {
          const msg = !navigator.onLine
            ? "Offline — map using cached tiles. Some areas may appear blank."
            : (e?.error?.message || "Map failed to load");
          setMapError(msg);
          mapErrorRef.current = msg;
        }
      });

      const timeout = window.setTimeout(() => {
        if (!mapReadyRef.current && !mapErrorRef.current) {
          setMapError(
            navigator.onLine
              ? "Map load timed out. Check network/token or domain restrictions."
              : "Offline — map loading from cache. Some tiles may be unavailable."
          );
        }
      }, navigator.onLine ? 12000 : 20000);

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

        if (!map.getSource(ASSIGNMENT_AREA_SOURCE_ID)) {
          map.addSource(ASSIGNMENT_AREA_SOURCE_ID, {
            type: "geojson",
            data: buildAssignmentAreaFeatureCollection(assignmentAreas),
          });
          map.addLayer({
            id: ASSIGNMENT_AREA_FILL_LAYER_ID,
            type: "fill",
            source: ASSIGNMENT_AREA_SOURCE_ID,
            paint: {
              "fill-color": "#22c55e",
              "fill-opacity": 0.14,
            },
          });
          map.addLayer({
            id: ASSIGNMENT_AREA_LINE_LAYER_ID,
            type: "line",
            source: ASSIGNMENT_AREA_SOURCE_ID,
            paint: {
              "line-color": "#15803d",
              "line-width": 2.4,
              "line-opacity": 0.95,
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
          // On touch devices, use click (which fires on tap) instead of touchstart
          // to avoid interfering with map pan/zoom gestures

          map.on("click", (event) => {
            const feature = map.queryRenderedFeatures(event.point, { layers: TREE_LAYER_IDS })[0];
            if (feature) return;
            clickTreeIdRef.current = null;
            if (clickPopupRef.current) {
              clickPopupRef.current.remove();
              clickPopupRef.current = null;
            }
            onTreeInspectRef.current?.(null);
            // Only place a tree when draw mode is active
            if (enableDraw && drawActiveRef.current) {
              onAddTreeRef.current(event.lngLat.lng, event.lngLat.lat);
            }
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
        const handleDrawGeometryChange = (e: any) => {
          if (!drawActiveRef.current) return;
          const feature = e?.features?.[0];
          if (!feature) return;

          const isPolygonMode = drawModeRef.current === "polygon";
          if (isPolygonMode) {
            const geometry = normalizeAreaGeometry(feature.geometry);
            if (!geometry) return;
            const draw = drawRef.current;
            const currentId = String(feature.id || "");
            if (draw && currentId) {
              const allFeatures = draw.getAll()?.features || [];
              allFeatures.forEach((item: any) => {
                const itemId = String(item?.id || "");
                if (itemId && itemId !== currentId) {
                  draw.delete(itemId);
                }
              });
            }
            onPolygonChangeRef.current?.(geometry);
            return;
          }

          if (feature.geometry?.type !== "Point") return;
          const [lng, lat] = feature.geometry.coordinates;
          onAddTreeRef.current(lng, lat);
        };

        map.on("draw.create", handleDrawGeometryChange);
        map.on("draw.update", handleDrawGeometryChange);

        map.on("draw.delete", () => {
          if (suppressNextDrawDeleteRef.current) {
            suppressNextDrawDeleteRef.current = false;
            return;
          }
          if (drawModeRef.current === "polygon") {
            onPolygonChangeRef.current?.(null);
            return;
          }
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
    // Tree photo/status can change after uploads or updates; clear detail cache
    // so sidebar/popup always reads the latest server state on next click.
    detailCacheRef.current.clear();
    pendingDetailRef.current.clear();
    source.setData(buildTreeFeatureCollection(trees));
  }, [trees, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(ASSIGNMENT_AREA_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildAssignmentAreaFeatureCollection(assignmentAreas));
  }, [assignmentAreas, mapReady]);

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
        const existing = drawRef.current.getAll()?.features?.length || 0;
        suppressNextDrawDeleteRef.current = existing > 0;
        drawRef.current.deleteAll();
        window.setTimeout(() => {
          suppressNextDrawDeleteRef.current = false;
        }, 0);
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
      const existing = drawRef.current.getAll()?.features?.length || 0;
      suppressNextDrawDeleteRef.current = existing > 0;
      drawRef.current.deleteAll();
      drawRef.current.add({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: [draftPoint.lng, draftPoint.lat],
        },
      });
      window.setTimeout(() => {
        suppressNextDrawDeleteRef.current = false;
      }, 0);
    }
  }, [draftPoint, onDraftMove, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = drawActive ? "crosshair" : "";
  }, [drawActive]);

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
