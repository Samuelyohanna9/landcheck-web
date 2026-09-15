import { useEffect, useRef, useState } from "react";
import EstateIcon from "./EstateIcon";
import Spinner from "./EstateSpinner";
import { loadMapboxDraw, loadMapboxDrawCss, loadMapboxGl, loadMapboxGlCss, MAPBOX_TOKEN } from "../../utils/mapboxLoader";

type LayoutCriteria = {
  target_plot_area_sqm: number;
  road_width_m: number;
  edge_reserve_m: number;
  drainage_reserve_m: number;
  open_space_percent: number;
  frontage_m?: number | null;
  orientation_deg: number;
  plot_prefix: string;
  max_plots: number;
  include_open_space: boolean;
  include_drainage: boolean;
  include_roads: boolean;
};

type Props = {
  boundaryPresent: boolean;
  proposal: any | null;
  busy?: boolean;
  message?: string;
  messageTone?: "good" | "danger";
  onGenerate: (criteria: LayoutCriteria) => void;
  onDecision: (proposalId: number, status: "approved" | "rejected") => void;
  onEditCandidates?: (proposalId: number, plotCandidates: any[], featureCandidates?: any[]) => Promise<void>;
  onAddFeature?: OnAddFeature;
};

const DEFAULT_CRITERIA: LayoutCriteria = {
  target_plot_area_sqm: 500,
  road_width_m: 10,
  edge_reserve_m: 5,
  drainage_reserve_m: 3,
  open_space_percent: 10,
  frontage_m: null,
  orientation_deg: 0,
  plot_prefix: "P",
  max_plots: 500,
  include_open_space: true,
  include_drainage: true,
  include_roads: true,
};

// Ready-made starting points reflecting common practice on Nigerian residential estates - the
// plot sizes, road widths and reserve allowances developers and surveyors typically work from for
// each tier. These are conveniences to speed up the first draft, not statutory standards: the
// backend schema and the copy below both say so, and every value stays editable in "Fine-tune".
type LayoutTemplateKey = "affordable" | "standard" | "premium" | "luxury" | "mixed_use" | "custom";

type LayoutTemplate = {
  key: LayoutTemplateKey;
  name: string;
  density: string;
  plotSizeLabel: string;
  description: string;
  criteria: Partial<LayoutCriteria>;
};

const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    key: "affordable",
    name: "Affordable / Mass Housing",
    density: "High density",
    plotSizeLabel: "300 m² plots (≈10 x 30m)",
    description: "Maximises plot yield for mass-housing and low-cost schemes, with narrower access roads and smaller reserves - similar to typical FHA-style estates.",
    criteria: { target_plot_area_sqm: 300, frontage_m: 10, road_width_m: 9, edge_reserve_m: 3, drainage_reserve_m: 1.5, open_space_percent: 10 },
  },
  {
    key: "standard",
    name: "Standard Residential",
    density: "Medium density",
    plotSizeLabel: "450 m² plots (≈15 x 30m)",
    description: "The most common private residential estate size in Nigeria - semi-detached and terrace duplexes on standard 12m internal roads.",
    criteria: { target_plot_area_sqm: 450, frontage_m: 15, road_width_m: 12, edge_reserve_m: 4.5, drainage_reserve_m: 2, open_space_percent: 12 },
  },
  {
    key: "premium",
    name: "Premium Residential",
    density: "Low density",
    plotSizeLabel: "650 m² plots (≈18 x 36m)",
    description: "Detached duplexes and bungalows with wider frontages, roomier roads and a larger open-space allowance.",
    criteria: { target_plot_area_sqm: 650, frontage_m: 18, road_width_m: 15, edge_reserve_m: 6, drainage_reserve_m: 2.5, open_space_percent: 15 },
  },
  {
    key: "luxury",
    name: "Luxury Estate",
    density: "Very low density",
    plotSizeLabel: "1,000 m² plots (≈25 x 40m)",
    description: "Large detached plots for high-end gated estates, with boulevard-style internal roads and a generous green-space reserve.",
    criteria: { target_plot_area_sqm: 1000, frontage_m: 25, road_width_m: 18, edge_reserve_m: 9, drainage_reserve_m: 3, open_space_percent: 18 },
  },
  {
    key: "mixed_use",
    name: "Mixed-Use / Commercial Frontage",
    density: "Medium density",
    plotSizeLabel: "600 m² plots, wide frontage",
    description: "Wider shop-frontage plots for residential-commercial use, with roads sized for higher traffic and on-street parking.",
    criteria: { target_plot_area_sqm: 600, frontage_m: 20, road_width_m: 18, edge_reserve_m: 3, drainage_reserve_m: 2, open_space_percent: 8 },
  },
  {
    key: "custom",
    name: "Custom",
    density: "You decide",
    plotSizeLabel: "Set every value yourself",
    description: "Start from the system defaults and set every measurement below by hand.",
    criteria: {},
  },
];

const coordinatePairs = (value: any): number[][] => {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && value.every((item) => typeof item === "number")) return [value as number[]];
  return value.flatMap(coordinatePairs);
};

function LayoutPreview({ proposal }: { proposal: any }) {
  const geometries = [
    ...(proposal?.candidates || []).map((candidate: any) => ({ geometry: candidate.geometry, kind: "plot", label: candidate.plot_number })),
    ...(proposal?.features || []).map((feature: any) => ({ geometry: feature.geometry, kind: feature.feature_type, label: feature.name })),
  ];
  const coordinates = geometries.flatMap((item) => coordinatePairs(item.geometry?.coordinates));
  if (!coordinates.length) return <p className="edash-tab-empty">Your preview will appear here.</p>;
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const project = (coordinate: number[]) => `${8 + ((coordinate[0] - minLng) / Math.max(maxLng - minLng, 0.000001)) * 84},${92 - ((coordinate[1] - minLat) / Math.max(maxLat - minLat, 0.000001)) * 84}`;
  const firstRing = (geometry: any): number[][] => {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return geometry.coordinates?.[0] || [];
    if (geometry.type === "MultiPolygon") return geometry.coordinates?.[0]?.[0] || [];
    return [];
  };
  const linePoints = (geometry: any): string => coordinatePairs(geometry?.coordinates).map(project).join(" ");

  return (
    <div className="edash-layout-preview" aria-label="Generated layout preview">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${proposal.candidates?.length || 0} generated plots`} style={{ height: 220 }}>
        {geometries.filter((item) => item.kind === "road").map((item, index) => <polyline key={`road-${index}`} fill="none" stroke="#445066" strokeWidth="0.8" points={linePoints(item.geometry)} />)}
        {geometries.filter((item) => item.kind === "drainage").map((item, index) => <polygon key={`drainage-${index}`} fill="rgba(42,120,214,0.18)" stroke="#2a78d6" strokeWidth="0.4" points={firstRing(item.geometry).map(project).join(" ")} />)}
        {geometries.filter((item) => item.kind === "open_space").map((item, index) => <polygon key={`space-${index}`} fill="rgba(30,138,76,0.14)" stroke="#1e8a4c" strokeWidth="0.4" points={firstRing(item.geometry).map(project).join(" ")} />)}
        {geometries.filter((item) => item.kind === "plot").map((item, index) => <g key={`plot-${index}`}><polygon points={firstRing(item.geometry).map(project).join(" ")} /><text x={firstRing(item.geometry).length ? firstRing(item.geometry).map(project).map((value) => Number(value.split(",")[0])).reduce((sum, value) => sum + value, 0) / firstRing(item.geometry).length : 50} y={firstRing(item.geometry).length ? firstRing(item.geometry).map(project).map((value) => Number(value.split(",")[1])).reduce((sum, value) => sum + value, 0) / firstRing(item.geometry).length : 50}>{item.label}</text></g>)}
      </svg>
      <span>{proposal.candidates?.length || 0} plots in this draft</span>
    </div>
  );
}

function walkCoordinates(coords: any, visit: (point: [number, number]) => void) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") visit(coords as [number, number]);
  else coords.forEach((item) => walkCoordinates(item, visit));
}

// Draws the draft layout on a real satellite map (built once per proposal, guarded by mapRef -
// same construction pattern used for the main Estate map, including the position:absolute
// !important CSS fix - mapbox-gl.css otherwise collapses the container to zero height) so users
// can zoom, pan and go fullscreen to actually inspect a layout with hundreds of plots.
const EDITABLE_PLOT_LAYERS = ["preview-plots-fill", "preview-plots-outline", "preview-plots-labels"];

// Shared-vertex ("topology-aware") editing: a grid-generated layout's neighbouring plots meet at
// numerically identical coordinates, so a moved vertex is propagated to every OTHER candidate that
// has a vertex at the vertex's pre-edit location, keeping touching plots touching instead of
// opening a gap or an overlap. This only fires for a plain vertex drag (ring length unchanged) -
// dragging a midpoint to insert a new vertex has no matching "from" coordinate to propagate from,
// so that case is left as a plot-local edit.
const VERTEX_MATCH_EPSILON = 1e-7; // ~1cm at the equator

function findMovedVertex(oldRing: number[][], newRing: number[][]): { from: [number, number]; to: [number, number] } | null {
  if (!oldRing || !newRing || oldRing.length !== newRing.length) return null;
  for (let index = 0; index < oldRing.length; index += 1) {
    const [ox, oy] = oldRing[index];
    const [nx, ny] = newRing[index];
    if (Math.abs(ox - nx) > VERTEX_MATCH_EPSILON || Math.abs(oy - ny) > VERTEX_MATCH_EPSILON) {
      return { from: [ox, oy], to: [nx, ny] };
    }
  }
  return null;
}

function setClosedRingVertex(ring: number[][], index: number, coordinate: [number, number]) {
  ring[index] = coordinate;
  if (index === 0) ring[ring.length - 1] = coordinate;
  else if (index === ring.length - 1) ring[0] = coordinate;
}

function propagateVertexMove(candidates: Record<string, any>, editedId: string, from: [number, number], to: [number, number]): string[] {
  const affected: string[] = [];
  Object.entries(candidates).forEach(([plotNumber, geometry]) => {
    if (plotNumber === editedId || geometry?.type !== "Polygon") return;
    const ring: number[][] = geometry.coordinates[0];
    let changed = false;
    ring.forEach((coordinate, index) => {
      if (Math.abs(coordinate[0] - from[0]) < VERTEX_MATCH_EPSILON && Math.abs(coordinate[1] - from[1]) < VERTEX_MATCH_EPSILON) {
        setClosedRingVertex(ring, index, to);
        changed = true;
      }
    });
    if (changed) affected.push(plotNumber);
  });
  return affected;
}

type OnAddFeature = (proposalId: number, featureType: "road" | "open_space", geometry: any, widthM: number | undefined, plotCandidates: any[]) => Promise<void>;

function LayoutPreviewMap({ proposal, onEditCandidates, onAddFeature }: { proposal: any; onEditCandidates?: (proposalId: number, plotCandidates: any[], featureCandidates?: any[]) => Promise<void>; onAddFeature?: OnAddFeature }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const newFeatureTypeRef = useRef<"road" | "open_space" | null>(null);
  const workingCandidatesRef = useRef<Record<string, any>>({});
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingGeometry, setPendingGeometry] = useState<Record<string, any>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [savingEdits, setSavingEdits] = useState(false);
  const [addingFeature, setAddingFeature] = useState(false);
  const [roadWidthM, setRoadWidthM] = useState(9);
  const hasEdits = Object.keys(pendingGeometry).length > 0 || deletedIds.size > 0;

  // Builds the map and its (initially empty) sources exactly once per proposal id - the same
  // build/sync split used for the main Estate map, and for the same reason: populating a source
  // from a closure captured once at construction time means later edits to the SAME proposal
  // (same id, new candidates/features) would never reach the map. The effect below owns syncing
  // live data into these sources via setData(), so this one only ever runs on a genuinely new
  // proposal.
  useEffect(() => {
    setMapReady(false);
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    let cancelled = false;
    void Promise.all([loadMapboxGl(), loadMapboxGlCss()]).then(([mapboxgl]) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [7.4, 9.1],
        zoom: 14,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current = map;
      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);
      (map as any)._edashResizeObserver = resizeObserver;
      map.on("style.load", () => {
        map.resize();
        map.addSource("preview-open-space", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "preview-open-space-fill", type: "fill", source: "preview-open-space", paint: { "fill-color": "#78a85d", "fill-opacity": 0.35 } });
        map.addLayer({ id: "preview-open-space-outline", type: "line", source: "preview-open-space", paint: { "line-color": "#3f7a2c", "line-width": 1.4 } });
        map.addLayer({ id: "preview-open-space-labels", type: "symbol", source: "preview-open-space", layout: { "text-field": ["get", "label"], "text-size": 10.5, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] }, paint: { "text-color": "#0f1e17", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.6 } });

        map.addSource("preview-drainage", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "preview-drainage-fill", type: "fill", source: "preview-drainage", paint: { "fill-color": "#2a78d6", "fill-opacity": 0.35 } });

        map.addSource("preview-plots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "preview-plots-fill", type: "fill", source: "preview-plots", paint: { "fill-color": "#1e8a4c", "fill-opacity": 0.4 } });
        map.addLayer({ id: "preview-plots-outline", type: "line", source: "preview-plots", paint: { "line-color": "#ffffff", "line-width": 1.2 } });
        map.addLayer({ id: "preview-plots-labels", type: "symbol", source: "preview-plots", minzoom: 16, layout: { "text-field": ["get", "label"], "text-size": 9, "text-line-height": 1.1, "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"] }, paint: { "text-color": "#0f1e17", "text-halo-color": "#ffffff", "text-halo-width": 1.4 } });

        // Roads generated by the criteria-driven algorithm are plain LineString centrelines (no
        // stored width); roads added by hand via "Add road" below are stored as real buffered
        // Polygon corridors, since the user gave an actual width in metres. Both are rendered here
        // so either source of road looks right.
        map.addSource("preview-roads", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "preview-roads-fill", type: "fill", source: "preview-roads", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2b2f36", "fill-opacity": 0.88 } });
        map.addLayer({ id: "preview-roads-casing", type: "line", source: "preview-roads", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.9 } });
        map.addLayer({ id: "preview-roads-line", type: "line", source: "preview-roads", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#2b2f36", "line-width": 3 } });
        map.addLayer({ id: "preview-roads-labels", type: "symbol", source: "preview-roads", minzoom: 15, layout: { "text-field": ["get", "label"], "text-size": 10, "symbol-placement": "line", "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] }, paint: { "text-color": "#0f1e17", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.4 } });

        setMapReady(true);
      });
    });
    return () => { cancelled = true; (mapRef.current as any)?._edashResizeObserver?.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, [proposal?.id]);

  // Keeps the map's sources in sync with the current proposal - runs on the very first ready
  // state AND every time the parent hands us a proposal with new candidates/features (after a
  // vertex-edit save or a road/open-space addition), without ever rebuilding the map itself.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const plotFeatures = (proposal?.candidates || []).map((candidate: any) => ({
      type: "Feature",
      properties: { label: `${candidate.plot_number}\n${Math.round(Number(candidate.area_sqm || 0)).toLocaleString()} m²` },
      geometry: candidate.geometry,
    }));
    const roadFeatures = (proposal?.features || []).filter((feature: any) => feature.feature_type === "road").map((feature: any) => ({
      type: "Feature",
      properties: { label: feature.width_m ? `${feature.name} (${feature.width_m}m)` : feature.name },
      geometry: feature.geometry,
    }));
    const drainageFeatures = (proposal?.features || []).filter((feature: any) => feature.feature_type === "drainage").map((feature: any) => ({ type: "Feature", properties: {}, geometry: feature.geometry }));
    const openSpaceFeatures = (proposal?.features || []).filter((feature: any) => feature.feature_type === "open_space").map((feature: any) => ({ type: "Feature", properties: { label: feature.name }, geometry: feature.geometry }));
    (map.getSource("preview-open-space") as any)?.setData({ type: "FeatureCollection", features: openSpaceFeatures });
    (map.getSource("preview-drainage") as any)?.setData({ type: "FeatureCollection", features: drainageFeatures });
    (map.getSource("preview-plots") as any)?.setData({ type: "FeatureCollection", features: plotFeatures });
    (map.getSource("preview-roads") as any)?.setData({ type: "FeatureCollection", features: roadFeatures });

    void loadMapboxGl().then((mapboxgl) => {
      if (mapRef.current !== map) return;
      const fitBounds = new mapboxgl.LngLatBounds();
      [...plotFeatures, ...roadFeatures, ...drainageFeatures, ...openSpaceFeatures].forEach((feature) => walkCoordinates(feature.geometry?.coordinates, (point) => fitBounds.extend(point)));
      if (!fitBounds.isEmpty()) map.fitBounds(fitBounds, { padding: 30 });
    });
  }, [proposal, mapReady]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Toggling "editing" swaps the static preview-plots layers for a MapboxDraw instance loaded
  // with the same candidates (keyed by plot_number) - dragging a vertex or midpoint (which adds a
  // new one) is native to Draw's simple_select/direct_select modes, and its trash control or the
  // Delete key removes a candidate outright. Edits are staged locally until "Save changes".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !editing) return;
    let cancelled = false;
    void Promise.all([loadMapboxDraw(), loadMapboxDrawCss()]).then(([MapboxDraw]) => {
      if (cancelled || mapRef.current !== map) return;
      const draw = new MapboxDraw({ displayControlsDefault: false, controls: { trash: true }, defaultMode: "simple_select" });
      map.addControl(draw, "top-left");
      drawRef.current = draw;
      const plotFeatures = (proposal?.candidates || []).map((candidate: any) => ({ type: "Feature", id: String(candidate.plot_number), properties: { plot_number: candidate.plot_number }, geometry: candidate.geometry }));
      draw.set({ type: "FeatureCollection", features: plotFeatures });
      EDITABLE_PLOT_LAYERS.forEach((id) => { try { map.setLayoutProperty(id, "visibility", "none"); } catch { /* layer not ready yet */ } });

      // Deep-cloned working copy that both this edit session's vertex propagation and the final
      // save read from - mutated in place as neighbours get dragged along, never touching the
      // `proposal` prop itself (so "Cancel" is just discarding this ref and leaving the map).
      const working: Record<string, any> = {};
      (proposal?.candidates || []).forEach((candidate: any) => { working[String(candidate.plot_number)] = JSON.parse(JSON.stringify(candidate.geometry)); });
      workingCandidatesRef.current = working;

      const captureUpdate = (event: any) => {
        const touched: Record<string, any> = {};
        (event.features || []).forEach((feature: any) => {
          const id = String(feature.id);
          const previousGeometry = workingCandidatesRef.current[id];
          touched[id] = feature.geometry;
          workingCandidatesRef.current[id] = feature.geometry;
          const moved = feature.geometry?.type === "Polygon" ? findMovedVertex(previousGeometry?.coordinates?.[0], feature.geometry.coordinates[0]) : null;
          if (moved) {
            const affectedIds = propagateVertexMove(workingCandidatesRef.current, id, moved.from, moved.to);
            affectedIds.forEach((affectedId) => {
              const updatedGeometry = workingCandidatesRef.current[affectedId];
              touched[affectedId] = updatedGeometry;
              draw.add({ type: "Feature", id: affectedId, properties: { plot_number: affectedId }, geometry: updatedGeometry });
            });
          }
        });
        setPendingGeometry((current) => ({ ...current, ...touched }));
      };
      const captureDelete = (event: any) => {
        (event.features || []).forEach((feature: any) => { delete workingCandidatesRef.current[String(feature.id)]; });
        setDeletedIds((current) => {
          const next = new Set(current);
          (event.features || []).forEach((feature: any) => next.add(String(feature.id)));
          return next;
        });
      };
      // A create only counts as a new road/open space when it was started via the "Add road" /
      // "Add open space" buttons (which set this ref right before switching Draw into a drawing
      // mode) - otherwise ignore it, since simple_select's own vertex/midpoint dragging never
      // fires draw.create, only draw.update. Saving is immediate here (not staged like vertex
      // edits) because carving the new shape's footprint out of every overlapping plot needs real
      // projected-CRS geometry math, which only the backend can do accurately.
      const captureCreate = (event: any) => {
        const featureType = newFeatureTypeRef.current;
        newFeatureTypeRef.current = null;
        const feature = (event.features || [])[0];
        if (!featureType || !feature) return;
        try { draw.delete(feature.id); } catch { /* already gone */ }
        if (!onAddFeature || !proposal?.id) return;
        const plotCandidates = (proposal.candidates || [])
          .filter((candidate: any) => !deletedIds.has(String(candidate.plot_number)))
          .map((candidate: any) => {
            const updated = workingCandidatesRef.current[String(candidate.plot_number)];
            return updated ? { ...candidate, geometry: updated } : candidate;
          });
        setAddingFeature(true);
        void onAddFeature(proposal.id, featureType, feature.geometry, featureType === "road" ? roadWidthM : undefined, plotCandidates)
          .then(() => {
            setPendingGeometry({});
            setDeletedIds(new Set());
            setEditing(false);
          })
          .finally(() => setAddingFeature(false));
      };
      map.on("draw.update", captureUpdate);
      map.on("draw.delete", captureDelete);
      map.on("draw.create", captureCreate);
      (map as any)._edashDrawHandlers = { captureUpdate, captureDelete, captureCreate };
    });
    return () => {
      cancelled = true;
      const handlers = (map as any)?._edashDrawHandlers;
      if (handlers) { map.off("draw.update", handlers.captureUpdate); map.off("draw.delete", handlers.captureDelete); map.off("draw.create", handlers.captureCreate); }
      if (drawRef.current) { try { map.removeControl(drawRef.current); } catch { /* map already gone */ } }
      drawRef.current = null;
      EDITABLE_PLOT_LAYERS.forEach((id) => { try { map.setLayoutProperty(id, "visibility", "visible"); } catch { /* layer not ready */ } });
    };
  }, [editing, proposal?.id]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  };

  const cancelEdits = () => {
    setPendingGeometry({});
    setDeletedIds(new Set());
    setEditing(false);
  };

  const startDrawingFeature = (featureType: "road" | "open_space") => {
    newFeatureTypeRef.current = featureType;
    drawRef.current?.changeMode(featureType === "road" ? "draw_line_string" : "draw_polygon");
  };

  const saveEdits = async () => {
    if (!onEditCandidates || !proposal?.id) return;
    const merged = (proposal.candidates || [])
      .filter((candidate: any) => !deletedIds.has(String(candidate.plot_number)))
      .map((candidate: any) => {
        const updatedGeometry = workingCandidatesRef.current[String(candidate.plot_number)];
        return updatedGeometry ? { ...candidate, geometry: updatedGeometry } : candidate;
      });
    setSavingEdits(true);
    try {
      await onEditCandidates(proposal.id, merged);
      setPendingGeometry({});
      setDeletedIds(new Set());
      setEditing(false);
    } finally {
      setSavingEdits(false);
    }
  };

  if (!MAPBOX_TOKEN) return <LayoutPreview proposal={proposal} />;

  return (
    <div ref={wrapRef} className="edash-layout-preview-wrap">
      <div ref={containerRef} className="edash-layout-preview-map" />
      <div className="edash-layout-preview-toolbar">
        {onEditCandidates && proposal.status === "review_required" && (
          editing ? (
            <>
              {onAddFeature && (
                <label className="edash-layout-preview-road-width" title="Width for the next road you draw">
                  <span>Road</span>
                  <input type="number" min="1" max="60" value={roadWidthM} disabled={addingFeature} onChange={(event) => setRoadWidthM(Number(event.target.value) || 9)} />
                  <span>m</span>
                </label>
              )}
              {onAddFeature && (
                <button type="button" className="edash-map-ctrl-btn edash-layout-preview-action" disabled={savingEdits || addingFeature} onClick={() => startDrawingFeature("road")} title="Draw a new road at the width set above">
                  {addingFeature ? <Spinner size={13} /> : null} Add road
                </button>
              )}
              {onAddFeature && (
                <button type="button" className="edash-map-ctrl-btn edash-layout-preview-action" disabled={savingEdits || addingFeature} onClick={() => startDrawingFeature("open_space")} title="Draw a new open space">
                  Add open space
                </button>
              )}
              <button type="button" className="edash-map-ctrl-btn edash-layout-preview-action" disabled={savingEdits || addingFeature || !hasEdits} onClick={() => void saveEdits()} title="Save vertex/delete changes">
                {savingEdits ? <Spinner size={13} /> : <EstateIcon name="check-circle" />} Save changes
              </button>
              <button type="button" className="edash-map-ctrl-btn edash-layout-preview-action" disabled={savingEdits || addingFeature} onClick={cancelEdits} title="Cancel editing">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="edash-map-ctrl-btn edash-layout-preview-action" onClick={() => setEditing(true)} title="Edit plots, or add roads and open space">
              Edit layout
            </button>
          )
        )}
        <button type="button" className="edash-map-ctrl-btn edash-layout-preview-action" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
          <EstateIcon name="expand" />
        </button>
      </div>
      <span className="edash-layout-preview-count">
        {addingFeature
          ? "Carving the new shape out of overlapping plots..."
          : editing
            ? "Drag a vertex to reshape - touching plots move together automatically. Click \"Add road\" or \"Add open space\" to draw a new one."
            : `${proposal.candidates?.length || 0} plots in this draft`}
      </span>
    </div>
  );
}

export default function EstateLayoutDesigner({ boundaryPresent, proposal, busy = false, message, messageTone = "good", onGenerate, onDecision, onEditCandidates, onAddFeature }: Props) {
  const [templateKey, setTemplateKey] = useState<LayoutTemplateKey>("standard");
  const [criteria, setCriteria] = useState<LayoutCriteria>({ ...DEFAULT_CRITERIA, ...LAYOUT_TEMPLATES.find((item) => item.key === "standard")!.criteria });
  const [open, setOpen] = useState(false);
  const setNumber = (key: keyof LayoutCriteria, value: string) => setCriteria((current) => ({ ...current, [key]: Number(value) }));
  const selectedTemplate = LAYOUT_TEMPLATES.find((item) => item.key === templateKey) || LAYOUT_TEMPLATES[0];

  const applyTemplate = (key: LayoutTemplateKey) => {
    setTemplateKey(key);
    const template = LAYOUT_TEMPLATES.find((item) => item.key === key);
    if (template) setCriteria((current) => ({ ...current, ...template.criteria }));
  };

  return (
    <div className="edash-card">
      <div className="edash-card-inner">
        <div className="edash-card-head">
          <h3 className="edash-card-title">Design a layout automatically</h3>
          <span className="edash-step-badge">Nigerian estate presets</span>
        </div>
        <p className="edash-status-row-desc" style={{ marginBottom: 14 }}>Pick a starting layout template, then fine-tune it. LandCheck will draw a first layout with plots, access roads and shared open space for your planner to review.</p>

        {!boundaryPresent && <p className="edash-tab-empty">Add the Estate boundary first, then you can create a layout from it.</p>}

        {boundaryPresent && (
          <>
            <label className="edash-field" style={{ marginBottom: 10, maxWidth: 360 }}>
              <span>Layout template</span>
              <select value={templateKey} onChange={(event) => applyTemplate(event.target.value as LayoutTemplateKey)}>
                {LAYOUT_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.name} - {template.plotSizeLabel}</option>)}
              </select>
            </label>

            <div className="edash-layout-template-summary">
              <span className="edash-status-pill tone-info">{selectedTemplate.density}</span>
              <p>{selectedTemplate.description}</p>
            </div>

            <details open={open || !proposal} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)} className="edash-onboard-advanced" style={{ marginTop: 12, marginBottom: 14 }}>
              <summary>Fine-tune the criteria</summary>
              <div className="edash-criteria-groups">
                <div className="edash-criteria-group">
                  <h4>Plot &amp; frontage</h4>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Target plot size (m²)</span><input type="number" min="100" value={criteria.target_plot_area_sqm} onChange={(event) => setNumber("target_plot_area_sqm", event.target.value)} /></label>
                    <label className="edash-field"><span>Frontage (m)</span><input type="number" min="5" value={criteria.frontage_m ?? ""} placeholder="Auto" onChange={(event) => setCriteria((current) => ({ ...current, frontage_m: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
                  </div>
                </div>

                <div className="edash-criteria-group">
                  <div className="edash-criteria-group-head">
                    <h4>Roads &amp; access</h4>
                    <label className="edash-toggle"><input type="checkbox" checked={criteria.include_roads} onChange={(event) => setCriteria((current) => ({ ...current, include_roads: event.target.checked }))} /> Include roads</label>
                  </div>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Road width (m)</span><input type="number" min="4" disabled={!criteria.include_roads} value={criteria.road_width_m} onChange={(event) => setNumber("road_width_m", event.target.value)} /></label>
                    <label className="edash-field"><span>Orientation (°)</span><input type="number" min="-180" max="180" value={criteria.orientation_deg} onChange={(event) => setNumber("orientation_deg", event.target.value)} /></label>
                  </div>
                  <p className="edash-field-note">9-12m suits internal residential streets; 15-18m suits premium or commercial-frontage estates. Orientation favours north-south facades, the common preference for cross-ventilation in Nigeria's climate.</p>
                </div>

                <div className="edash-criteria-group">
                  <div className="edash-criteria-group-head">
                    <h4>Reserves</h4>
                    <label className="edash-toggle"><input type="checkbox" checked={criteria.include_drainage} onChange={(event) => setCriteria((current) => ({ ...current, include_drainage: event.target.checked }))} /> Include drainage</label>
                  </div>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Estate edge reserve (m)</span><input type="number" min="0" value={criteria.edge_reserve_m} onChange={(event) => setNumber("edge_reserve_m", event.target.value)} /></label>
                    <label className="edash-field"><span>Drainage reserve (m)</span><input type="number" min="0" disabled={!criteria.include_drainage} value={criteria.drainage_reserve_m} onChange={(event) => setNumber("drainage_reserve_m", event.target.value)} /></label>
                  </div>
                </div>

                <div className="edash-criteria-group">
                  <div className="edash-criteria-group-head">
                    <h4>Open space</h4>
                    <label className="edash-toggle"><input type="checkbox" checked={criteria.include_open_space} onChange={(event) => setCriteria((current) => ({ ...current, include_open_space: event.target.checked }))} /> Include open space</label>
                  </div>
                  <div className="edash-form-row">
                    <label className="edash-field"><span>Open space (%)</span><input type="number" min="0" max="40" disabled={!criteria.include_open_space} value={criteria.open_space_percent} onChange={(event) => setNumber("open_space_percent", event.target.value)} /></label>
                    <label className="edash-field"><span>Plot label prefix</span><input value={criteria.plot_prefix} onChange={(event) => setCriteria((current) => ({ ...current, plot_prefix: event.target.value }))} /></label>
                  </div>
                </div>

                <label className="edash-field" style={{ maxWidth: 220 }}><span>Maximum plots to generate</span><input type="number" min="2" max="5000" value={criteria.max_plots} onChange={(event) => setNumber("max_plots", event.target.value)} /></label>

                <p className="edash-field-note">These are starting assumptions, not planning approval. Your qualified planner and the relevant planning authority remain responsible for confirming roads, drainage, access and plot standards before publishing.</p>
                <button type="button" className="edash-btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => onGenerate(criteria)}>
                  {busy ? <><Spinner size={14} /> Creating draft...</> : <><EstateIcon name="plots" /> Create draft layout</>}
                </button>
              </div>
            </details>
          </>
        )}

        {message && <p className={`edash-banner tone-${messageTone}`} style={{ margin: "4px 0 10px" }} role="status">{message}</p>}

        {proposal && (
          <div className="edash-info-card" style={{ flexDirection: "column" }}>
            <div className="edash-info-card-head">
              <span className="edash-status-row-title">{proposal.status === "review_required" ? "Your draft layout is ready" : `Layout ${proposal.status}`}</span>
            </div>
            <p className="edash-status-row-desc">{proposal.diagnostics?.estimated_plot_count || proposal.candidates?.length || 0} plots, about {Math.round(Number(proposal.diagnostics?.total_plot_area_sqm || 0)).toLocaleString()} m² of plot area.</p>
            <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>{proposal.diagnostics?.road_count || 0} access roads and {Number(proposal.diagnostics?.open_space_percent || 0).toFixed(1)}% open-space reserve.</p>
            <LayoutPreviewMap proposal={proposal} onEditCandidates={onEditCandidates} onAddFeature={onAddFeature} />
            {proposal.status === "review_required" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="edash-btn-primary" disabled={busy} onClick={() => onDecision(proposal.id, "approved")}>Approve and add plots</button>
                <button type="button" className="edash-btn-outline" disabled={busy} onClick={() => onDecision(proposal.id, "rejected")}>Discard</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
