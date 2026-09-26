import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { clearEstateAuthSession, getEstateAuthSession } from "../auth/estateAuth";
import { claimEstateSurveyRequestSession } from "../auth/surveyAuth";
import { api, createIdempotencyKey, extractApiErrorMessage } from "../api/client";
import { money, PAYMENT_METHODS } from "../components/estates/FinancialComponents";
import CoordinateInput from "../components/CoordinateInput";
import EstateLayoutImport, { type EstateLayoutMethod, LAYOUT_IMPORT_METHODS } from "../components/estates/EstateLayoutImport";
import EstateLayoutDesigner from "../components/estates/EstateLayoutDesigner";
import MapViewEnhanced from "../components/MapViewEnhanced";
import { loadMapboxGl, loadMapboxGlCss, MAPBOX_TOKEN } from "../utils/mapboxLoader";
import { toWGS84, COORDINATE_SYSTEM_GROUPS } from "../utils/coordinateConverter";
import { checkPolygonClosure } from "../utils/surveyGeometry";
import { formatArea, type UnitSystem } from "../utils/unitFormat";
import EstateIcon from "../components/estates/EstateIcon";
import EstateModal from "../components/estates/EstateModal";
import CoordinateSystemSelect from "../components/CoordinateSystemSelect";
import EstateShell from "../components/estates/EstateShell";
import EstateReservationRequests from "../components/estates/EstateReservationRequests";
import EstateOperationsSummary from "../components/estates/EstateOperationsSummary";
import Spinner, { LoadingPanel } from "../components/estates/EstateSpinner";
import { clearSurveyPlanDraft } from "../offline/surveyPlanDraft";
import "../styles/estates.css";
import "../styles/estate-dashboard.css";
import "../styles/estate-monday.css";

const STATUS_COLORS = {
  available: "#1e8a4c",
  allocated: "#2a78d6",
  reserved: "#d69100",
  under_survey: "#d9622a",
  under_staking: "#6046a8",
  developed: "#0f8b8d",
  on_hold: "#667085",
} as const;

const IMPORT_CRS_OPTIONS = COORDINATE_SYSTEM_GROUPS.flatMap((group) =>
  group.systems.filter((system) => !system.epsgLabel.includes("/")).map((system) => ({ value: system.epsgLabel, label: `${system.name} (${system.epsgLabel})` }))
);

type MessageTone = "good" | "danger";

function StatusBanner({ text, tone = "good" }: { text: string; tone?: MessageTone }) {
  if (!text) return null;
  return <p className={`edash-banner tone-${tone}`} style={{ margin: "10px 0" }} role="status">{text}</p>;
}

function relativeTime(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function addCalendarMonths(value: string, months: number) {
  const date = new Date(`${value}T12:00:00`);
  if (!value || !Number.isFinite(date.getTime()) || !Number.isInteger(months) || months < 1) return null;
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return date;
}

function schedulePreview(nextDueDate: string, intervalMonths: string) {
  const interval = Number(intervalMonths);
  const first = new Date(`${nextDueDate}T12:00:00`);
  if (!nextDueDate || !Number.isFinite(first.getTime()) || !Number.isInteger(interval) || interval < 1) return null;
  const dates = [first, addCalendarMonths(nextDueDate, interval), addCalendarMonths(nextDueDate, interval * 2)].filter(Boolean) as Date[];
  return dates.map((date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
}

function tomorrowDateInputValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

type Estate = { id: number; name: string; status: string; organization_id: number; location?: string | null; crs?: string; project_reference?: string | null; project_owner?: string | null; financial?: { confirmed_collections:string; outstanding_balance:string } };
type EstateCoordinatePoint = { station: string; lng: number; lat: number; height?: number; is_boundary?: boolean };
type SurveyStationSelection = {
  plotId: number;
  currentNames: string[];
  loading: boolean;
};

function surveyStationName(index: number): string {
  let name = "";
  let value = index;
  do {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return name;
}

function isUpgradeRequiredError(err: any): boolean {
  return err?.response?.status === 402 && err?.response?.data?.detail?.code === "upgrade_required";
}

function segmentsCross(a: { lng: number; lat: number }, b: { lng: number; lat: number }, c: { lng: number; lat: number }, d: { lng: number; lat: number }) {
  const orientation = (p: typeof a, q: typeof a, r: typeof a) => (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const ab = orientation(a, b, c);
  const ac = orientation(a, b, d);
  const cd = orientation(c, d, a);
  const cb = orientation(c, d, b);
  return ((ab > 0 && ac < 0) || (ab < 0 && ac > 0)) && ((cd > 0 && cb < 0) || (cd < 0 && cb > 0));
}

function getRingCentroid(ring: number[][]): [number, number] {
  if (!ring || ring.length === 0) return [0, 0];
  const sum = ring.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

const ESTATE_CRS_TO_MAP_SYSTEM: Record<string, string> = {
  "epsg:4326": "wgs84",
  "epsg:32631": "utm_31n",
  "epsg:32632": "utm_32n",
  "epsg:32633": "utm_33n",
  "epsg:26331": "minna_31",
  "epsg:26332": "minna_32",
  "epsg:26333": "minna_33",
  "epsg:26391": "nigeria_west_belt",
  "epsg:26392": "nigeria_mid_belt",
  "epsg:26393": "nigeria_east_belt",
};

function estateMapCoordinateSystem(crs: string | null | undefined) {
  const normalized = String(crs || "wgs84").trim().toLowerCase();
  return ESTATE_CRS_TO_MAP_SYSTEM[normalized] || normalized;
}

function normalizeEstateMapGeometry(geometry: any, crs: string | null | undefined) {
  if (!geometry?.coordinates) return geometry;
  const sourceSystem = estateMapCoordinateSystem(crs);
  const normalizeCoordinates = (coordinates: any): any => {
    if (!Array.isArray(coordinates)) return coordinates;
    if (coordinates.length >= 2 && coordinates.every((value) => typeof value === "number" && Number.isFinite(value))) {
      const [x, y] = coordinates;
      if (Math.abs(x) > 180 || Math.abs(y) > 90) {
        // Some early Estate records stored UTM values in the WGS84 geometry column. Keep the
        // saved data untouched, but make those legacy parcels visible on the web map.
        const conversionSystem = sourceSystem === "wgs84" ? "wgs84_nigeria_meters" : sourceSystem;
        return [...toWGS84(x, y, conversionSystem), ...coordinates.slice(2)];
      }
      return coordinates;
    }
    return coordinates.map(normalizeCoordinates);
  };
  return { ...geometry, coordinates: normalizeCoordinates(geometry.coordinates) };
}

function geographicRingAreaSqm(ring: any[]): number {
  const points = (ring || []).filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (points.length < 3) return 0;
  const earthRadiusM = 6371008.8;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const longitudeDelta = (((Number(next[0]) - Number(current[0]) + 540) % 360) - 180) * Math.PI / 180;
    const currentLatitude = Number(current[1]) * Math.PI / 180;
    const nextLatitude = Number(next[1]) * Math.PI / 180;
    sum += longitudeDelta * (2 + Math.sin(currentLatitude) + Math.sin(nextLatitude));
  }
  return Math.abs(sum * earthRadiusM ** 2 / 2);
}

function geometryAreaSqm(geometry: any): number | null {
  if (geometry?.type === "Polygon") {
    const rings = geometry.coordinates || [];
    if (!rings.length) return null;
    return Math.max(0, geographicRingAreaSqm(rings[0]) - rings.slice(1).reduce((total: number, ring: any[]) => total + geographicRingAreaSqm(ring), 0));
  }
  if (geometry?.type === "MultiPolygon") {
    const area = (geometry.coordinates || []).reduce((total: number, polygon: any[]) => total + (geometryAreaSqm({ type: "Polygon", coordinates: polygon }) || 0), 0);
    return area || null;
  }
  return null;
}

function visitMapCoordinates(value: any, visitor: (coordinate: [number, number]) => void) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number" && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    visitor([value[0], value[1]]);
    return;
  }
  value.forEach((item) => visitMapCoordinates(item, visitor));
}

function mapBoundsFor(features: any[], boundary?: any) {
  const points: [number, number][] = [];
  const collect = (geometry: any) => visitMapCoordinates(geometry?.coordinates, (coordinate) => points.push(coordinate));
  collect(boundary);
  features.forEach((feature) => collect(feature.geometry));
  if (!points.length) return null;
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

function polygonRings(geometry: any): number[][][] {
  if (geometry?.type === "Polygon") return geometry.coordinates || [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates || []).flatMap((polygon: number[][][]) => polygon);
  return [];
}

function svgMapPoints(ring: number[][], bounds: NonNullable<ReturnType<typeof mapBoundsFor>>) {
  const width = 1000;
  const height = 620;
  const padding = 44;
  const rangeLng = Math.max(bounds.maxLng - bounds.minLng, 0.000001);
  const rangeLat = Math.max(bounds.maxLat - bounds.minLat, 0.000001);
  const scale = Math.min((width - padding * 2) / rangeLng, (height - padding * 2) / rangeLat);
  const offsetX = (width - rangeLng * scale) / 2;
  const offsetY = (height - rangeLat * scale) / 2;
  return ring
    .filter((coordinate) => Number.isFinite(coordinate?.[0]) && Number.isFinite(coordinate?.[1]))
    .map(([lng, lat]) => `${(offsetX + (lng - bounds.minLng) * scale).toFixed(2)},${(height - offsetY - (lat - bounds.minLat) * scale).toFixed(2)}`)
    .join(" ");
}

function svgMapPoint(coordinate: [number, number], bounds: NonNullable<ReturnType<typeof mapBoundsFor>>) {
  const points = svgMapPoints([coordinate], bounds).split(",");
  return { x: Number(points[0]), y: Number(points[1]) };
}

function estatePlotColor(status: string | null | undefined) {
  return STATUS_COLORS[String(status || "on_hold") as keyof typeof STATUS_COLORS] || STATUS_COLORS.on_hold;
}

function EstatePlotMapFallback({
  features,
  boundary,
  message,
  onSelect,
}: {
  features: any[];
  boundary?: any;
  message?: string;
  onSelect: (plotId: number) => void;
}) {
  const bounds = mapBoundsFor(features, boundary);
  if (!bounds) {
    return <div className="edash-map-fallback">{message || "No plot geometry is available for this Estate yet."}</div>;
  }
  return (
    <div className="edash-map-fallback edash-map-fallback-plot">
      <svg viewBox="0 0 1000 620" role="img" aria-label="Estate plot map">
        <rect width="1000" height="620" fill="#edf3ee" />
        <path d="M0 80H1000 M0 180H1000 M0 280H1000 M0 380H1000 M0 480H1000 M120 0V620 M280 0V620 M440 0V620 M600 0V620 M760 0V620 M920 0V620" stroke="#d6e3da" strokeWidth="1" />
        {polygonRings(boundary).map((ring, index) => <polygon key={`boundary-${index}`} points={svgMapPoints(ring, bounds)} fill="none" stroke="#087f76" strokeWidth="3" strokeDasharray="9 7" />)}
        {features.flatMap((feature) => polygonRings(feature.geometry).map((ring, ringIndex) => {
          const plotId = Number(feature.properties?.id ?? feature.id);
          const center = getRingCentroid(ring);
          const label = String(feature.properties?.plot_number || "");
          const point = svgMapPoint(center, bounds);
          return (
            <g key={`${plotId}-${ringIndex}`}>
              <polygon
                points={svgMapPoints(ring, bounds)}
                fill={estatePlotColor(feature.properties?.commercial_status)}
                fillOpacity="0.62"
                stroke="#ffffff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                role="button"
                tabIndex={0}
                aria-label={`Plot ${label}`}
                onClick={() => Number.isFinite(plotId) && onSelect(plotId)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(plotId); }}
                style={{ cursor: "pointer" }}
              />
              <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="central" className="edash-map-fallback-label">{label}</text>
            </g>
          );
        }))}
        {!features.length && <text x="500" y="310" textAnchor="middle" className="edash-map-fallback-empty">No plots match these filters.</text>}
      </svg>
      {message && <span className="edash-map-fallback-note">{message}</span>}
    </div>
  );
}

function buildBlockLabelFeatures(features: any[], blocks: any[]) {
  const blockCentroids = new Map<string, { sumLng: number; sumLat: number; count: number }>();
  const collectVertices = (geometry: any, blockId: string) => {
    if (!geometry) return;
    const walk = (coords: any): void => {
      if (typeof coords[0] === "number") {
        const entry = blockCentroids.get(blockId) || { sumLng: 0, sumLat: 0, count: 0 };
        entry.sumLng += coords[0];
        entry.sumLat += coords[1];
        entry.count += 1;
        blockCentroids.set(blockId, entry);
      } else {
        coords.forEach(walk);
      }
    };
    walk(geometry.coordinates);
  };
  features.forEach((feature: any) => {
    const blockId = feature.properties?.block_id;
    if (blockId === undefined || blockId === null) return;
    collectVertices(feature.geometry, String(blockId));
  });
  return Array.from(blockCentroids.entries()).map(([blockId, entry]) => {
    const block = blocks.find((item) => String(item.id) === blockId);
    return {
      type: "Feature",
      properties: { label: block ? `BLOCK ${block.label}` : `BLOCK ${blockId}` },
      geometry: { type: "Point", coordinates: [entry.sumLng / entry.count, entry.sumLat / entry.count] },
    };
  });
}

function buildPlotLabelFeatures(features: any[], allocations: any[]) {
  const allocationsByPlotId = new Map(allocations.map((item) => [Number(item.plot_id), item]));
  return features.map((feature: any) => {
    const allocation = allocationsByPlotId.get(Number(feature.properties?.id));
    return {
      type: "Feature",
      properties: {
        label: allocation ? allocation.customer_name : feature.properties?.plot_number || "",
        isCustomer: Boolean(allocation),
      },
      geometry: feature.geometry?.type === "Polygon" ? { type: "Point", coordinates: getRingCentroid(feature.geometry.coordinates[0]) } : feature.geometry,
    };
  });
}

const LAYER_TYPE_FALLBACK_LABEL: Record<string, string> = { road: "Road", drainage: "Drainage", open_space: "Open space", infrastructure: "Infrastructure" };

function buildLayerLabelFeatures(features: any[]) {
  // A manually drawn road/layer left unnamed still needs to read as a road on the map, not vanish
  // entirely - fall back to a label derived from its type instead of requiring a typed-in name.
  return features.map((feature: any) => {
    const label = feature.properties?.name || LAYER_TYPE_FALLBACK_LABEL[feature.properties?.type] || null;
    if (!label) return null;
    const geometry = feature.geometry;
    if (geometry?.type === "Polygon") {
      return { type: "Feature", properties: { label, kind: "point" }, geometry: { type: "Point", coordinates: getRingCentroid(geometry.coordinates[0]) } };
    }
    if (geometry?.type === "LineString") {
      return { type: "Feature", properties: { label, kind: "line" }, geometry };
    }
    return null;
  }).filter(Boolean);
}

function attachEstateMapLayers(map: any) {
  // Called again on every "style.load" (including after the Map/Satellite toggle's setStyle()),
  // so it must be safe to run on a map that may already have some of these sources/layers -
  // Mapbox's style diffing doesn't reliably guarantee a clean slate, and calling addSource/
  // addLayer on an id that still exists throws, which was silently killing everything added
  // after the first duplicate (the plots layer among them).
  const addSourceOnce = (id: string, config: any) => { if (!map.getSource(id)) map.addSource(id, config); };
  const addLayerOnce = (config: any) => { if (!map.getLayer(config.id)) map.addLayer(config); };

  addSourceOnce("estate-boundary", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // No fill here (it read as a solid "wasted space" band around the plots - it wasn't; that's the
  // generated drainage reserve, its own separate blue layer below) - just a red outline matching
  // the same surveying convention (red parent boundary, black subdivisions) as the exported plan.
  addLayerOnce({ id: "estate-boundary-outline", type: "line", source: "estate-boundary", paint: { "line-color": "#d1332b", "line-width": 2.2 } });
  addSourceOnce("estate-plots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  addLayerOnce({
    id: "estate-plots-fill",
    type: "fill",
    source: "estate-plots",
    paint: {
      "fill-color": [
        "match",
        ["get", "commercial_status"],
        "available", STATUS_COLORS.available,
        "reserved", STATUS_COLORS.reserved,
        "allocated", STATUS_COLORS.allocated,
        "on_hold", STATUS_COLORS.on_hold,
        STATUS_COLORS.on_hold,
      ],
      "fill-opacity": 0.6,
    },
  });
  // A stark, thick white line between EVERY plot - including two plots that are truly touching
  // with zero gap - reads visually as "there's a gap here" even when there isn't one. A thinner,
  // lower-opacity line still shows the legal parcel division without implying separation.
  addLayerOnce({ id: "estate-plots-outline", type: "line", source: "estate-plots", paint: { "line-color": "#ffffff", "line-width": 0.75, "line-opacity": 0.65 } });
  addSourceOnce("estate-layers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  addLayerOnce({ id: "estate-layers-line-casing", type: "line", source: "estate-layers", filter: ["!=", ["geometry-type"], "Polygon"], paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.9 } });
  addLayerOnce({ id: "estate-layers-line", type: "line", source: "estate-layers", filter: ["!=", ["geometry-type"], "Polygon"], paint: { "line-color": ["match", ["get", "type"], "road", "#2b2f36", "drainage", "#287cb4", "#b77c2d"], "line-width": 3 } });
  // A hand-drawn road is often stored as a Polygon (a buffered corridor, not a bare centerline),
  // so it must be matched here too - without an explicit "road" case it fell through to the same
  // default blue as drainage, reading as water on the map instead of a road.
  addLayerOnce({ id: "estate-layers-fill", type: "fill", source: "estate-layers", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["match", ["get", "type"], "road", "#2b2f36", "open_space", "#78a85d", "drainage", "#287cb4", "infrastructure", "#b77c2d", "#287cb4"], "fill-opacity": ["match", ["get", "type"], "road", 0.85, 0.4] } });
  addLayerOnce({ id: "estate-layers-fill-outline", type: "line", source: "estate-layers", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": ["match", ["get", "type"], "road", "#0f1216", "open_space", "#3f7a2c", "drainage", "#1c5aa8", "infrastructure", "#8a4f16", "#1c5aa8"], "line-width": 1.6 } });
  addSourceOnce("estate-layer-labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  addLayerOnce({
    id: "estate-layer-labels",
    type: "symbol",
    source: "estate-layer-labels",
    minzoom: 14,
    layout: { "text-field": ["get", "label"], "text-size": 10.5, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "symbol-placement": ["match", ["get", "kind"], "line", "line", "point"], "text-max-angle": 30 },
    paint: { "text-color": "#0f1e17", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.6 },
  });
  addSourceOnce("estate-block-labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  addLayerOnce({
    id: "estate-block-labels",
    type: "symbol",
    source: "estate-block-labels",
    layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] },
    paint: { "text-color": "#ffffff", "text-halo-color": "rgba(16,24,39,0.85)", "text-halo-width": 3 },
  });
  addSourceOnce("estate-plot-labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  addLayerOnce({
    id: "estate-plot-labels",
    type: "symbol",
    source: "estate-plot-labels",
    minzoom: 15,
    layout: { "text-field": ["get", "label"], "text-size": 10, "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"] },
    paint: { "text-color": ["case", ["get", "isCustomer"], "#ffffff", "#0f1e17"], "text-halo-color": ["case", ["get", "isCustomer"], "rgba(16,24,39,0.85)", "rgba(255,255,255,0.85)"], "text-halo-width": 2 },
  });
}

function extendMapBounds(bounds: any, geometry: any) {
  if (!geometry) return;
  const coordinates = geometry.coordinates;
  if (geometry.type === "Point") bounds.extend(coordinates);
  else if (geometry.type === "LineString") coordinates.forEach((coord: number[]) => bounds.extend(coord));
  else coordinates.forEach((part: any) => extendMapBounds(bounds, { type: geometry.type === "Polygon" ? "LineString" : geometry.type === "MultiPolygon" ? "Polygon" : "LineString", coordinates: part }));
}

function orderBoundaryPointIndexes(points: Array<{ lng: number; lat: number }>) {
  if (points.length < 3) return points.map((_, index) => index);
  const center = points.reduce((sum, point) => ({ lng: sum.lng + point.lng / points.length, lat: sum.lat + point.lat / points.length }), { lng: 0, lat: 0 });
  const order = points.map((_, index) => index).sort((left, right) => Math.atan2(points[left].lat - center.lat, points[left].lng - center.lng) - Math.atan2(points[right].lat - center.lat, points[right].lng - center.lng));
  for (let pass = 0; pass < points.length * points.length; pass += 1) {
    let changed = false;
    for (let first = 0; first < order.length - 2 && !changed; first += 1) {
      for (let second = first + 2; second < order.length && !changed; second += 1) {
        if (first === 0 && second === order.length - 1) continue;
        const nextFirst = (first + 1) % order.length;
        const nextSecond = (second + 1) % order.length;
        if (segmentsCross(points[order[first]], points[order[nextFirst]], points[order[second]], points[order[nextSecond]])) {
          order.splice(first + 1, second - first, ...order.slice(first + 1, second + 1).reverse());
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return order;
}

export default function Estates() {
  const { estateId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isMapView = location.pathname.endsWith("/map");
  const [searchParams] = useSearchParams();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [newEstateName, setNewEstateName] = useState("");
  const [newEstateLocation, setNewEstateLocation] = useState("");
  const [newEstateCrs, setNewEstateCrs] = useState("EPSG:4326");
  const [newEstateDatum, setNewEstateDatum] = useState("");
  const [newEstateProjectReference, setNewEstateProjectReference] = useState("");
  const [newEstateProjectOwner, setNewEstateProjectOwner] = useState("");
  const [newEstateOwnershipDetails, setNewEstateOwnershipDetails] = useState("");
  const [newEstateOrg, setNewEstateOrg] = useState("");
  const [selectedExistingEstateId, setSelectedExistingEstateId] = useState("");
  const [showCreateEstate, setShowCreateEstate] = useState(false);
  const [deleteEstateTarget, setDeleteEstateTarget] = useState<Estate | null>(null);
  const [deleteEstateConfirmText, setDeleteEstateConfirmText] = useState("");
  const [deleteEstateBusy, setDeleteEstateBusy] = useState(false);
  const [deleteEstateAllocationWarning, setDeleteEstateAllocationWarning] = useState<string | null>(null);
  const [plotNumber, setPlotNumber] = useState("");
  const [plotInputPoints, setPlotInputPoints] = useState<EstateCoordinatePoint[]>([]);
  const [plotInputCoordinateSystem, setPlotInputCoordinateSystem] = useState("wgs84");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [paymentScheduleEnabled, setPaymentScheduleEnabled] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentIntervalMonths, setInstallmentIntervalMonths] = useState("3");
  const [nextPaymentDueDate, setNextPaymentDueDate] = useState("");
  const [amountPaidNow, setAmountPaidNow] = useState("");
  const [amountPaidNowMethod, setAmountPaidNowMethod] = useState("bank_transfer");
  const [amountPaidReceipt, setAmountPaidReceipt] = useState<File | null>(null);
  const [salesAgentSubject, setSalesAgentSubject] = useState("");
  const [salesAgents, setSalesAgents] = useState<any[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [assignmentBusy, setAssignmentBusy] = useState<"reserve" | "allocate" | null>(null);
  const [customerBusy, setCustomerBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState("");
  const assignmentRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const customerRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [inspectionOutcome, setInspectionOutcome] = useState("observed");
  const [hazards, setHazards] = useState<any>(null);
  const [hazardDashboard, setHazardDashboard] = useState<any>(null);
  const [hazardUpgradeRequired, setHazardUpgradeRequired] = useState(false);
  const [layerType, setLayerType] = useState("road");
  const [layerName, setLayerName] = useState("");
  const [layerCoordinates, setLayerCoordinates] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [layerEditCoordinates, setLayerEditCoordinates] = useState("");
  const [blocks, setBlocks] = useState<any[]>([]);
  const [blockLabel, setBlockLabel] = useState("");
  const [blockName, setBlockName] = useState("");
  const [inspections, setInspections] = useState<any[]>([]);
  const [plotTimeline, setPlotTimeline] = useState<any[]>([]);
  const [importReviews, setImportReviews] = useState<any[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);
  const [dxfFile, setDxfFile] = useState<File | null>(null);
  const [scannedLayoutFile, setScannedLayoutFile] = useState<File | null>(null);
  // What the georeference session's ground control points will actually be entered in - was
  // previously hardcoded to "wgs84" with no way for the uploader to choose, silently mismatching
  // whatever coordinate system their own survey data was really in.
  const [scannedLayoutCrs, setScannedLayoutCrs] = useState("wgs84");
  const [importSourceCrs, setImportSourceCrs] = useState("EPSG:4326");
  const [layoutUploadBusy, setLayoutUploadBusy] = useState(false);
  const [layoutMessage, setLayoutMessageRaw] = useState("");
  const [layoutMessageTone, setLayoutMessageTone] = useState<MessageTone>("good");
  const setLayoutMessage = (text: string, tone: MessageTone = "good") => { setLayoutMessageRaw(text); setLayoutMessageTone(tone); };
  const [layoutProposal, setLayoutProposal] = useState<any>(null);
  const [pendingLayoutApproval, setPendingLayoutApproval] = useState<{ proposalId: number } | null>(null);
  const [layoutDesignerBusy, setLayoutDesignerBusy] = useState(false);
  const [message, setMessageRaw] = useState("Loading estates...");
  const [messageTone, setMessageTone] = useState<MessageTone>("good");
  const setMessage = (text: string, tone: MessageTone = "good") => { setMessageRaw(text); setMessageTone(tone); };
  // A handful of actions (reserve/allocate a plot, create a plot, subdivide, etc.) reload the whole
  // page on success to refresh the many pieces of state that depend on it - which wipes out any
  // toast fired right before the reload. This relay lets such an action stash a message just before
  // reloading, read back and shown once here as a toast on the next mount.
  const stashPendingNotice = (text: string, tone: MessageTone = "good") => {
    try { sessionStorage.setItem("edash_pending_notice", JSON.stringify({ text, tone })); } catch { /* storage unavailable - the toast is simply skipped after reload */ }
  };
  useEffect(() => {
    const pending = sessionStorage.getItem("edash_pending_notice");
    if (!pending) return;
    sessionStorage.removeItem("edash_pending_notice");
    try {
      const { text, tone } = JSON.parse(pending);
      if (text) (tone === "danger" ? toast.error : toast.success)(text);
    } catch { /* malformed - ignore */ }
  }, []);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const [subdivisionCount, setSubdivisionCount] = useState("4");
  const [subdivisionBusy, setSubdivisionBusy] = useState(false);
  const [allocationId, setAllocationId] = useState("");
  const [financial, setFinancial] = useState<any>(null);
  const [surveyRequests, setSurveyRequests] = useState<any[]>([]);
  const [stakingTasks, setStakingTasks] = useState<any[]>([]);
  const [preparingSurveyPlotId, setPreparingSurveyPlotId] = useState<number | null>(null);
  const [surveyStationSelection, setSurveyStationSelection] = useState<SurveyStationSelection | null>(null);
  const [surveyStationMode, setSurveyStationMode] = useState<"current" | "custom">("current");
  const [customSurveyStationNames, setCustomSurveyStationNames] = useState<string[]>([]);
  const [dgpsExportPlotId, setDgpsExportPlotId] = useState<number | null>(null);
  const [dgpsExportCoordinateSystem, setDgpsExportCoordinateSystem] = useState("wgs84_nigeria_meters");
  const [dgpsExportBusy, setDgpsExportBusy] = useState(false);
  const [layoutExportCoordinateSystem, setLayoutExportCoordinateSystem] = useState("wgs84_nigeria_meters");
  const [layoutPdfExportBusy, setLayoutPdfExportBusy] = useState(false);
  const [layoutPdfPaperSize, setLayoutPdfPaperSize] = useState("A3");
  const [layoutPdfIncludeCustomerNames, setLayoutPdfIncludeCustomerNames] = useState(false);
  const [layoutDgpsExportBusy, setLayoutDgpsExportBusy] = useState(false);
  const [stakingEvidence, setStakingEvidence] = useState<File | null>(null);
  const [plotGeojson, setPlotGeojson] = useState<any>({ type: "FeatureCollection", features: [] });
  const [layerGeojson, setLayerGeojson] = useState<any>({ type: "FeatureCollection", features: [] });
  const [statusFilter, setStatusFilter] = useState("all");
  const [plotSearch, setPlotSearch] = useState("");
  const [quality, setQuality] = useState<any>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [estatePayments, setEstatePayments] = useState<any[]>([]);
  const [estateDocuments, setEstateDocuments] = useState<any[]>([]);
  const [publicSettings, setPublicSettings] = useState<any>(null);
  const [estateDetail, setEstateDetail] = useState<any>(null);
  const unitSystem: UnitSystem = estateDetail?.unit_system === "ft" ? "ft" : "m";
  // Satellite is the requested default first view - the actual terrain/imagery is what a plot
  // layout needs to be checked against. The mapbox-gl bundle itself is still prefetched from the
  // Dashboard (see EstateShell's prefetchMapboxCore effect) to soften the heavier satellite-tile
  // download on a slow connection; the toggle above the map still lets anyone switch to the
  // lighter vector "Map" style if they want it.
  const [mapStyleMode, setMapStyleMode] = useState<"map" | "satellite">("satellite");
  const [blockFilterId, setBlockFilterId] = useState("all");
  const [layersVisible, setLayersVisible] = useState(true);
  const [drawerTab, setDrawerTab] = useState<"overview" | "customer" | "survey" | "staking" | "documents" | "hazards" | "timeline">("overview");
  const [editingDevelopment, setEditingDevelopment] = useState(false);
  const [plotContextMenu, setPlotContextMenu] = useState<{ x: number; y: number; plotId: number } | null>(null);
  const [activeTool, setActiveTool] = useState<"add-plot" | "layout" | "blocks" | "layers" | "export-layout" | null>(null);
  type AddPlotMethod = "draw" | "coordinates" | EstateLayoutMethod;
  const [addPlotMethod, setAddPlotMethod] = useState<AddPlotMethod>("draw");
  const [designSubdividePlotId, setDesignSubdividePlotId] = useState<number | null>(null);
  const [designLayoutMethod, setDesignLayoutMethod] = useState<"subdivide" | "automatic">("automatic");
  const [addPlotRepresents, setAddPlotRepresents] = useState<"plot" | "boundary">("plot");
  const [importAsBoundary, setImportAsBoundary] = useState(false);
  const [deletePlotConfirmText, setDeletePlotConfirmText] = useState("");
  const [showDeletePlotConfirm, setShowDeletePlotConfirm] = useState(false);
  const [deletePlotBusy, setDeletePlotBusy] = useState(false);
  const [showEditPlotBoundary, setShowEditPlotBoundary] = useState(false);
  const [editPlotPoints, setEditPlotPoints] = useState<Array<{ station: string; lng: number; lat: number }>>([]);
  const [editPlotBusy, setEditPlotBusy] = useState(false);
  const [resetLayoutConfirmText, setResetLayoutConfirmText] = useState("");
  const [showResetLayoutConfirm, setShowResetLayoutConfirm] = useState(false);
  const [resetLayoutBusy, setResetLayoutBusy] = useState(false);
  const [plotDocumentFile, setPlotDocumentFile] = useState<File | null>(null);
  const [plotDocumentBusy, setPlotDocumentBusy] = useState(false);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapGridRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapInteractionRef = useRef<{ allocations: any[]; selectAllocation: (id: string) => void }>({ allocations: [], selectAllocation: () => {} });
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [styleGeneration, setStyleGeneration] = useState(0);
  const visiblePlotGeojson = useMemo(() => {
    const query = plotSearch.trim().toLowerCase();
    return {
      ...plotGeojson,
      features: (plotGeojson.features || []).filter((feature: any) => {
        const properties = feature.properties || {};
        const plotNumber = String(properties.plot_number || properties.number || "").toLowerCase();
        const matchesBlock = blockFilterId === "all" || String(properties.block_id ?? "") === blockFilterId;
        return matchesBlock && (statusFilter === "all" || properties.commercial_status === statusFilter) && (!query || plotNumber.includes(query));
      }),
    };
  }, [plotGeojson, plotSearch, statusFilter, blockFilterId]);
  const mapPlotGeojson = useMemo(() => ({
    ...visiblePlotGeojson,
    features: visiblePlotGeojson.features.map((feature: any) => ({
      ...feature,
      geometry: normalizeEstateMapGeometry(feature.geometry, estateDetail?.crs),
    })),
  }), [visiblePlotGeojson, estateDetail?.crs]);
  const mapBoundary = useMemo(() => normalizeEstateMapGeometry(estateDetail?.boundary, estateDetail?.crs), [estateDetail?.boundary, estateDetail?.crs]);
  const boundaryAreaSqm = useMemo(() => {
    const calculated = geometryAreaSqm(mapBoundary);
    if (calculated && calculated > 0) return calculated;
    const stored = Number(estateDetail?.approximate_area_sqm);
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  }, [mapBoundary, estateDetail?.approximate_area_sqm]);
  const plotInputMapPoints = useMemo(() => plotInputPoints.map((point) => {
    const [lng, lat] = toWGS84(Number(point.lng), Number(point.lat), plotInputCoordinateSystem);
    return { ...point, lng, lat };
  }).filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat)), [plotInputPoints, plotInputCoordinateSystem]);
  const plotInputClosure = useMemo(() => checkPolygonClosure(plotInputMapPoints.map((point) => [point.lng, point.lat] as [number, number])), [plotInputMapPoints]);
  useEffect(() => {
    api.get("/estates/foundation/access").then((response) => { const rows=response.data.organizations || []; setOrganizations(rows); if (rows.length === 1) setNewEstateOrg(String(rows[0].id)); }).catch(() => setOrganizations([])).finally(() => setOrganizationsLoaded(true));
    api.get("/estates")
      .then((response) => response.data)
      .then((rows) => {
        // Show the estate picker immediately. Financial totals are supplementary and must not
        // hold the whole dashboard behind one request per estate.
        setEstates(rows);
        setMessage(rows.length ? "" : "No estates yet. Create your first estate to get started.");
        void Promise.all(rows.map(async (estate: Estate) => {
          try { return { ...estate, financial: (await api.get(`/estates/${estate.id}/financial-summary`)).data }; }
          catch { return estate; }
        })).then((enriched) => setEstates(enriched));
      })
      .catch(async (error) => setMessage(await extractApiErrorMessage(error, "Estates are not available for this account."), "danger"));
  }, []);
  const createEstate = async () => {
    if (!newEstateOrg || !newEstateName.trim()) { toast.error("Choose an organization and enter an Estate name."); return; }
    try { const response=await api.post(`/estates/organizations/${newEstateOrg}`, { name:newEstateName.trim(), location_text:newEstateLocation.trim() || null, crs:newEstateCrs.trim() || "EPSG:4326", datum:newEstateDatum.trim() || null, project_reference:newEstateProjectReference.trim() || null, project_owner:newEstateProjectOwner.trim() || null, ownership_details:newEstateOwnershipDetails.trim() || null, boundary: null }); window.location.assign(`/estates/${response.data.id}/map`); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Estate could not be created.")); }
  };
  const deleteEstate = async (force: boolean = false) => {
    if (!deleteEstateTarget) return;
    setDeleteEstateBusy(true);
    try {
      await api.delete(`/estates/${deleteEstateTarget.id}`, force ? { params: { force: true } } : undefined);
      setEstates((current) => current.filter((estate) => estate.id !== deleteEstateTarget.id));
      if (selectedExistingEstateId === String(deleteEstateTarget.id)) setSelectedExistingEstateId("");
      toast.success(`"${deleteEstateTarget.name}" was deleted.`);
      setDeleteEstateTarget(null);
      setDeleteEstateConfirmText("");
      setDeleteEstateAllocationWarning(null);
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      if (error?.response?.status === 409 && detail && typeof detail === "object" && detail.requires_force) {
        setDeleteEstateAllocationWarning(detail.message || `${detail.allocated_count} plot(s) in this Estate have a customer reservation or allocation.`);
      } else {
        toast.error(await extractApiErrorMessage(error, "That Estate could not be deleted."));
      }
    } finally {
      setDeleteEstateBusy(false);
    }
  };
  const approveEstateMap = async () => {
    if (!estateId) return;
    try { const response = await api.post(`/estates/${estateId}/approve-map`); setDashboard((current: any) => current ? { ...current, estate: { ...current.estate, status: response.data.status } } : current); toast.success("Estate map approved and published as the operational plot register."); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Resolve the geometry issues before publishing the Estate map.")); }
  };
  const loadQualityCheck = async () => {
    if (!estateId || qualityLoading) return;
    setQualityLoading(true);
    try { setQuality((await api.get(`/estates/${estateId}/quality-check`)).data); }
    catch { setQuality(null); toast.error("The geometry check could not be completed."); }
    finally { setQualityLoading(false); }
  };
  const updatePlotInputPoint = (index: number, field: string, value: string | number | boolean) => {
    setPlotInputPoints((current) => current.map((point, pointIndex) => pointIndex === index ? { ...point, [field]: value } : point));
  };
  const addPlotInputPoint = () => {
    setPlotInputPoints((current) => [...current, { station: `P${current.length + 1}`, lng: Number.NaN, lat: Number.NaN, is_boundary: true }]);
  };
  const removePlotInputPoint = (index: number) => {
    setPlotInputPoints((current) => current.filter((_, pointIndex) => pointIndex !== index));
  };
  const reorderPlotInputPoints = () => {
    if (plotInputMapPoints.length !== plotInputPoints.length || plotInputClosure !== "self-intersecting") return;
    const order = orderBoundaryPointIndexes(plotInputMapPoints);
    const reordered = order.map((index) => plotInputPoints[index]);
    const reorderedMapPoints = order.map((index) => plotInputMapPoints[index]);
    setPlotInputPoints(reordered);
    const closed = checkPolygonClosure(reorderedMapPoints.map((point) => [point.lng, point.lat] as [number, number])) === "closed";
    (closed ? toast.success : toast.error)(closed ? "Point order corrected. Review the boundary, then create the plot." : "The points still cross. Edit the point order manually before creating the plot.");
  };
  const handlePlotCoordinatesDrawn = (points: Array<{ station: string; lng: number; lat: number }>) => {
    setPlotInputCoordinateSystem("wgs84");
    setPlotInputPoints(points.map((point) => ({ ...point, is_boundary: true })));
    toast.success("Boundary updated from the map. Review it, then create the plot.");
  };
  const importPlotInputPoints = (points: EstateCoordinatePoint[]) => {
    setPlotInputPoints(points.map((point, index) => ({ ...point, station: point.station || `P${index + 1}`, is_boundary: true })));
  };
  const createPlotFromInput = async () => {
    if (!estateId || !plotNumber.trim()) { toast.error("Enter a plot number first."); return; }
    if (plotInputPoints.length < 3) { toast.error("Add at least three boundary points or import a coordinate file."); return; }
    const ring = plotInputMapPoints.map((point) => [point.lng, point.lat]);
    if (ring.length < 3 || ring.some((point) => point.some((value) => !Number.isFinite(value)))) { toast.error("Check the coordinate values before creating this plot."); return; }
    if (plotInputClosure === "self-intersecting") { toast.error("Order the boundary points before creating the plot."); return; }
    try { await api.post(`/estates/${estateId}/plots`, { plot_number: plotNumber.trim(), geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] }, geometry_status: "approved" }); stashPendingNotice("Plot created."); window.location.reload(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Plot could not be created.")); }
  };
  const createEstateBoundaryFromInput = async () => {
    if (!estateId) return;
    if (plotInputPoints.length < 3) { toast.error("Add at least three boundary points or import a coordinate file."); return; }
    const ring = plotInputMapPoints.map((point) => [point.lng, point.lat]);
    if (ring.length < 3 || ring.some((point) => point.some((value) => !Number.isFinite(value)))) { toast.error("Check the coordinate values before setting the boundary."); return; }
    if (plotInputClosure === "self-intersecting") { toast.error("Order the boundary points before setting the boundary."); return; }
    try { await api.patch(`/estates/${estateId}`, { boundary: { type: "Polygon", coordinates: [[...ring, ring[0]]] } }); stashPendingNotice("Estate boundary set."); window.location.reload(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Estate boundary could not be set.")); }
  };
  const useAsEstateBoundary = async (plotId: number) => {
    if (!estateId) return;
    const feature = plotGeojson.features.find((item: any) => Number(item.properties?.id) === plotId);
    if (!feature?.geometry) { toast.error("Could not find that plot's geometry."); return; }
    try {
      await api.patch(`/estates/${estateId}`, { boundary: feature.geometry });
      stashPendingNotice("Estate boundary set.");
      window.location.reload();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Estate boundary could not be set."));
    }
  };
  const deletePlot = async () => {
    if (!estateId || !selectedPlot) return;
    setDeletePlotBusy(true);
    try {
      await api.delete(`/estates/${estateId}/plots/${selectedPlot.id}`);
      stashPendingNotice("Plot deleted.");
      window.location.reload();
    } catch (error) {
      setShowDeletePlotConfirm(false);
      toast.error(await extractApiErrorMessage(error, "Plot could not be deleted."));
    } finally {
      setDeletePlotBusy(false);
    }
  };
  const openEditPlotBoundary = () => {
    if (!selectedPlot) return;
    const feature = plotGeojson.features.find((item: any) => Number(item.properties?.id) === selectedPlot.id);
    const ring: number[][] = feature?.geometry?.type === "Polygon" ? feature.geometry.coordinates[0] : [];
    const withoutClosingPoint = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    setEditPlotPoints(withoutClosingPoint.map(([lng, lat], index) => ({ station: `P${index + 1}`, lng, lat })));
    setShowEditPlotBoundary(true);
  };
  const savePlotBoundary = async () => {
    if (!estateId || !selectedPlot) return;
    if (editPlotPoints.length < 3) { toast.error("Add at least three boundary points."); return; }
    const ring = editPlotPoints.map((point) => [point.lng, point.lat]);
    if (checkPolygonClosure(ring as [number, number][]) === "self-intersecting") { toast.error("This boundary crosses itself - adjust the vertices before saving."); return; }
    setEditPlotBusy(true);
    try {
      await api.patch(`/estates/${estateId}/plots/${selectedPlot.id}/geometry`, { geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] } });
      stashPendingNotice("Plot boundary saved.");
      window.location.reload();
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Plot boundary could not be saved."));
    } finally {
      setEditPlotBusy(false);
    }
  };
  const handleEditPlotCoordinatesDrawn = (points: Array<{ station: string; lng: number; lat: number }>) => {
    setEditPlotPoints(points);
    toast.success("Boundary updated from the map. Review it, then save.");
  };
  const parseCoordinateTextToPoints = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [lng, lat] = line.split(/[\s,]+/).map(Number);
    return { station: `P${index + 1}`, lng, lat };
  }).filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  const handleLayerCoordinatesDrawn = (points: Array<{ station: string; lng: number; lat: number }>) => {
    setLayerCoordinates(points.map((point) => `${point.lng}, ${point.lat}`).join("\n"));
  };
  const handleLayerEditCoordinatesDrawn = (points: Array<{ station: string; lng: number; lat: number }>) => {
    setLayerEditCoordinates(points.map((point) => `${point.lng}, ${point.lat}`).join("\n"));
  };
  const resetEstateLayout = async () => {
    if (!estateId) return;
    setResetLayoutBusy(true);
    try {
      await api.delete(`/estates/${estateId}/layout`);
      stashPendingNotice("Layout reset.");
      window.location.reload();
    } catch (error) {
      setShowResetLayoutConfirm(false);
      toast.error(await extractApiErrorMessage(error, "Layout could not be reset."));
    } finally {
      setResetLayoutBusy(false);
    }
  };
  const subdividePlotById = async (plotId: number) => {
    if (!estateId) return;
    const splitCount = Number(subdivisionCount);
    if (!Number.isInteger(splitCount) || splitCount < 2 || splitCount > 100) {
      toast.error("Choose between 2 and 100 new plots.");
      return;
    }
    setSubdivisionBusy(true);
    try {
      const response = await api.post(`/estates/${estateId}/plots/${plotId}/subdivide`, { split_count: splitCount });
      await refreshEstateLayoutData();
      setQuality(null);
      void loadQualityCheck();
      toast.success(`${response.data.created_count} plots created. Check the geometry below before publishing.`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "This plot could not be split."));
    } finally {
      setSubdivisionBusy(false);
    }
  };
  const subdividePlot = async () => {
    if (!selectedPlot) return;
    await subdividePlotById(selectedPlot.id);
  };
  const splitBoundaryIntoPlots = async () => {
    if (!estateId || !estateDetail?.boundary) return;
    const splitCount = Number(subdivisionCount);
    if (!Number.isInteger(splitCount) || splitCount < 2 || splitCount > 200) {
      toast.error("Choose between 2 and 200 new plots.");
      return;
    }
    setSubdivisionBusy(true);
    try {
      const created = await api.post(`/estates/${estateId}/plots`, { plot_number: "WHOLE", geometry: estateDetail.boundary, geometry_status: "approved" });
      const response = await api.post(`/estates/${estateId}/plots/${created.data.id}/subdivide`, { split_count: splitCount });
      await refreshEstateLayoutData();
      setQuality(null);
      void loadQualityCheck();
      toast.success(`${response.data.created_count} plots created from the boundary. Check the geometry below before publishing.`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The boundary could not be split into plots."));
    } finally {
      setSubdivisionBusy(false);
    }
  };
  const createCustomer = async () => {
    const estate = estates.find((item) => item.id === Number(estateId));
    if (!estate || !customerName.trim()) { toast.error("Enter the customer name."); return; }
    setCustomerBusy(true);
    const fingerprint = JSON.stringify({ organizationId: estate.organization_id, fullName: customerName.trim(), phone: customerPhone.trim(), email: customerEmail.trim() });
    if (!customerRequestRef.current || customerRequestRef.current.fingerprint !== fingerprint) {
      customerRequestRef.current = { fingerprint, key: createIdempotencyKey("estate-customer") };
    }
    const idempotencyKey = customerRequestRef.current.key;
    try { const response = await api.post(`/estates/organizations/${estate.organization_id}/customers`, { full_name: customerName.trim(), phone: customerPhone.trim() || null, email: customerEmail.trim() || null }, { headers: { "X-Idempotency-Key": idempotencyKey } }); setSelectedCustomerId(String(response.data.id)); setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); customerRequestRef.current = null; stashPendingNotice("Customer added."); window.location.reload(); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Customer could not be created.")); }
    finally { setCustomerBusy(false); }
  };
  const assignCustomer = async (allocate: boolean) => {
    if (assignmentBusy) return;
    if (!estateId || !selectedPlot || !selectedCustomerId) { toast.error("Choose a parcel and customer first."); return; }
    if (!amountPaidNow || Number(amountPaidNow) <= 0) {
      toast.error("Record the customer's first payment before reserving or allocating this plot.");
      return;
    }
    if (paymentScheduleEnabled && (!installmentAmount || !nextPaymentDueDate || Number(installmentIntervalMonths) < 1)) {
      toast.error("Enter the instalment amount, repeat interval in months, and next payment due date.");
      return;
    }
    setAssignmentBusy(allocate ? "allocate" : "reserve");
    const fingerprint = JSON.stringify({ allocate, estateId, plotId: selectedPlot.id, customerId: selectedCustomerId, agreedPrice, amountPaidNow, amountPaidNowMethod, paymentScheduleEnabled, installmentAmount, installmentIntervalMonths, nextPaymentDueDate, salesAgentSubject });
    if (!assignmentRequestRef.current || assignmentRequestRef.current.fingerprint !== fingerprint) {
      assignmentRequestRef.current = { fingerprint, key: createIdempotencyKey(allocate ? "estate-allocate" : "estate-reserve") };
    }
    const idempotencyKey = assignmentRequestRef.current.key;
    try {
      const [agentSubjectType, agentSubjectId] = salesAgentSubject ? salesAgentSubject.split("::") : [null, null];
      const response = await api.post(`/estates/${estateId}/plots/${selectedPlot.id}/${allocate ? "allocate" : "reserve"}`, {
        customer_id: Number(selectedCustomerId),
        agreed_price: agreedPrice ? Number(agreedPrice) : null,
        payment_schedule: paymentScheduleEnabled ? {
          installment_amount: Number(installmentAmount),
          interval_months: Number(installmentIntervalMonths),
          next_due_at: `${nextPaymentDueDate}T00:00:00Z`,
        } : null,
        initial_payment_amount: amountPaidNow ? Number(amountPaidNow) : null,
        initial_payment_method: amountPaidNow ? amountPaidNowMethod : null,
        sales_agent_subject_type: agentSubjectType,
        sales_agent_subject_id: agentSubjectId,
      }, { headers: { "X-Idempotency-Key": idempotencyKey } });
      if (amountPaidReceipt && response.data.initial_payment_id && !response.data.already_processed) {
        const form = new FormData();
        form.append("file", amountPaidReceipt);
        try { await api.post(`/estates/payments/${response.data.initial_payment_id}/evidence`, form); }
        catch { /* the reservation/allocation itself already succeeded - a failed receipt upload shouldn't block it */ }
      }
      assignmentRequestRef.current = null;
      stashPendingNotice(`Plot ${allocate ? "allocated" : "reserved"}.${response.data.customer_notified ? " A confirmation email has been sent to the customer." : ""}`);
      window.location.reload();
    }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Parcel action could not be completed.")); }
    finally { setAssignmentBusy(null); }
  };
  const recordInspection = async () => {
    if (!selectedPlot) return;
    try { await api.post(`/estates/plots/${selectedPlot.id}/inspections`, { inspection_type: "site_visit", outcome: inspectionOutcome, notes: inspectionNotes || null }); setInspectionNotes(""); toast.success("Field inspection recorded."); setInspections((await api.get(`/estates/plots/${selectedPlot.id}/inspections`)).data); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Inspection could not be recorded.")); }
  };
  useEffect(() => { const plot = plots.find((item) => item.id === selectedPlotId); if (!plot) { setInspections([]); return; } api.get(`/estates/plots/${plot.id}/inspections`).then((response) => setInspections(response.data || [])).catch(() => setInspections([])); }, [plots, selectedPlotId]);
  useEffect(() => { const plot = plots.find((item) => item.id === selectedPlotId); if (!plot) { setPlotTimeline([]); return; } api.get(`/estates/plots/${plot.id}/timeline`).then((response) => setPlotTimeline(response.data || [])).catch(() => setPlotTimeline([])); }, [plots, selectedPlotId]);
  const loadHazards = async () => {
    if (!selectedPlot) return;
    try { const response = await api.post(`/estates/plots/${selectedPlot.id}/hazards/assess`); setHazards(response.data); if (estateId) setHazardDashboard((await api.get(`/estates/${estateId}/hazards`)).data); toast.success("Hazard screening completed."); }
    catch (error) {
      if (isUpgradeRequiredError(error)) setHazardUpgradeRequired(true);
      else toast.error(await extractApiErrorMessage(error, "Hazard screening could not be loaded."));
    }
  };
  const createLayer = async () => {
    if (!estateId) return;
    const coordinates=layerCoordinates.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,]+/).map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([lng,lat]) => [lng,lat]);
    if (coordinates.length < 2) { toast.error("Enter at least two longitude, latitude rows for the layer."); return; }
    const polygon=layerType === "open_space";
    const geometry=polygon ? {type:"Polygon",coordinates:[[...coordinates,coordinates[0]]]} : {type:"LineString",coordinates};
    try { await api.post(`/estates/${estateId}/layers`, {feature_type:layerType,name:layerName || null,geometry}); stashPendingNotice("Layer added."); window.location.reload(); }
    catch (error) { toast.error(await extractApiErrorMessage(error,"Layer could not be saved.")); }
  };
  const createBlock = async () => {
    if (!estateId || !blockLabel.trim()) { toast.error("Enter a block label first."); return; }
    try { const response = await api.post(`/estates/${estateId}/blocks`, { label: blockLabel.trim(), name: blockName.trim() || null }); setBlocks((current) => [...current, response.data]); setBlockLabel(""); setBlockName(""); toast.success("Block added to the estate register."); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Block could not be saved.")); }
  };
  const refreshImportReviews = async () => {
    if (!estateId) return;
    setImportReviews((await api.get(`/estates/${estateId}/import-reviews`)).data || []);
  };
  const uploadLayout = async (kind: "csv" | "geojson" | "dxf" | "scanned-layout") => {
    if (!estateId) return;
    const selected = kind === "csv" ? csvFile : kind === "geojson" ? geojsonFile : kind === "dxf" ? dxfFile : scannedLayoutFile;
    if (!selected) { setLayoutMessage("Choose a file before uploading.", "danger"); toast.error("Choose a file before uploading."); return; }
    const form = new FormData(); form.append("file", selected);
    setLayoutUploadBusy(true);
    setLayoutMessage("");
    try {
      const params = kind === "dxf" || kind === "csv" ? { source_crs: importSourceCrs || estateDetail?.crs || "EPSG:4326" } : undefined;
      await api.post(`/estates/${estateId}/import-reviews/${kind}`, form, { params });
      await refreshImportReviews();
      setLayoutMessage("Your layout is ready to review below.");
      toast.success("Your layout is ready to review below.");
    } catch (error) {
      const text = await extractApiErrorMessage(error, "Layout import could not be uploaded.");
      setLayoutMessage(text, "danger");
      toast.error(text);
    }
    finally { setLayoutUploadBusy(false); }
  };
  const decideImportReview = async (reviewId: number, status: "approved" | "rejected", asBoundary = false) => {
    setLayoutUploadBusy(true);
    setLayoutMessage("");
    try {
      await api.post(`/estates/import-reviews/${reviewId}/decision`, { status, as_boundary: asBoundary });
      await refreshImportReviews();
      const text = status === "approved" ? (asBoundary ? "Estate boundary set. Open \"Design Layout\" to subdivide it or design a layout automatically." : "Plots added to your Estate register.") : "Layout discarded.";
      setLayoutMessage(text);
      if (status === "approved") { stashPendingNotice(text); window.location.reload(); }
      else toast.success(text);
    }
    catch (error) {
      const text = await extractApiErrorMessage(error, "Import decision could not be saved.");
      setLayoutMessage(text, "danger");
      toast.error(text);
    }
    finally { setLayoutUploadBusy(false); }
  };
  const startGeoreferenceImport = async (file: File) => {
    if (!estateId) return;
    setLayoutUploadBusy(true);
    setLayoutMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title_text", `${estateDetail?.name || "Estate"} layout scan`);
      form.append("target_coordinate_system", scannedLayoutCrs);
      const session = (await api.post("/survey-georeference/sessions", form)).data.session;
      await api.post(`/estates/${estateId}/import-reviews/from-georeference-session`, { survey_georeference_session_id: session.id });
      await refreshImportReviews();
      const text = "Layout session created. Open the georeference tool to place control points and trace each plot.";
      setLayoutMessage(text);
      toast.success(text);
    } catch (error) {
      const text = await extractApiErrorMessage(error, "The scanned layout could not be started.");
      setLayoutMessage(text, "danger");
      toast.error(text);
    } finally {
      setLayoutUploadBusy(false);
    }
  };
  const openGeoreferenceTool = (sessionId: string, reviewId: number) => {
    const params = new URLSearchParams({
      mode: "georeference",
      session: sessionId,
      return_estate_id: String(estateId),
      return_import_review_id: String(reviewId),
    });
    navigate(`/survey-plan?${params.toString()}`);
  };
  const handleLayoutFileChange = (method: EstateLayoutMethod, file: File | null) => {
    if (method === "csv") setCsvFile(file);
    else if (method === "geojson") setGeojsonFile(file);
    else if (method === "dxf") setDxfFile(file);
    else setScannedLayoutFile(file);
  };
  const generateLayoutProposal = async (criteria: Record<string, unknown>) => {
    if (!estateId) return;
    setLayoutDesignerBusy(true);
    try {
      const response = await api.post(`/estates/${estateId}/layout-proposals`, criteria);
      setLayoutProposal(response.data);
      toast.success("Draft layout created. Review it before adding plots to the Estate.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The draft layout could not be created."));
    } finally {
      setLayoutDesignerBusy(false);
    }
  };
  const decideLayoutProposal = async (proposalId: number, status: "approved" | "rejected", options?: { replaceExisting?: boolean }) => {
    // Approving over an Estate that already has an approved layout would otherwise fail outright
    // on the first clashing plot number - ask first, rather than let that confusing error be the
    // only thing that happens when the user clicks Approve.
    if (status === "approved" && plots.length > 0 && !options?.replaceExisting) {
      setPendingLayoutApproval({ proposalId });
      return;
    }
    setLayoutDesignerBusy(true);
    try {
      await api.post(`/estates/layout-proposals/${proposalId}/decision`, { status, replace_existing: Boolean(options?.replaceExisting) });
      setPendingLayoutApproval(null);
      if (status === "approved") {
        await refreshEstateLayoutData();
        setQuality(null);
        void loadQualityCheck();
        toast.success("The plots and shared spaces were added. Check the geometry below before publishing.");
      } else {
        toast.success("Draft layout discarded.");
        setLayoutProposal((current: any) => current ? { ...current, status } : current);
      }
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "The layout decision could not be saved."));
    } finally {
      setLayoutDesignerBusy(false);
    }
  };
  const editLayoutProposalCandidates = async (proposalId: number, plotCandidates: any[], featureCandidates?: any[]) => {
    try {
      const payload: Record<string, unknown> = { plot_candidates: plotCandidates };
      if (featureCandidates) payload.feature_candidates = featureCandidates;
      const response = await api.patch(`/estates/layout-proposals/${proposalId}`, payload);
      setLayoutProposal(response.data);
      toast.success(`Saved. ${response.data.candidates?.length || 0} plots in this draft now.`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Your changes could not be saved."));
      throw error;
    }
  };
  const addLayoutProposalFeature = async (proposalId: number, featureType: "road" | "open_space", geometry: any, widthM: number | undefined, plotCandidates: any[]) => {
    try {
      const response = await api.post(`/estates/layout-proposals/${proposalId}/features`, { feature_type: featureType, geometry, width_m: widthM, plot_candidates: plotCandidates });
      setLayoutProposal(response.data);
      toast.success(`${featureType === "road" ? "Road" : "Open space"} added. ${response.data.candidates?.length || 0} plots remain in this draft.`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "That shape could not be added."));
      throw error;
    }
  };
  const removeLayoutProposalFeature = async (proposalId: number, featureIndex: number, plotCandidates: any[], featureCandidates: any[]) => {
    try {
      const response = await api.post(`/estates/layout-proposals/${proposalId}/remove-feature`, { feature_index: featureIndex, plot_candidates: plotCandidates, feature_candidates: featureCandidates });
      setLayoutProposal(response.data);
      toast.success(`Removed. ${response.data.candidates?.length || 0} plots in this draft now.`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "That shape could not be removed."));
      throw error;
    }
  };
  const selectLayerForEdit = (id: string) => {
    setSelectedLayerId(id);
    const feature = (layerGeojson.features || []).find((item: any) => String(item.id) === id);
    const coordinates = feature?.geometry?.coordinates || [];
    const rows = feature?.geometry?.type === "Polygon" ? coordinates[0] : coordinates;
    setLayerEditCoordinates((rows || []).map((point: number[]) => point.join(", ")).join("\n"));
  };
  const updateLayer = async () => {
    if (!estateId || !selectedLayerId) return;
    const feature = (layerGeojson.features || []).find((item: any) => String(item.id) === selectedLayerId);
    const points = layerEditCoordinates.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/[\s,]+/).map(Number)).filter((point) => point.length >= 2 && point.every(Number.isFinite)).map(([lng, lat]) => [lng, lat]);
    if (!feature || points.length < 2) { toast.error("Enter at least two valid coordinate rows."); return; }
    const isPolygon = feature.geometry.type === "Polygon";
    const ring = isPolygon && points[0].join() !== points[points.length - 1].join() ? [...points, points[0]] : points;
    try { await api.patch(`/estates/${estateId}/layers/${selectedLayerId}`, { geometry: isPolygon ? { type: "Polygon", coordinates: [ring] } : { type: "LineString", coordinates: points } }); setLayerGeojson((current: any) => ({ ...current, features: current.features.map((item: any) => item.id === Number(selectedLayerId) ? { ...item, geometry: isPolygon ? { type: "Polygon", coordinates: [ring] } : { type: "LineString", coordinates: points } } : item) })); toast.success("Layer geometry updated."); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Layer could not be updated.")); }
  };
  const archiveLayer = async () => {
    if (!estateId || !selectedLayerId) return;
    try { await api.delete(`/estates/${estateId}/layers/${selectedLayerId}`); setLayerGeojson((current: any) => ({ ...current, features: current.features.filter((item: any) => item.id !== Number(selectedLayerId)) })); setSelectedLayerId(""); setLayerEditCoordinates(""); toast.success("Layer archived."); }
    catch (error) { toast.error(await extractApiErrorMessage(error, "Layer could not be archived.")); }
  };
  useEffect(() => {
    if (!estateId) return;
    api.get(`/estates/${estateId}`).then((response) => {
      setEstateDetail(response.data);
      setImportSourceCrs(response.data.crs || "EPSG:4326");
      // The Estate's own registered CRS (set at Estate creation, e.g. a Nigerian UTM/Minna belt) is
      // the coordinate system its survey plans and DGPS exports should agree on - seed every picker
      // from it so drawing, entering coordinates, importing files, and exporting DGPS data all start
      // out on the same system by default instead of each one guessing its own generic fallback.
      const estateMapSystem = estateMapCoordinateSystem(response.data.crs);
      setPlotInputCoordinateSystem(estateMapSystem);
      setScannedLayoutCrs(estateMapSystem);
      setDgpsExportCoordinateSystem(estateMapSystem);
      setLayoutExportCoordinateSystem(estateMapSystem);
      const organizationId = response.data.organization_id;
      if (organizationId) {
        api.get(`/estates/organizations/${organizationId}/sales-agents`).then((agentsResponse) => setSalesAgents(agentsResponse.data || [])).catch(() => setSalesAgents([]));
      }
    }).catch(() => setEstateDetail(null));
    api.get("/estates/selectors", { params: { estate_id: estateId } })
      .then((response) => { setAllocations(response.data.allocations || []); setPlots(response.data.plots || []); setCustomers(response.data.customers || []); })
      .catch(() => { setAllocations([]); setPlots([]); setCustomers([]); });
    Promise.all([
      api.get("/estates/survey-requests", { params: { estate_id: estateId } }),
      api.get("/estates/staking-tasks", { params: { estate_id: estateId } }),
    ]).then(([surveys, staking]) => {
      setSurveyRequests(surveys.data || []);
      setStakingTasks(staking.data || []);
    }).catch(() => {
      setSurveyRequests([]);
      setStakingTasks([]);
    });
    api.get(`/estates/${estateId}/plots.geojson`).then((response) => setPlotGeojson(response.data)).catch(() => setPlotGeojson({ type: "FeatureCollection", features: [] }));
    api.get(`/estates/${estateId}/layers.geojson`).then((response) => setLayerGeojson(response.data)).catch(() => setLayerGeojson({ type: "FeatureCollection", features: [] }));
    api.get(`/estates/${estateId}/import-reviews`).then((response) => setImportReviews(response.data || [])).catch(() => setImportReviews([]));
    api.get(`/estates/${estateId}/layout-proposals`).then((response) => setLayoutProposal((response.data || [])[0] || null)).catch(() => setLayoutProposal(null));
    api.get(`/estates/${estateId}/hazards`).then((response) => { setHazardDashboard(response.data); setHazardUpgradeRequired(false); }).catch((err) => { setHazardDashboard(null); setHazardUpgradeRequired(isUpgradeRequiredError(err)); });
    api.get(`/estates/${estateId}/blocks`).then((response) => setBlocks(response.data || [])).catch(() => setBlocks([]));
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
    api.get(`/estates/${estateId}/dashboard`).then((response) => setDashboard(response.data)).catch(() => setDashboard(null));
    api.get("/estates/payments", { params: { estate_id: estateId, page_size: 100 } }).then((response) => setEstatePayments(response.data?.items || [])).catch(() => setEstatePayments([]));
    api.get("/estates/documents", { params: { page_size: 100 } }).then((response) => setEstateDocuments(response.data?.items || [])).catch(() => setEstateDocuments([]));
    api.get(`/estates/${estateId}/public-settings`).then((response) => setPublicSettings(response.data)).catch(() => setPublicSettings(null));
  }, [estateId]);
  // Builds the mapboxgl.Map exactly ONCE per estate, guarded by mapRef.current the same way the
  // already-reliable MapViewEnhanced/ProjectMap components do it - this is a stronger guarantee
  // than a dependency array, since it physically refuses to construct a second map even if the
  // effect re-runs for an unrelated reason. Data (plots, boundary, layers, labels) is synced into
  // the already-built map by the effect below via source.setData(), and the basemap toggle calls
  // map.setStyle() directly from its button handler - neither ever tears down/reconstructs the
  // map, which was the earlier bug: rebuilding the WebGL map mid-load kept interrupting tile
  // requests so "load" never had a chance to fire and the canvas stayed blank.
  useEffect(() => {
    setMapError("");
    setMapReady(false);
    if (!isMapView || !estateId || !mapContainer.current || !MAPBOX_TOKEN || mapRef.current) return;
    let cancelled = false;
    let mapLoaded = false;
    let handlersAttached = false;
    const mapLoadTimeout = window.setTimeout(() => {
      if (!mapLoaded && !cancelled) setMapError("The basemap is taking longer than usual. Your plot layout remains available while imagery loads.");
    }, 20000);
    void Promise.all([loadMapboxGl(), loadMapboxGlCss()]).then(([mapboxgl]) => {
      if (cancelled || !mapContainer.current || mapRef.current) return;
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: mapStyleMode === "satellite" ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/light-v11",
        center: [7.4, 9.1],
        zoom: 12,
      });
      mapRef.current = map;
      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(mapContainer.current);
      (map as any)._edashResizeObserver = resizeObserver;
      map.on("error", (event: any) => {
        // Raster satellite tiles can fail transiently on slow connections. Keep the live map
        // mounted so Mapbox can retry instead of replacing it with the SVG fallback after one
        // tile error. Only a repeated pre-style failure should switch to the fallback message.
        if (!cancelled && !mapLoaded && event?.error?.status >= 400) {
          setMapError("Satellite imagery is still loading. Your plot layout remains available.");
        }
      });
      // "style.load" fires both on the very first style load AND after every future
      // map.setStyle() call (the basemap toggle) - re-adding the layers here (instead of only in
      // a one-shot "load" handler) means switching Map/Satellite never loses the plot layers.
      map.on("style.load", () => {
        mapLoaded = true;
        window.clearTimeout(mapLoadTimeout);
        setMapError("");
        map.resize();
        attachEstateMapLayers(map);
        if (!handlersAttached) {
          handlersAttached = true;
          const openPlotDrawer = (id: number) => {
            setSelectedPlotId(id);
            setDrawerTab("overview");
            const allocation = mapInteractionRef.current.allocations.find((item) => item.plot_id === id);
            if (allocation) mapInteractionRef.current.selectAllocation(String(allocation.id));
            else { setAllocationId(""); setFinancial(null); }
          };
          map.on("click", "estate-plots-fill", (event: any) => {
            const id = Number(event.features?.[0]?.properties?.id);
            const properties = event.features?.[0]?.properties || {};
            const allocation = mapInteractionRef.current.allocations.find((item) => item.plot_id === id);
            const container = document.createElement("div");
            container.className = "edash-map-popup";
            const title = document.createElement("strong");
            title.textContent = properties.plot_number || "";
            const status = document.createElement("span");
            status.className = "edash-map-popup-status";
            status.textContent = String(properties.commercial_status || "").replaceAll("_", " ");
            const customerLine = document.createElement("p");
            customerLine.textContent = allocation ? allocation.customer_name : "No customer yet";
            container.append(title, status, customerLine);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "edash-btn-primary edash-map-popup-btn";
            button.textContent = "More details";
            const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 12, maxWidth: "220px" })
              .setLngLat(event.lngLat)
              .setDOMContent(container)
              .addTo(map);
            button.onclick = () => { openPlotDrawer(id); popup.remove(); };
            container.appendChild(button);
          });
          map.on("contextmenu", "estate-plots-fill", (event: any) => {
            event.preventDefault();
            event.originalEvent?.preventDefault();
            const id = Number(event.features?.[0]?.properties?.id);
            if (!Number.isFinite(id)) return;
            setPlotContextMenu({ x: event.originalEvent.clientX, y: event.originalEvent.clientY, plotId: id });
          });
          map.on("mouseenter", "estate-plots-fill", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "estate-plots-fill", () => { map.getCanvas().style.cursor = ""; });
        }
        setMapReady(true);
        setStyleGeneration((value) => value + 1);
      });
    });
    return () => { cancelled = true; window.clearTimeout(mapLoadTimeout); (mapRef.current as any)?._edashResizeObserver?.disconnect(); mapRef.current?.remove(); mapRef.current = null; setMapReady(false); };
  }, [estateId, isMapView]);

  // Keeps the already-built map's sources in sync whenever the underlying data (or a style
  // reload, which wipes custom sources/layers) changes, without ever destroying/recreating the
  // mapboxgl.Map instance itself.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let cancelled = false;
    (map.getSource("estate-boundary") as any)?.setData(mapBoundary ? { type: "Feature", properties: {}, geometry: mapBoundary } : { type: "FeatureCollection", features: [] });
    (map.getSource("estate-plots") as any)?.setData(mapPlotGeojson);
    (map.getSource("estate-layers") as any)?.setData(layersVisible ? layerGeojson : { type: "FeatureCollection", features: [] });
    (map.getSource("estate-layer-labels") as any)?.setData({ type: "FeatureCollection", features: layersVisible ? buildLayerLabelFeatures(layerGeojson.features || []) : [] } as any);
    (map.getSource("estate-block-labels") as any)?.setData({ type: "FeatureCollection", features: buildBlockLabelFeatures(mapPlotGeojson.features, blocks) } as any);
    (map.getSource("estate-plot-labels") as any)?.setData({ type: "FeatureCollection", features: buildPlotLabelFeatures(mapPlotGeojson.features, allocations) } as any);
    void loadMapboxGl().then((mapboxgl) => {
      if (cancelled || mapRef.current !== map) return;
      const bounds = new mapboxgl.LngLatBounds();
      if (mapBoundary) extendMapBounds(bounds, mapBoundary);
      mapPlotGeojson.features.forEach((feature: any) => extendMapBounds(bounds, feature.geometry));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 46, maxZoom: 17 });
    });
    return () => { cancelled = true; };
  }, [mapReady, styleGeneration, mapBoundary, mapPlotGeojson, layerGeojson, allocations, blocks, layersVisible]);
  const selectAllocation = async (id: string) => {
    setAllocationId(id); setFinancial(null);
    if (!id) return;
    const allocation = allocations.find((item) => String(item.id) === id); if (allocation) setSelectedPlotId(allocation.plot_id);
    try { setFinancial((await api.get(`/estates/allocations/${id}/financial-detail`)).data); }
    catch (error) { setMessage(await extractApiErrorMessage(error, "Allocation financial detail could not be loaded."), "danger"); }
  };
  useEffect(() => {
    mapInteractionRef.current = { allocations, selectAllocation: (id: string) => void selectAllocation(id) };
  });
  useEffect(() => {
    const plotParam = searchParams.get("plot");
    const id = Number(plotParam);
    if (!plotParam || !Number.isFinite(id)) return;
    setSelectedPlotId(id);
    setDrawerTab("overview");
    const allocation = allocations.find((item) => item.plot_id === id);
    if (allocation) void selectAllocation(String(allocation.id));
  }, [searchParams, allocations]);
  const refreshWorkflow = async () => {
    if (!estateId) return;
    const [surveys, staking] = await Promise.all([
      api.get("/estates/survey-requests", { params: { estate_id: estateId } }),
      api.get("/estates/staking-tasks", { params: { estate_id: estateId } }),
    ]);
    setSurveyRequests(surveys.data || []);
    setStakingTasks(staking.data || []);
  };
  const refreshEstateLayoutData = async () => {
    if (!estateId) return;
    const [selectors, plotsMap, layersMap, blockRows, events, metrics, proposals, surveys, staking] = await Promise.all([
      api.get("/estates/selectors", { params: { estate_id: estateId } }),
      api.get(`/estates/${estateId}/plots.geojson`),
      api.get(`/estates/${estateId}/layers.geojson`),
      api.get(`/estates/${estateId}/blocks`),
      api.get(`/estates/${estateId}/activity`),
      api.get(`/estates/${estateId}/dashboard`),
      api.get(`/estates/${estateId}/layout-proposals`),
      api.get("/estates/survey-requests", { params: { estate_id: estateId } }),
      api.get("/estates/staking-tasks", { params: { estate_id: estateId } }),
    ]);
    setAllocations(selectors.data.allocations || []);
    setPlots(selectors.data.plots || []);
    setCustomers(selectors.data.customers || []);
    setPlotGeojson(plotsMap.data);
    setLayerGeojson(layersMap.data);
    setBlocks(blockRows.data || []);
    setActivity(events.data || []);
    setDashboard(metrics.data);
    setLayoutProposal((proposals.data || [])[0] || null);
    setSurveyRequests(surveys.data || []);
    setStakingTasks(staking.data || []);
    void api.get("/estates/payments", { params: { estate_id: estateId, page_size: 100 } }).then((response) => setEstatePayments(response.data?.items || [])).catch(() => setEstatePayments([]));
    void api.get("/estates/documents", { params: { page_size: 100 } }).then((response) => setEstateDocuments(response.data?.items || [])).catch(() => setEstateDocuments([]));
  };
  const runWorkflow = async (label: string, action: () => Promise<any>) => {
    if (workflowBusy) return;
    setWorkflowBusy(label);
    try {
      const result = await action();
      await refreshWorkflow();
      const notified = Boolean(result?.data?.customer_notified);
      toast.success(`${label} completed.${notified ? " A confirmation email has been sent to the customer." : ""}`);
    }
    catch (error) { toast.error(await extractApiErrorMessage(error, `${label} could not be completed.`)); }
    finally { setWorkflowBusy(""); }
  };
  const getCurrentSurveyStationNames = (plotId: number) => {
    const feature = plotGeojson.features.find((item: any) => Number(item.properties?.id) === plotId);
    const geometry = feature?.geometry;
    const ring = geometry?.type === "Polygon" ? geometry.coordinates?.[0] || [] : [];
    const openRing = ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]
      ? ring.slice(0, -1)
      : ring;
    return Array.from({ length: Math.max(openRing.length, 3) }, (_, index) => surveyStationName(index));
  };
  const openSurveyStationSelection = (plotId: number) => {
    const allocation = allocations.find((item) => item.plot_id === plotId);
    if (!allocation) {
      toast.error("Allocate this plot to a customer before creating its Official Survey Plan.");
      setPlotContextMenu(null);
      return;
    }
    const survey = surveyRequests.find((item) => item.plot.id === plotId);
    const fallbackNames = getCurrentSurveyStationNames(plotId);
    setPlotContextMenu(null);
    setSurveyStationMode("current");
    setCustomSurveyStationNames(fallbackNames);
    setSurveyStationSelection({
      plotId,
      currentNames: fallbackNames,
      loading: Boolean(survey?.survey_working_plot_id),
    });
    if (!survey?.survey_working_plot_id) return;
    claimEstateSurveyRequestSession(survey.id).then(() => api.get(`/plots/${survey.survey_working_plot_id}/workspace`)).then((response) => {
      const names = (response.data?.coordinates || [])
        .filter((point: any) => point?.is_boundary !== false)
        .map((point: any) => String(point?.station || "").trim())
        .filter(Boolean);
      if (names.length >= 3) {
        setSurveyStationSelection((current) => current?.plotId === plotId ? { ...current, currentNames: names, loading: false } : current);
        setCustomSurveyStationNames(names);
      } else {
        setSurveyStationSelection((current) => current?.plotId === plotId ? { ...current, loading: false } : current);
      }
    }).catch(() => {
      setSurveyStationSelection((current) => current?.plotId === plotId ? { ...current, loading: false } : current);
    });
  };
  const createOfficialSurveyPlan = async () => {
    const selection = surveyStationSelection;
    if (!selection) return;
    const stationNames = (surveyStationMode === "custom" ? customSurveyStationNames : selection.currentNames)
      .map((name) => name.trim());
    if (stationNames.length < 3 || stationNames.some((name) => !name)) {
      toast.error("Enter a name for every survey station.");
      return;
    }
    if (new Set(stationNames.map((name) => name.toLowerCase())).size !== stationNames.length) {
      toast.error("Each survey station must have a different name.");
      return;
    }
    const plotId = selection.plotId;
    const allocation = allocations.find((item) => item.plot_id === plotId);
    if (!allocation) { toast.error("Allocate this plot to a customer before creating its Official Survey Plan."); return; }
    setPreparingSurveyPlotId(plotId);
    try {
      let survey = surveyRequests.find((item) => item.plot.id === plotId);
      if (!survey) {
        survey = (await api.post(`/estates/plots/${plotId}/survey-requests`)).data;
        await refreshWorkflow();
      }
      if (!survey.materialized) {
        const started = await api.post(`/estates/survey-requests/${survey.id}/start`);
        survey = { ...survey, ...started.data };
      }
      await claimEstateSurveyRequestSession(survey.id);
      const params = new URLSearchParams({
        mode: "survey",
        fresh: "1",
        estate_survey_plot: String(survey.survey_working_plot_id || ""),
        return_estate_id: String(estateId),
        return_plot_id: String(plotId),
        station_names: JSON.stringify(stationNames),
      });
      setSurveyStationSelection(null);
      // Do not carry a different plot's saved preview into this Estate handoff.
      await clearSurveyPlanDraft();
      navigate(`/survey-plan?${params.toString()}`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Official Survey Plan could not be created."));
    } finally {
      setPreparingSurveyPlotId(null);
    }
  };
  const downloadDgps = async (taskId: number) => {
    try {
      const response = await api.get(`/estates/staking-tasks/${taskId}/exports/dgps.csv`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `staking-task-${taskId}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(await extractApiErrorMessage(error, "DGPS CSV could not be downloaded.")); }
  };
  const downloadPlotDgpsCsv = async (plotId: number, coordinateSystem: string) => {
    if (!estateId) return;
    setDgpsExportBusy(true);
    try {
      const response = await api.get(`/estates/${estateId}/plots/${plotId}/exports/dgps.csv`, { params: { coordinate_system: coordinateSystem }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `plot-${plotId}-dgps.csv`; link.click(); URL.revokeObjectURL(url);
      setDgpsExportPlotId(null);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "DGPS CSV could not be downloaded."), "danger");
    } finally {
      setDgpsExportBusy(false);
    }
  };
  const downloadEstateLayoutPdf = async (paperSize: string, includeCustomerNames: boolean) => {
    if (!estateId) return;
    setLayoutPdfExportBusy(true);
    try {
      const response = await api.get(`/estates/${estateId}/exports/layout.pdf`, { params: { paper_size: paperSize, include_customer_names: includeCustomerNames }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `${estateDetail?.name || "estate"}-layout-plan-${paperSize}.pdf`; link.click(); URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "The layout plan PDF could not be generated."), "danger");
    } finally {
      setLayoutPdfExportBusy(false);
    }
  };
  const downloadEstateLayoutDgpsCsv = async (coordinateSystem: string) => {
    if (!estateId) return;
    setLayoutDgpsExportBusy(true);
    try {
      const response = await api.get(`/estates/${estateId}/exports/layout-dgps.csv`, { params: { coordinate_system: coordinateSystem }, responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url; link.download = `${estateDetail?.name || "estate"}-layout-dgps.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(await extractApiErrorMessage(error, "The layout DGPS CSV could not be downloaded."), "danger");
    } finally {
      setLayoutDgpsExportBusy(false);
    }
  };
  const uploadStakingEvidence = async (taskId: number) => {
    if (!stakingEvidence) { toast.error("Choose a staking photo or field record first."); return; }
    const form = new FormData(); form.append("file", stakingEvidence);
    try {
      await api.post("/estates/documents", form, { params: { entity_type: "staking_task", entity_id: taskId, document_type: "staking_record", description: "DGPS staking field evidence" } });
      setStakingEvidence(null); toast.success("Staking evidence stored in the private Document Vault.");
    } catch (error) { toast.error(await extractApiErrorMessage(error, "Staking evidence could not be uploaded.")); }
  };
  const selectedAllocation = allocations.find((allocation) => String(allocation.id) === allocationId);
  const selectedPlot = plots.find((plot) => plot.id === (selectedPlotId || selectedAllocation?.plot_id));
  const selectedSurvey = selectedAllocation && surveyRequests.find((item) => item.plot.id === selectedAllocation.plot_id);
  const selectedTask = selectedSurvey && stakingTasks.find((item) => item.survey_request_id === selectedSurvey.id);

  const orderedPlotIds = mapPlotGeojson.features.map((feature: any) => Number(feature.properties?.id));
  const selectedPlotPosition = selectedPlot ? orderedPlotIds.indexOf(selectedPlot.id) : -1;
  const goToAdjacentPlot = (direction: 1 | -1) => {
    if (selectedPlotPosition < 0 || orderedPlotIds.length === 0) return;
    const nextIndex = (selectedPlotPosition + direction + orderedPlotIds.length) % orderedPlotIds.length;
    const nextId = orderedPlotIds[nextIndex];
    setSelectedPlotId(nextId);
    setDrawerTab("overview");
    const allocation = allocations.find((item) => item.plot_id === nextId);
    if (allocation) void selectAllocation(String(allocation.id));
    else { setAllocationId(""); setFinancial(null); }
  };
  const selectedBlock = selectedPlot ? blocks.find((block) => block.id === selectedPlot.block_id) : undefined;
  const [attention, setAttention] = useState<Record<string, { new_reservations: number; upcoming_inspections: number; delivery_timestamps: string[] }>>({});
  useEffect(() => {
    if (estateId || estates.length === 0) return;
    let cancelled = false;
    api.get("/estates/attention").then((response) => { if (!cancelled) setAttention(response.data?.estates || {}); }).catch(() => { if (!cancelled) setAttention({}); });
    return () => { cancelled = true; };
  }, [estateId, estates.length]);
  const estateAttention = (id: number) => {
    const row = attention[String(id)];
    if (!row) return { reservations: 0, messages: 0, inspections: 0, total: 0 };
    let seen: string | null = null;
    try { seen = window.localStorage.getItem(`edash_delivery_seen_${id}_${getEstateAuthSession()?.user.id || "user"}`); } catch { /* treat everything as unseen */ }
    const messages = seen ? row.delivery_timestamps.filter((stamp) => stamp > seen!).length : row.delivery_timestamps.length;
    return { reservations: row.new_reservations, messages, inspections: row.upcoming_inspections, total: row.new_reservations + messages + row.upcoming_inspections };
  };
  const buildPlotThumbUrl = (geometry: any): string | null => {
    if (!MAPBOX_TOKEN || !geometry) return null;
    const overlay = encodeURIComponent(JSON.stringify({
      type: "Feature",
      properties: { fill: "#1e8a4c", "fill-opacity": 0.35, stroke: "#1e8a4c", "stroke-width": 2 },
      geometry,
    }));
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${overlay})/auto/104x104@2x?padding=20&access_token=${MAPBOX_TOKEN}`;
  };
  const openTab = (tab: typeof drawerTab) => { setDrawerTab(tab); setEditingDevelopment(false); };
  const flyToSelectedPlot = () => {
    if (!mapRef.current || !selectedPlot) return;
    const feature = mapPlotGeojson.features.find((item: any) => Number(item.properties?.id) === selectedPlot.id);
    const ring = feature?.geometry?.type === "Polygon" ? feature.geometry.coordinates[0] : null;
    if (!ring || ring.length === 0) return;
    const lngs = ring.map((coord: number[]) => coord[0]);
    const lats = ring.map((coord: number[]) => coord[1]);
    mapRef.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 120, maxZoom: 19 }
    );
  };
  const updateDevelopmentStatus = async (status: string) => {
    if (!selectedPlot) return;
    try {
      const response = await api.patch(`/estates/plots/${selectedPlot.id}/development-status`, { status });
      setPlots((current) => current.map((plot) => (plot.id === selectedPlot.id ? { ...plot, development_status: status } : plot)));
      setEditingDevelopment(false);
      toast.success(`Development status updated.${response.data.customer_notified ? " A confirmation email has been sent to the customer." : ""}`);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Development status could not be saved."));
    }
  };
  const uploadPlotDocument = async () => {
    if (!selectedPlot || !plotDocumentFile) return;
    const form = new FormData();
    form.append("file", plotDocumentFile);
    setPlotDocumentBusy(true);
    try {
      await api.post("/estates/documents", form, { params: { entity_type: "plot", entity_id: selectedPlot.id, document_type: "plot_record", description: `Uploaded from the plot drawer for ${selectedPlot.plot_number}` } });
      setPlotDocumentFile(null);
      toast.success("Document stored in the private Document Vault.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Document could not be uploaded."));
    } finally {
      setPlotDocumentBusy(false);
    }
  };
  const riskTone = (riskClass: string | undefined) => {
    const value = (riskClass || "").toLowerCase();
    if (["low", "minimal", "none"].includes(value)) return "good";
    if (["moderate", "medium"].includes(value)) return "warn";
    if (["high", "severe", "critical"].includes(value)) return "danger";
    return "neutral";
  };
  // River (a direct GloFAS river-flood model hit), Floodplain (an elevation-relative-to-drainage
  // screening proxy, the fallback where there's no direct river model coverage) and Rainfall
  // (experimental - a same-city matched-pair test found it could not reliably tell a documented
  // flood zone from a well-drained one, AUC 0.361) are kept as three independent signals rather
  // than one blended "Flood Risk" - see hazards.py's _compute_flood_branches docstring for why a
  // combined score was found to destroy specificity. Each carries its own 0-100 risk SCORE (a
  // heuristic susceptibility indicator, not a calibrated probability of an actual flood).
  const percentOf = (value: unknown): number | null => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const floodSignalSummary = (assessments: any[]) => {
    const make = () => ({ assessed: 0, classes: {} as Record<string, number>, percents: [] as number[] });
    const river = make();
    const floodplain = make();
    const rainfall = make();
    for (const item of (assessments || []).some((entry: any) => !entry.plot_id) ? (assessments || []).filter((entry: any) => !entry.plot_id) : (assessments || [])) {
      const result = item.hazards?.flood?.result;
      const summary = result?.summary;
      if (!summary) continue;
      const riverAvailable = summary.river_available !== false;
      const riverClass = riverAvailable ? (summary.river_class || "unavailable") : "No Data";
      river.assessed += 1;
      river.classes[riverClass] = (river.classes[riverClass] || 0) + 1;
      if (riverAvailable) { const p = percentOf(result?.river?.risk_score); if (p !== null) river.percents.push(p); }

      const floodplainClass = summary.floodplain_class || "unavailable";
      floodplain.assessed += 1;
      floodplain.classes[floodplainClass] = (floodplain.classes[floodplainClass] || 0) + 1;
      const fp = percentOf(result?.floodplain?.risk_score);
      if (fp !== null) floodplain.percents.push(fp);

      if (result?.rainfall?.data_available !== false) {
        rainfall.assessed += 1;
        const rp = percentOf(result?.rainfall?.risk_score);
        if (rp !== null) rainfall.percents.push(rp);
      }
    }
    return { river, floodplain, rainfall };
  };
  const statusPillTone = (status: string | undefined) => {
    const value = (status || "").toLowerCase();
    if (["completed", "approved", "allocated", "active", "fully_paid", "confirmed"].includes(value)) return "good";
    if (["in_progress", "assigned", "requested", "reserved"].includes(value)) return "info";
    if (["attention_required", "review_required", "pending_confirmation", "site_cleared", "foundation"].includes(value)) return "warn";
    if (["failed", "cancelled", "rejected", "voided"].includes(value)) return "danger";
    return "neutral";
  };
  const activityTone = (action: string | undefined) => {
    const value = (action || "").toLowerCase();
    if (value.includes("payment") || value.includes("confirm")) return "good";
    if (value.includes("created") || value.includes("survey") || value.includes("staking")) return "info";
    return "neutral";
  };
  const activityIcon = (action: string | undefined): import("../components/estates/EstateIcon").EstateIconName => {
    const value = (action || "").toLowerCase();
    if (value.includes("payment")) return "payments";
    if (value.includes("survey")) return "survey";
    if (value.includes("staking")) return "staking";
    if (value.includes("allocat")) return "customers";
    if (value.includes("document")) return "documents";
    if (value.includes("plot")) return "plots";
    return "activity";
  };
  const donutOrder: Array<{ key: string; label: string; value: number; color: string }> = dashboard
    ? [
        { key: "reserved", label: "Reserved", value: dashboard.statuses?.reserved || 0, color: STATUS_COLORS.reserved },
        { key: "available", label: "Available", value: dashboard.statuses?.available || 0, color: STATUS_COLORS.available },
        { key: "allocated", label: "Allocated", value: dashboard.statuses?.allocated || 0, color: STATUS_COLORS.allocated },
        { key: "under_survey", label: "Under Survey", value: dashboard.awaiting_survey || 0, color: STATUS_COLORS.under_survey },
        { key: "under_staking", label: "Under Staking", value: dashboard.awaiting_staking || 0, color: STATUS_COLORS.under_staking },
        { key: "developed", label: "Developed", value: dashboard.development?.developed || 0, color: STATUS_COLORS.developed },
      ]
    : [];
  const donutTotal = donutOrder.reduce((sum, item) => sum + item.value, 0) || 1;
  let donutCursor = 0;
  const donutArcs = donutOrder.map((item) => {
    const fraction = item.value / donutTotal;
    const arc = { ...item, offset: donutCursor, fraction };
    donutCursor += fraction;
    return arc;
  });
  const donutCircumference = 2 * Math.PI * 15.9155;
  const allocatedFraction = dashboard ? (dashboard.statuses?.allocated || 0) / (dashboard.total_plots || 1) : 0;

  function renderStatsRow() {
    if (!dashboard) return null;
    const total = dashboard.total_plots || 0;
    const pct = (value: number) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%");
    const cards: Array<{ label: string; value: number; sub: string; icon: import("../components/estates/EstateIcon").EstateIconName; tone: string }> = [
      { label: "Total Plots", value: total, sub: `${formatArea(Number(dashboard.mapped_area_sqm || 0), unitSystem)} mapped`, icon: "grid", tone: "neutral" },
      { label: "Allocated", value: dashboard.statuses?.allocated || 0, sub: pct(dashboard.statuses?.allocated || 0), icon: "person", tone: "allocated" },
      { label: "Available", value: dashboard.statuses?.available || 0, sub: pct(dashboard.statuses?.available || 0), icon: "house", tone: "available" },
      { label: "Reserved", value: dashboard.statuses?.reserved || 0, sub: pct(dashboard.statuses?.reserved || 0), icon: "clock", tone: "reserved" },
      { label: "Under Survey", value: dashboard.awaiting_survey || 0, sub: pct(dashboard.awaiting_survey || 0), icon: "compass", tone: "survey" },
      { label: "Under Staking", value: dashboard.awaiting_staking || 0, sub: pct(dashboard.awaiting_staking || 0), icon: "pin", tone: "staking" },
    ];
    return (
      <>
        <div className="edash-stats-row">
          {cards.map((card) => (
            <div key={card.label} className="edash-stat-card">
              <span className={`edash-stat-icon tone-${card.tone}`}><EstateIcon name={card.icon} /></span>
              <div className="edash-stat-body">
                <p className="edash-stat-label">{card.label}</p>
                <p className="edash-stat-value">{card.value.toLocaleString()}</p>
                <span className={`edash-stat-sub${card.label === "Total Plots" ? "" : " positive"}`}>{card.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderMapPanel() {
    return (
      <div className="edash-card edash-map-card">
        <div className="edash-map-toolbar">
          <div className="edash-map-mode-tabs">
            <button type="button" className={`edash-map-mode-tab${mapStyleMode === "map" ? " active" : ""}`} onClick={() => { setMapStyleMode("map"); mapRef.current?.setStyle("mapbox://styles/mapbox/light-v11", { diff: false }); }}>Map</button>
            <button type="button" className={`edash-map-mode-tab${mapStyleMode === "satellite" ? " active" : ""}`} onClick={() => { setMapStyleMode("satellite"); mapRef.current?.setStyle("mapbox://styles/mapbox/satellite-streets-v12", { diff: false }); }}>Satellite</button>
          </div>
          <label className="edash-map-search">
            <EstateIcon name="search" />
            <input value={plotSearch} onChange={(event) => setPlotSearch(event.target.value)} placeholder="Search plot number..." />
          </label>
          <select className="edash-map-select" value={blockFilterId} onChange={(event) => setBlockFilterId(event.target.value)}>
            <option value="all">All Blocks</option>
            {blocks.map((block) => <option key={block.id} value={String(block.id)}>{`Block ${block.label}`}</option>)}
          </select>
          <select className="edash-map-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="allocated">Allocated</option>
            <option value="on_hold">On hold</option>
          </select>
          <div className="edash-map-toolbar-spacer" />
          <button type="button" className="edash-icon-btn" title="Reset filters" onClick={() => { setStatusFilter("all"); setBlockFilterId("all"); setPlotSearch(""); }}>
            <EstateIcon name="filter" />
          </button>
        </div>
        <div className="edash-map-canvas-wrap">
          {MAPBOX_TOKEN ? (
            <>
              {!mapReady && <EstatePlotMapFallback features={mapPlotGeojson.features} boundary={mapBoundary} message="Loading the interactive map..." onSelect={(plotId) => {
                setSelectedPlotId(plotId);
                setDrawerTab("overview");
                const allocation = allocations.find((item) => item.plot_id === plotId);
                if (allocation) void selectAllocation(String(allocation.id));
                else { setAllocationId(""); setFinancial(null); }
              }} />}
              <div ref={mapContainer} className="edash-map-canvas" />
              {mapError && <div className="edash-map-fallback-note" role="status">{mapError}</div>}
            </>
          ) : (
            <EstatePlotMapFallback
              features={mapPlotGeojson.features}
              boundary={mapBoundary}
              message={mapError || undefined}
              onSelect={(plotId) => {
                setSelectedPlotId(plotId);
                setDrawerTab("overview");
                const allocation = allocations.find((item) => item.plot_id === plotId);
                if (allocation) void selectAllocation(String(allocation.id));
                else { setAllocationId(""); setFinancial(null); }
              }}
            />
          )}
          <div className="edash-map-controls">
            <div className="edash-map-controls-group">
              <button type="button" className="edash-map-ctrl-btn" title="Zoom in" onClick={() => mapRef.current?.zoomIn()}><EstateIcon name="zoom-in" /></button>
              <button type="button" className="edash-map-ctrl-btn" title="Zoom out" onClick={() => mapRef.current?.zoomOut()}><EstateIcon name="zoom-out" /></button>
            </div>
            <button type="button" className="edash-map-controls-group edash-map-ctrl-btn" title="Fit to estate" onClick={() => {
              if (!mapRef.current) return;
              const bounds = mapPlotGeojson.features.reduce((acc: number[][] | null, feature: any) => {
                const ring = feature.geometry?.type === "Polygon" ? feature.geometry.coordinates[0] : [];
                return ring.reduce((box: number[][] | null, coord: number[]) => {
                  if (!box) return [[coord[0], coord[1]], [coord[0], coord[1]]];
                  box[0][0] = Math.min(box[0][0], coord[0]); box[0][1] = Math.min(box[0][1], coord[1]);
                  box[1][0] = Math.max(box[1][0], coord[0]); box[1][1] = Math.max(box[1][1], coord[1]);
                  return box;
                }, acc);
              }, null);
              if (bounds) mapRef.current.fitBounds(bounds, { padding: 46, maxZoom: 17 });
            }}>
              <EstateIcon name="locate" />
            </button>
            <button type="button" className={`edash-map-controls-group edash-map-ctrl-btn${layersVisible ? " active" : ""}`} title="Toggle roads & open space" onClick={() => setLayersVisible((value) => !value)}>
              <EstateIcon name="layers" />
            </button>
            <button
              type="button"
              className="edash-map-controls-group edash-map-ctrl-btn"
              title="Fullscreen"
              onClick={() => {
                const target = mapGridRef.current || mapContainer.current?.parentElement;
                if (!target) return;
                if (document.fullscreenElement === target) void document.exitFullscreen?.();
                else void target.requestFullscreen?.();
              }}
            >
              <EstateIcon name="expand" />
            </button>
          </div>
          <div className="edash-map-legend">
            {[
              { label: "Available", color: STATUS_COLORS.available },
              { label: "Allocated", color: STATUS_COLORS.allocated },
              { label: "Reserved", color: STATUS_COLORS.reserved },
              { label: "Under Survey", color: STATUS_COLORS.under_survey },
              { label: "Under Staking", color: STATUS_COLORS.under_staking },
              { label: "Developed", color: STATUS_COLORS.developed },
            ].map((item) => (
              <span key={item.label} className="edash-map-legend-item">
                <span className="edash-map-legend-dot" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="edash-map-scale">
            <div className="edash-map-scale-bar"><span style={{ width: 60 }} /></div>
            <span className="edash-map-scale-label">0&nbsp;&nbsp;50&nbsp;&nbsp;100 m</span>
          </div>
        </div>
      </div>
    );
  }

  function renderPlotContextMenu() {
    if (!plotContextMenu) return null;
    const plot = plots.find((item) => item.id === plotContextMenu.plotId);
    const allocation = allocations.find((item) => item.plot_id === plotContextMenu.plotId);
    const survey = surveyRequests.find((item) => item.plot.id === plotContextMenu.plotId);
    const preparingSurvey = preparingSurveyPlotId === plotContextMenu.plotId;
    return (
      <>
        <div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setPlotContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setPlotContextMenu(null); }} />
        <div className="edash-context-menu" style={{ position: "fixed", left: plotContextMenu.x, top: plotContextMenu.y, zIndex: 30, width: 220 }}>
          <div className="edash-context-menu-head">
            <strong>{plot?.plot_number || "Plot"}</strong>
            <button type="button" onClick={() => setPlotContextMenu(null)} aria-label="Close">&times;</button>
          </div>
          <button
            type="button"
            className="edash-context-menu-option"
            disabled={!allocation || preparingSurvey}
            title={allocation ? undefined : "Allocate this plot to a customer first"}
            onClick={() => openSurveyStationSelection(plotContextMenu.plotId)}
          >
            {preparingSurvey ? <><Spinner size={13} /> Preparing...</> : <><EstateIcon name="survey" /> {survey?.materialized ? "Open Official Survey Plan" : "Create Official Survey Plan"}</>}
          </button>
          <button
            type="button"
            className="edash-context-menu-option"
            onClick={() => { setDgpsExportPlotId(plotContextMenu.plotId); setPlotContextMenu(null); }}
          >
            <EstateIcon name="download" /> Export DGPS CSV
          </button>
          <button
            type="button"
            className="edash-context-menu-option"
            onClick={() => {
              setSelectedPlotId(plotContextMenu.plotId);
              setDrawerTab("customer");
              if (allocation) void selectAllocation(String(allocation.id));
              else { setAllocationId(""); setFinancial(null); }
              setPlotContextMenu(null);
            }}
          >
            <EstateIcon name="customers" /> {allocation ? "View customer" : "Reserve / allocate"}
          </button>
          <button
            type="button"
            className="edash-context-menu-option"
            onClick={() => {
              setSelectedPlotId(plotContextMenu.plotId);
              setDrawerTab("overview");
              if (allocation) void selectAllocation(String(allocation.id));
              else { setAllocationId(""); setFinancial(null); }
              setPlotContextMenu(null);
            }}
          >
            <EstateIcon name="map" /> View details
          </button>
        </div>
      </>
    );
  }

  function renderPlotDrawer() {
    const statusValue = selectedPlot?.commercial_status;
    const developmentValue = selectedPlot?.development_status || "not_started";
    const developmentLabels: Record<string, string> = { not_started: "Not started", site_cleared: "Site cleared", foundation: "Foundation", under_construction: "Under construction", developed: "Developed" };
    const surveyLabel = selectedSurvey ? String(selectedSurvey.status).replaceAll("_", " ") : "Not started";
    const stakingLabel = selectedTask ? String(selectedTask.status).replaceAll("_", " ") : "Not started";
    // River (a direct GloFAS river-flood model hit), Floodplain (an elevation-relative-to-drainage
    // screening proxy, the fallback where there's no direct river model coverage) and Rainfall
    // (experimental) are kept as three independent signals rather than one blended "Flood Risk" -
    // a combined score was found to actively destroy specificity (see hazards.py's
    // _compute_flood_branches docstring). Each shows its own 0-100 risk score.
    const plotHazardEntry = hazardDashboard?.assessments?.find((item: any) => item.plot_id === selectedPlot?.id);
    const floodResultLive = hazards?.flood;
    const floodResultStored = plotHazardEntry?.hazards?.flood?.result;
    const floodSummary = floodResultLive?.summary || floodResultStored?.summary;
    const floodRiverSection = floodResultLive?.river || floodResultStored?.river;
    const floodFloodplainSection = floodResultLive?.floodplain || floodResultStored?.floodplain;
    const floodRainfallSection = floodResultLive?.rainfall || floodResultStored?.rainfall;
    const riverAvailable = floodSummary ? floodSummary.river_available !== false : false;
    const hazardRiver = floodSummary ? (riverAvailable ? floodSummary.river_class : "No Data") : undefined;
    const hazardRiverPct = riverAvailable ? percentOf(floodRiverSection?.risk_score) : null;
    const hazardFloodplain = floodSummary?.floodplain_class || plotHazardEntry?.hazards?.flood?.risk_class;
    const hazardFloodplainPct = percentOf(floodFloodplainSection?.risk_score);
    const rainfallAvailable = floodRainfallSection ? floodRainfallSection.data_available !== false : false;
    const hazardRainfallPct = rainfallAvailable ? percentOf(floodRainfallSection?.risk_score) : null;
    const hazardErosion = hazards?.erosion?.risk_class || plotHazardEntry?.hazards?.erosion?.risk_class;
    const hazardOverall = [hazardRiver, hazardFloodplain, hazardErosion].filter((value) => value && value !== "No Data");
    const hazardOverallLabel = hazardOverall.length ? (hazardOverall.every((value) => riskTone(value) === "good") ? "Low Risk" : hazardOverall.some((value) => riskTone(value) === "danger") ? "High Risk" : "Moderate Risk") : "Not screened";

    return (
      <div className="edash-card edash-drawer">
        {!selectedPlot ? (
          <div className="edash-drawer-empty">
            <EstateIcon name="plots" />
            <strong>No plot selected</strong>
            <span>Click a parcel on the map to open its full record here.</span>
          </div>
        ) : (
          <>
            <div className="edash-drawer-head">
              <div className="edash-drawer-title-row">
                <span className="edash-drawer-plot-no">Plot {selectedPlot.plot_number}</span>
                <span className={`edash-status-pill tone-${statusPillTone(statusValue)}`}>{String(statusValue || "").replaceAll("_", " ")}</span>
                <div className="edash-drawer-nav">
                  <button type="button" className="edash-drawer-nav-btn" onClick={() => goToAdjacentPlot(-1)} disabled={orderedPlotIds.length < 2} aria-label="Previous plot"><EstateIcon name="chevron-left" /></button>
                  <button type="button" className="edash-drawer-nav-btn" onClick={() => goToAdjacentPlot(1)} disabled={orderedPlotIds.length < 2} aria-label="Next plot"><EstateIcon name="chevron-right" /></button>
                  <button type="button" className="edash-drawer-nav-btn" onClick={() => { setSelectedPlotId(null); setAllocationId(""); setFinancial(null); }} aria-label="Close"><EstateIcon name="close" /></button>
                </div>
              </div>
              <p className="edash-drawer-sub">{selectedBlock ? `Block ${selectedBlock.label}` : "Unassigned block"} &middot; {formatArea(Number(selectedPlot.area_sqm || 0), unitSystem)}</p>
              <button type="button" className="edash-btn-outline edash-drawer-view-map" onClick={flyToSelectedPlot}>
                <EstateIcon name="map" /> View on Map
              </button>
              <div className="edash-drawer-tabs">
                {([
                  ["overview", "Overview"], ["customer", "Customer"], ["survey", "Survey"], ["staking", "Staking"],
                  ["documents", "Documents"], ["hazards", "Hazards"], ["timeline", "Timeline"],
                ] as Array<[typeof drawerTab, string]>).map(([key, label]) => (
                  <button key={key} type="button" className={`edash-drawer-tab${drawerTab === key ? " active" : ""}`} onClick={() => openTab(key)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="edash-drawer-body">
              {drawerTab === "overview" && (
                <div className="edash-tab-panel">
                  <div className="edash-overview-grid">
                    <div className="edash-overview-field"><span>Status</span><strong style={{ textTransform: "capitalize" }}>{String(statusValue || "").replaceAll("_", " ")}</strong></div>
                    <div className="edash-overview-field"><span>Block</span><strong>{selectedBlock?.label || "--"}</strong></div>
                    <div className="edash-overview-field"><span>Plot No.</span><strong>{selectedPlot.plot_number}</strong></div>
                    <div className="edash-overview-field"><span>Area</span><strong>{formatArea(Number(selectedPlot.area_sqm || 0), unitSystem)}</strong></div>
                    {(() => {
                      const feature = plotGeojson.features.find((item: any) => Number(item.properties?.id) === selectedPlot.id);
                      const thumbUrl = buildPlotThumbUrl(feature?.geometry);
                      return thumbUrl ? (
                        <img className="edash-overview-thumb" src={thumbUrl} alt={`Plot ${selectedPlot.plot_number} on the map`} />
                      ) : (
                        <div className="edash-overview-thumb" aria-hidden="true" />
                      );
                    })()}
                  </div>

                  {selectedPlot.commercial_status === "available" && (
                    <details className="edash-info-card" style={{ display: "block" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "0.82rem" }}>Split this plot</summary>
                      <p className="edash-status-row-desc" style={{ margin: "8px 0" }}>Create smaller plots from this available plot. The new plots appear on the map and can be reserved or allocated.</p>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="number" min="2" max="100" value={subdivisionCount} onChange={(event) => setSubdivisionCount(event.target.value)} style={{ width: 80, padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
                        <button type="button" className="edash-btn-primary" disabled={subdivisionBusy} onClick={() => void subdividePlot()}>{subdivisionBusy ? <><Spinner size={13} /> Creating plots...</> : "Create plots"}</button>
                      </div>
                    </details>
                  )}

                  <div className="edash-info-card" style={{ flexDirection: "column" }}>
                    <div className="edash-info-card-head"><span className="edash-status-row-title">Site notes</span></div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0" }}>
                      <select className="edash-map-select" style={{ minWidth: 0 }} value={inspectionOutcome} onChange={(event) => setInspectionOutcome(event.target.value)}>
                        <option value="observed">Observed</option>
                        <option value="passed">Passed</option>
                        <option value="attention_required">Attention required</option>
                        <option value="failed">Failed</option>
                      </select>
                      <input value={inspectionNotes} onChange={(event) => setInspectionNotes(event.target.value)} placeholder="Optional site note" style={{ flex: "1 1 140px", minWidth: 0, padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
                      <button type="button" className="edash-btn-outline" onClick={() => void recordInspection()}>Save</button>
                    </div>
                    {inspections.slice(0, 4).map((inspection) => (
                      <p key={inspection.id} className="edash-status-row-desc" style={{ margin: "2px 0" }}>
                        <strong style={{ color: "var(--edash-ink)", textTransform: "capitalize" }}>{inspection.outcome.replaceAll("_", " ")}</strong> &middot; {inspection.notes || "No note"}
                      </p>
                    ))}
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="customers" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head"><span className="edash-info-card-title">Customer</span></div>
                      {selectedAllocation ? (
                        <>
                          <p className="edash-info-card-name">{selectedAllocation.customer_name}</p>
                          <p className="edash-info-card-meta">{financial?.customer?.email || financial?.customer?.phone || selectedAllocation.status}</p>
                        </>
                      ) : (
                        <p className="edash-info-card-meta">No active customer allocation.</p>
                      )}
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("customer")}>View Customer</button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="wallet" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head"><span className="edash-info-card-title">Payment Summary</span></div>
                      {financial ? (
                        <>
                          <p className="edash-payment-total">{money(financial.financial.agreed_price)}</p>
                          <div className="edash-payment-split">
                            <span className="confirmed">{money(financial.financial.confirmed_paid)}<small>Confirmed</small></span>
                            <span className="outstanding">{money(financial.financial.outstanding)}<small>Outstanding</small></span>
                          </div>
                        </>
                      ) : (
                        <p className="edash-info-card-meta">No payment record for this plot yet.</p>
                      )}
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("customer")}>View Payments</button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="survey" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Survey</span>
                        <span className={`edash-status-pill tone-${statusPillTone(selectedSurvey?.status)}`}>{surveyLabel}</span>
                      </div>
                      <p className="edash-status-row-desc">{selectedSurvey ? `Survey reference ${selectedSurvey.survey_reference || "pending"}.` : "Prepare a Survey package once this plot is allocated."}</p>
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("survey")}>View Survey</button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="staking" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Staking</span>
                        <span className={`edash-status-pill tone-${statusPillTone(selectedTask?.status)}`}>{stakingLabel}</span>
                      </div>
                      <p className="edash-status-row-desc">{selectedTask ? "DGPS staking task created for this plot." : "Generate DGPS and create a staking task."}</p>
                    </div>
                    <button
                      type="button"
                      className="edash-btn-primary edash-info-card-action"
                      disabled={!selectedSurvey?.materialized || Boolean(selectedTask)}
                      onClick={() => {
                        if (selectedTask) { openTab("staking"); return; }
                        void runWorkflow("Staking preparation", () => api.post(`/estates/survey-requests/${selectedSurvey!.id}/staking-tasks`)).then(() => openTab("staking"));
                      }}
                    >
                      {selectedTask ? "View Staking" : "Start Staking"}
                    </button>
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="development" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Development</span>
                        <span className={`edash-status-pill tone-${statusPillTone(developmentValue)}`}>{developmentLabels[developmentValue] || developmentValue}</span>
                      </div>
                      <p className="edash-status-row-desc">{developmentValue === "not_started" ? "No development record yet" : `Latest status: ${developmentLabels[developmentValue]}`}</p>
                    </div>
                    {editingDevelopment ? (
                      <select className="edash-map-select" autoFocus defaultValue={developmentValue} onChange={(event) => void updateDevelopmentStatus(event.target.value)} onBlur={() => setEditingDevelopment(false)}>
                        {Object.entries(developmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    ) : (
                      <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => setEditingDevelopment(true)}>{developmentValue === "not_started" ? "Add Record" : "Update"}</button>
                    )}
                  </div>

                  <div className="edash-info-card">
                    <span className="edash-info-card-icon"><EstateIcon name="hazard" /></span>
                    <div className="edash-info-card-body">
                      <div className="edash-info-card-head">
                        <span className="edash-status-row-title">Hazard Analysis</span>
                        <span className={`edash-status-pill tone-${hazardOverall.length ? riskTone(hazardOverall.find((value) => riskTone(value) !== "good") || hazardOverall[0]) : "neutral"}`}>{hazardOverallLabel}</span>
                      </div>
                      <p className="edash-status-row-desc">{hazardOverall.length ? "Flood, erosion and vulnerability analysis completed" : "Run flood and erosion screening for this plot."}</p>
                    </div>
                    <button type="button" className="edash-btn-outline edash-info-card-action" onClick={() => openTab("hazards")}>View Analysis</button>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    {selectedPlot.commercial_status === "available" && (
                      <button type="button" className="edash-btn-outline" onClick={() => openEditPlotBoundary()}>
                        Edit boundary
                      </button>
                    )}
                    <button type="button" className="edash-btn-outline" style={{ color: "var(--edash-danger)", borderColor: "var(--edash-danger-tint)" }} onClick={() => setShowDeletePlotConfirm(true)}>
                      Delete plot
                    </button>
                  </div>
                </div>
              )}

              {drawerTab === "customer" && (
                <div className="edash-tab-panel">
                  {selectedAllocation ? (
                    <>
                      <div className="edash-info-card">
                        <span className="edash-info-card-icon"><EstateIcon name="customers" /></span>
                        <div className="edash-info-card-body">
                          <p className="edash-info-card-name">{selectedAllocation.customer_name}</p>
                          <p className="edash-info-card-meta">Allocation status: {selectedAllocation.status.replaceAll("_", " ")}</p>
                          {selectedAllocation.attribution && <p className="edash-info-card-meta">Source: {selectedAllocation.attribution.type === "agent" ? `Agent ${selectedAllocation.attribution.agent_name || "assigned"}` : selectedAllocation.attribution.type === "company_qr" ? `Company QR${selectedAllocation.attribution.campaign_name ? ` (${selectedAllocation.attribution.campaign_name})` : ""}` : selectedAllocation.attribution.label}</p>}
                        </div>
                      </div>
                      {financial && (
                        <>
                          <div className="edash-overview-grid edash-overview-grid--3">
                            <div className="edash-overview-field"><span>Agreed</span><strong>{money(financial.financial.agreed_price)}</strong></div>
                            <div className="edash-overview-field"><span>Confirmed</span><strong>{money(financial.financial.confirmed_paid)}</strong></div>
                            <div className="edash-overview-field"><span>Outstanding</span><strong>{money(financial.financial.outstanding)}</strong></div>
                          </div>
                          <p className="edash-status-row-title" style={{ margin: "6px 0" }}>Payment history</p>
                          {financial.payments?.length ? (
                            <table className="edash-mini-table">
                              <thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
                              <tbody>
                                {financial.payments.slice(0, 8).map((payment: any) => (
                                  <tr key={payment.id}><td data-label="Date">{payment.date}</td><td data-label="Amount">{money(payment.amount)}</td><td data-label="Status" style={{ textTransform: "capitalize" }}>{payment.status.replaceAll("_", " ")}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          ) : <p className="edash-tab-empty">No payments recorded yet.</p>}
                          <Link className="edash-btn-outline" style={{ display: "inline-flex", marginTop: 8 }} to="/estates/payments">Open full payment workspace</Link>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="edash-tab-panel">
                      <p className="edash-tab-empty" style={{ padding: "10px 0" }}>This plot has no customer yet. Add one or choose an existing customer to reserve or allocate it.</p>
                      <button type="button" className="edash-tool-btn" style={{ marginBottom: 10 }} onClick={() => setShowAddCustomer(true)}>
                        <EstateIcon name="plus" /> Add customer
                      </button>
                      <select className="edash-map-select" style={{ marginBottom: 10, width: "100%" }} value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                        <option value="">Choose customer</option>
                        {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                      <input type="number" min="0" step="0.01" value={agreedPrice} onChange={(event) => setAgreedPrice(event.target.value)} placeholder="Agreed price (NGN)" style={{ padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)", width: "100%", marginBottom: 8 }} />
                      <label className="edash-overview-field edash-initial-payment-field" style={{ marginBottom: 8 }}>
                        <span>First payment received now (NGN) <strong>*</strong></span>
                        <input type="number" min="0.01" step="0.01" required value={amountPaidNow} onChange={(event) => setAmountPaidNow(event.target.value)} placeholder="Enter amount received today" aria-label="First payment received now in Naira" />
                        <small>This payment is required before the plot becomes Reserved. It is recorded today.</small>
                      </label>
                      <label className="edash-overview-field" style={{ marginBottom: 8 }}>
                        <span>Payment schedule (optional)</span>
                        <select className="edash-map-select" value={paymentScheduleEnabled ? "scheduled" : "none"} onChange={(event) => setPaymentScheduleEnabled(event.target.value === "scheduled")}>
                          <option value="none">No scheduled instalments</option>
                          <option value="scheduled">Schedule instalment reminders</option>
                        </select>
                      </label>
                      {paymentScheduleEnabled && (
                        <div className="edash-payment-schedule-fields">
                          <label>
                            <span>Next instalment amount (NGN)</span>
                            <input type="number" min="0.01" step="0.01" value={installmentAmount} onChange={(event) => setInstallmentAmount(event.target.value)} placeholder="Amount due each time" aria-label="Next instalment amount in Naira" />
                          </label>
                          <label>
                            <span>Repeat every (months)</span>
                            <div className="edash-payment-interval-input"><input type="number" min="1" max="60" step="1" value={installmentIntervalMonths} onChange={(event) => setInstallmentIntervalMonths(event.target.value)} aria-label="Repeat every number of months" /><span>months</span></div>
                            <small>For example, 3 means once every 3 months, not every month.</small>
                          </label>
                          <label>
                            <span>Next payment due</span>
                            <input type="date" min={tomorrowDateInputValue()} value={nextPaymentDueDate} onChange={(event) => setNextPaymentDueDate(event.target.value)} aria-label="Next payment due date" />
                          </label>
                          <p>
                            The first payment is the amount recorded above today. The buyer will receive one email up to 7 days before each next due date. A 3-month interval means the next payment date, then the same date 3 months later, then 3 months after that.
                          </p>
                          {schedulePreview(nextPaymentDueDate, installmentIntervalMonths) && (
                            <p className="edash-payment-schedule-preview">Example schedule: {schedulePreview(nextPaymentDueDate, installmentIntervalMonths)?.join(" → ")}</p>
                          )}
                        </div>
                      )}
                      {salesAgents.length > 0 && (
                        <select className="edash-map-select" style={{ width: "100%", marginBottom: 8 }} value={salesAgentSubject} onChange={(event) => setSalesAgentSubject(event.target.value)}>
                          <option value="">No sales agent (skip commission tracking)</option>
                          {salesAgents.map((agent) => <option key={`${agent.subject_type}::${agent.subject_id}`} value={`${agent.subject_type}::${agent.subject_id}`}>{agent.display_name} ({agent.role})</option>)}
                        </select>
                      )}
                      {Boolean(amountPaidNow) && (
                        <>
                          <select className="edash-map-select" style={{ width: "100%", marginBottom: 8 }} value={amountPaidNowMethod} onChange={(event) => setAmountPaidNowMethod(event.target.value)}>
                            {PAYMENT_METHODS.filter((item) => item.value !== "other").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                          <label className="edash-overview-field" style={{ marginBottom: 8 }}>
                            <span>Receipt (optional)</span>
                            <input type="file" accept="image/*,.pdf" onChange={(event) => setAmountPaidReceipt(event.target.files?.[0] || null)} />
                          </label>
                        </>
                      )}
                      {Boolean(agreedPrice) && (
                        <div className="edash-overview-grid edash-overview-grid--3" style={{ marginBottom: 8 }}>
                          <div className="edash-overview-field"><span>Agreed</span><strong>{money(Number(agreedPrice) || 0)}</strong></div>
                          <div className="edash-overview-field"><span>Paid now</span><strong>{money(Number(amountPaidNow) || 0)}</strong></div>
                          <div className="edash-overview-field"><span>Remaining</span><strong>{money(Math.max(0, (Number(agreedPrice) || 0) - (Number(amountPaidNow) || 0)))}</strong></div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="edash-btn-outline" disabled={!amountPaidNow || Boolean(assignmentBusy)} title={!amountPaidNow ? "Record the first payment before reserving." : undefined} onClick={() => void assignCustomer(false)}>
                          {assignmentBusy === "reserve" ? <><Spinner size={14} /> Reserving...</> : "Reserve"}
                        </button>
                        <button
                          type="button"
                          className="edash-btn-primary"
                          disabled={!amountPaidNow || Boolean(assignmentBusy) || (Number(agreedPrice) > 0 && (Number(amountPaidNow) || 0) < Number(agreedPrice))}
                          title={!amountPaidNow ? "Record the first payment before allocating." : Number(agreedPrice) > 0 && (Number(amountPaidNow) || 0) < Number(agreedPrice) ? "Allocation is only available once the agreed price is fully paid - use Reserve until then." : undefined}
                          onClick={() => void assignCustomer(true)}
                        >
                          {assignmentBusy === "allocate" ? <><Spinner size={14} /> Allocating...</> : "Allocate / sell"}
                        </button>
                      </div>
                      <p className="edash-tab-empty" style={{ padding: "6px 0 0", textAlign: "left", fontSize: "0.78rem" }}>
                        A first payment is required to reserve a plot. Allocation (the official, title-bearing status) is only available once fully paid, and a reserved plot becomes Allocated automatically when its balance is fully confirmed paid.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {drawerTab === "survey" && (
                <div className="edash-tab-panel">
                  {selectedSurvey ? (
                    <>
                      <div className="edash-info-card">
                        <span className="edash-info-card-icon"><EstateIcon name="survey" /></span>
                        <div className="edash-info-card-body">
                          <div className="edash-info-card-head"><span className="edash-status-row-title">Survey request</span><span className={`edash-status-pill tone-${statusPillTone(selectedSurvey.status)}`}>{surveyLabel}</span></div>
                          <p className="edash-status-row-desc">{selectedSurvey.survey_reference ? `Reference ${selectedSurvey.survey_reference}` : "No reference assigned yet."}</p>
                        </div>
                      </div>
                      {!selectedSurvey.materialized && <button type="button" className="edash-btn-primary" disabled={Boolean(workflowBusy)} onClick={() => void runWorkflow("Survey workspace", () => api.post(`/estates/survey-requests/${selectedSurvey.id}/start`))}>{workflowBusy === "Survey workspace" ? <><Spinner size={14} /> Opening...</> : "Open Survey preparation"}</button>}
                      {selectedSurvey.materialized && (
                        <button
                          type="button"
                          className="edash-btn-outline"
                          style={{ display: "inline-flex", marginRight: 8 }}
                          onClick={() => openSurveyStationSelection(selectedSurvey.plot.id)}
                        >
                          Open approved plot in Survey
                        </button>
                      )}
                      {selectedSurvey.materialized && selectedSurvey.status !== "completed" && <button type="button" className="edash-btn-primary" disabled={Boolean(workflowBusy)} onClick={() => void runWorkflow("Survey completion", () => api.post(`/estates/survey-requests/${selectedSurvey.id}/complete`))}>{workflowBusy === "Survey completion" ? <><Spinner size={14} /> Completing...</> : "Mark Survey complete"}</button>}
                    </>
                  ) : (
                    <div className="edash-tab-empty">
                      <EstateIcon name="survey" />
                      <span>No Survey request yet for this plot.</span>
                      {selectedAllocation && <button type="button" className="edash-btn-primary" style={{ marginTop: 8 }} disabled={Boolean(workflowBusy)} onClick={() => void runWorkflow("Survey preparation", () => api.post(`/estates/plots/${selectedAllocation.plot_id}/survey-requests`))}>{workflowBusy === "Survey preparation" ? <><Spinner size={14} /> Preparing...</> : "Prepare Survey"}</button>}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === "staking" && (
                <div className="edash-tab-panel">
                  {selectedTask ? (
                    <>
                      <div className="edash-info-card">
                        <span className="edash-info-card-icon"><EstateIcon name="staking" /></span>
                        <div className="edash-info-card-body">
                          <div className="edash-info-card-head"><span className="edash-status-row-title">Staking task</span><span className={`edash-status-pill tone-${statusPillTone(selectedTask.status)}`}>{stakingLabel}</span></div>
                          <p className="edash-status-row-desc">{selectedTask.assigned_subject_id ? `Handled by ${selectedTask.assigned_subject_id}` : "Not yet assigned to a field officer."}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="edash-btn-outline" onClick={() => void downloadDgps(selectedTask.id)}><EstateIcon name="download" /> Download DGPS CSV</button>
                        {selectedTask.status === "pending" && <button type="button" className="edash-btn-primary" disabled={Boolean(workflowBusy)} onClick={() => void runWorkflow("Staking status", () => api.post(`/estates/staking-tasks/${selectedTask.id}/start`))}>{workflowBusy === "Staking status" ? <><Spinner size={14} /> Updating...</> : "Mark in progress"}</button>}
                        {selectedTask.status === "in_progress" && <button type="button" className="edash-btn-primary" disabled={Boolean(workflowBusy)} onClick={() => void runWorkflow("Staking completion", () => api.post(`/estates/staking-tasks/${selectedTask.id}/complete`))}>{workflowBusy === "Staking completion" ? <><Spinner size={14} /> Completing...</> : "Mark complete"}</button>}
                      </div>
                      <label className="edash-overview-field" style={{ marginTop: 10 }}>
                        <span>Field evidence</span>
                        <input type="file" accept="image/*,.pdf" onChange={(event) => setStakingEvidence(event.target.files?.[0] || null)} />
                      </label>
                      {stakingEvidence && <button type="button" className="edash-btn-outline" onClick={() => void uploadStakingEvidence(selectedTask.id)}>Upload evidence</button>}
                    </>
                  ) : (
                    <div className="edash-tab-empty">
                      <EstateIcon name="staking" />
                      <span>{selectedSurvey?.materialized ? "Staking has not been prepared for this plot yet." : "Complete Survey first to prepare staking."}</span>
                    </div>
                  )}
                </div>
              )}

              {drawerTab === "documents" && (
                <div className="edash-tab-panel">
                  <label className="edash-overview-field">
                    <span>Upload a document for this plot</span>
                    <input type="file" onChange={(event) => setPlotDocumentFile(event.target.files?.[0] || null)} />
                  </label>
                  <button type="button" className="edash-btn-primary" style={{ alignSelf: "flex-start" }} disabled={!plotDocumentFile || plotDocumentBusy} onClick={() => void uploadPlotDocument()}>
                    <EstateIcon name="upload" /> {plotDocumentBusy ? "Uploading..." : "Upload document"}
                  </button>
                  <Link className="edash-btn-outline" style={{ display: "inline-flex", alignSelf: "flex-start", marginTop: 10 }} to="/estates/documents">Open the full Document Vault</Link>
                </div>
              )}

              {drawerTab === "hazards" && hazardUpgradeRequired && (
                <div className="edash-tab-panel" style={{ textAlign: "center", padding: "30px 10px" }}>
                  <span className="edash-risk-icon" style={{ margin: "0 auto 12px", width: 40, height: 40 }}><EstateIcon name="flood" /></span>
                  <p className="edash-status-row-title" style={{ marginBottom: 6 }}>Hazard analysis is a Plus plan feature</p>
                  <p className="edash-status-row-desc" style={{ marginBottom: 14 }}>Flood and erosion screening for this plot is available on the Plus plan.</p>
                  <Link className="edash-btn-primary" style={{ display: "inline-flex" }} to="/estates/billing">Upgrade to Plus</Link>
                </div>
              )}
              {drawerTab === "hazards" && !hazardUpgradeRequired && (
                <div className="edash-tab-panel">
                  <div className="edash-risk-list">
                    <div className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name="flood" /></span>
                      <span>River flood (modelled)</span>
                      <span className={`edash-status-pill tone-${hazardRiver ? riskTone(hazardRiver) : "neutral"}`}>{hazardRiverPct !== null ? `${hazardRiverPct}%` : (hazardRiver ? hazardRiver.replaceAll("_", " ") : "Not screened")}</span>
                    </div>
                    <div className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name="flood" /></span>
                      <span>Floodplain (elevation)</span>
                      <span className={`edash-status-pill tone-${hazardFloodplain ? riskTone(hazardFloodplain) : "neutral"}`}>{hazardFloodplainPct !== null ? `${hazardFloodplainPct}%` : (hazardFloodplain ? hazardFloodplain.replaceAll("_", " ") : "Not screened")}</span>
                    </div>
                    <div className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name="flood" /></span>
                      <span>Rainfall (experimental)</span>
                      <span className="edash-status-pill tone-neutral">{hazardRainfallPct !== null ? `${hazardRainfallPct}%` : "Not screened"}</span>
                    </div>
                    <div className="edash-risk-item">
                      <span className="edash-risk-icon"><EstateIcon name="erosion" /></span>
                      <span>Erosion Risk</span>
                      <span className={`edash-status-pill tone-${hazardErosion ? riskTone(hazardErosion) : "neutral"}`}>{hazardErosion ? hazardErosion.replaceAll("_", " ") : "Not screened"}</span>
                    </div>
                  </div>
                  <p className="edash-field-note" style={{ margin: "10px 0 0" }}>
                    Scores are 0-100 site-relative risk indicators, not calibrated probabilities of an actual flood - each signal is independent and shouldn't be summed or averaged. River reflects a direct modelled river-flood hit (JRC/Copernicus GloFAS). Floodplain reflects this plot's elevation relative to the surrounding drainage network - a screening-level proxy used mainly where there's no direct river-model coverage. Rainfall is experimental: in testing it could not reliably tell a documented flood zone from a well-drained one, so it's shown for transparency only, never as confirmed risk evidence.
                  </p>
                  <button type="button" className="edash-btn-primary" style={{ marginTop: 12 }} onClick={() => void loadHazards()}>Run flood + erosion screening</button>
                </div>
              )}

              {drawerTab === "timeline" && (
                <div className="edash-tab-panel">
                  {plotTimeline.length ? (
                    <div className="edash-timeline-list">
                      {plotTimeline.map((event: any) => (
                        <div key={event.id} className="edash-timeline-item">
                          <span className="edash-timeline-dot" />
                          <div>
                            <strong>{String(event.action || "").replaceAll("_", " ")}</strong>
                            <small>{new Date(event.created_at).toLocaleString()}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="edash-tab-empty">
                      <EstateIcon name="audit" />
                      <span>No recorded activity for this plot yet.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderBottomRow(cards: Array<"activity" | "progress" | "risk"> = ["activity", "progress", "risk"]) {
    return (
      <div className={`edash-bottom-row edash-bottom-row--${cards.length}`}>
        {cards.includes("activity") && (
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Recent Activity</h3>
              <Link className="edash-card-link" to={`/estates/${estateId}/timeline`}>View All</Link>
            </div>
            {activity.length ? (
              <div className="edash-activity-list">
                {activity.slice(0, 6).map((event: any) => (
                  <div key={event.id} className="edash-activity-item">
                    <span className={`edash-activity-icon tone-${activityTone(event.action)}`}><EstateIcon name={activityIcon(event.action)} /></span>
                    <div className="edash-activity-body">
                      <strong>{String(event.action || "").replaceAll("_", " ")}</strong>
                      <span>{event.entity_type === "plot" ? `Plot ${event.entity_id} · ` : ""}{relativeTime(event.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="edash-tab-empty">No activity recorded yet.</p>}
          </div>
        </div>
        )}

        {cards.includes("progress") && (
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head"><h3 className="edash-card-title">Estate Progress</h3></div>
            {dashboard ? (
              <div className="edash-progress-donut-row">
                <svg viewBox="0 0 36 36" width="118" height="118">
                  <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--edash-border-soft)" strokeWidth="4.2" />
                  {donutArcs.map((arc) => (
                    <circle
                      key={arc.key}
                      cx="18" cy="18" r="15.9155" fill="none"
                      stroke={arc.color}
                      strokeWidth="4.2"
                      strokeDasharray={`${arc.fraction * donutCircumference} ${donutCircumference - arc.fraction * donutCircumference}`}
                      strokeDashoffset={25 - arc.offset * 100}
                      strokeLinecap="butt"
                    />
                  ))}
                  <text x="18" y="19.5" textAnchor="middle" fontSize="7" fontWeight="800" fill="var(--edash-ink)">{Math.round(allocatedFraction * 100)}%</text>
                </svg>
                <div className="edash-donut-legend">
                  {donutOrder.map((item) => (
                    <div key={item.key} className="edash-donut-legend-item">
                      <span className="edash-donut-legend-dot" style={{ background: item.color }} />
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="edash-tab-empty">No plots mapped yet.</p>}
          </div>
        </div>
        )}

        {cards.includes("risk") && (
        <div className="edash-card">
          <div className="edash-card-inner">
            <div className="edash-card-head">
              <h3 className="edash-card-title">Risk Overview</h3>
              <Link className="edash-card-link" to={`/estates/${estateId}/hazards`}>View Details</Link>
            </div>
            <div className="edash-risk-list">
              {hazardUpgradeRequired ? (
                <div className="edash-risk-item" style={{ justifyContent: "space-between" }}>
                  <span className="edash-risk-icon"><EstateIcon name="flood" /></span>
                  <span>Flood &amp; erosion analysis</span>
                  <Link className="edash-status-pill tone-neutral" to="/estates/billing" style={{ textDecoration: "none" }}>Upgrade to Plus</Link>
                </div>
              ) : hazardDashboard?.assessments?.length ? (
                (() => {
                  const { river, floodplain, rainfall } = floodSignalSummary(hazardDashboard.assessments || []);
                  const rows: Array<{ key: string; label: string; value: { assessed: number; classes: Record<string, number>; percents: number[] }; experimental?: boolean }> = [
                    { key: "river", label: "River Flood", value: river },
                    { key: "floodplain", label: "Floodplain", value: floodplain },
                    { key: "rainfall", label: "Rainfall (exp.)", value: rainfall, experimental: true },
                  ];
                  if (hazardDashboard.summary?.erosion) rows.push({ key: "erosion", label: "Erosion", value: { ...hazardDashboard.summary.erosion, percents: [] } });
                  return rows.map(({ key, label, value, experimental }) => {
                    const classes = Object.keys(value.classes || {});
                    const worst = classes.find((entry) => riskTone(entry) === "danger") || classes.find((entry) => riskTone(entry) === "warn") || classes[0];
                    const maxPct = value.percents.length ? Math.max(...value.percents) : null;
                    const display = maxPct !== null ? `Up to ${maxPct}%` : (worst ? worst.replaceAll("_", " ") : (value.assessed ? "No data" : "Unscreened"));
                    return (
                      <div key={key} className="edash-risk-item">
                        <span className="edash-risk-icon"><EstateIcon name={key === "erosion" ? "erosion" : "flood"} /></span>
                        <span>{label}</span>
                        <span className={`edash-status-pill tone-${experimental ? "neutral" : (worst ? riskTone(worst) : "neutral")}`}>{display}</span>
                      </div>
                    );
                  });
                })()
              ) : (
                <>
                  <div className="edash-risk-item"><span className="edash-risk-icon"><EstateIcon name="flood" /></span><span>River Flood</span><span className="edash-status-pill tone-neutral">Not screened</span></div>
                  <div className="edash-risk-item"><span className="edash-risk-icon"><EstateIcon name="flood" /></span><span>Floodplain</span><span className="edash-status-pill tone-neutral">Not screened</span></div>
                  <div className="edash-risk-item"><span className="edash-risk-icon"><EstateIcon name="flood" /></span><span>Rainfall (exp.)</span><span className="edash-status-pill tone-neutral">Not screened</span></div>
                  <div className="edash-risk-item"><span className="edash-risk-icon"><EstateIcon name="erosion" /></span><span>Erosion Risk</span><span className="edash-status-pill tone-neutral">Not screened</span></div>
                </>
              )}
              <div className="edash-risk-item">
                <span className="edash-risk-icon"><EstateIcon name="shield" /></span>
                <span>General Vulnerability</span>
                <span className={`edash-status-pill tone-${quality && !quality.review_required ? "good" : "neutral"}`}>{quality ? (quality.review_required ? "Review required" : "Low") : "Pending"}</span>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    );
  }

  function renderToolsBar() {
    type ToolKey = "add-plot" | "layout" | "blocks" | "layers" | "export-layout";
    const hasBoundary = Boolean(estateDetail?.boundary);
    const hasPlots = plots.length > 0;
    const hasSpatialContext = hasBoundary || hasPlots;
    const tools: Array<{ key: ToolKey; label: string; icon: import("../components/estates/EstateIcon").EstateIconName; locked?: string }> = [
      { key: "add-plot", label: "Add Plot", icon: "plus" },
      { key: "layout", label: "Design Layout", icon: "map", locked: hasSpatialContext ? undefined : "Add a plot or Estate boundary first, then design or subdivide a layout." },
      { key: "blocks", label: "Blocks", icon: "grid" },
      { key: "layers", label: "Map Layers", icon: "layers", locked: hasSpatialContext ? undefined : "Add a plot or Estate boundary before mapping roads, drainage or other layers." },
      { key: "export-layout", label: "Export Layout", icon: "download", locked: hasPlots ? undefined : "Add at least one approved plot before exporting the whole layout." },
    ];
    return (
      <div className="edash-tools-bar">
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            className={`edash-tool-btn${tool.locked ? " edash-tool-btn--locked" : ""}`}
            disabled={Boolean(tool.locked)}
            title={tool.locked}
            onClick={() => { if (!tool.locked) setActiveTool(tool.key); }}
          >
            <EstateIcon name={tool.locked ? "lock" : tool.icon} />
            {tool.label}
          </button>
        ))}
      </div>
    );
  }

  function renderToolModal(title: string, subtitle: string, content: ReactNode) {
    return (
      <EstateModal title={title} subtitle={subtitle} onClose={() => setActiveTool(null)}>
        {content}
      </EstateModal>
    );
  }

  function renderLayoutApprovalStep() {
    if (!plots.length) return null;
    const issueCount = quality?.issues?.length || 0;
    const published = dashboard?.estate?.status === "active";
    return (
      <div className="edash-layout-final-step" style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--edash-border)" }}>
        <div className="edash-card-head">
          <div>
            <span className="edash-step-badge">Last step</span>
            <h3 className="edash-card-title" style={{ marginTop: 8 }}>Check and approve the layout</h3>
          </div>
          {quality && <span className={`edash-status-pill tone-${quality.review_required ? "warn" : "good"}`}>{quality.review_required ? "Review required" : "Ready to publish"}</span>}
        </div>
        <p className="edash-status-row-desc">Run one final geometry check after georeferencing, digitising or designing plots. Fix any issues before making this Estate map active.</p>
        {qualityLoading ? (
          <LoadingPanel label="Checking plot geometry..." />
        ) : quality ? (
          <>
            <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>{quality.plot_count} plots checked. {issueCount} issue{issueCount === 1 ? "" : "s"} found.</p>
            {issueCount > 0 && (
              <div className="edash-issue-list" style={{ marginBottom: 12 }}>
                <ul>{quality.issues.slice(0, 8).map((issue: any, index: number) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="edash-btn-outline" onClick={() => void loadQualityCheck()}>Run check again</button>
              <button type="button" className="edash-btn-primary" disabled={published || quality.review_required || quality.plot_count === 0} onClick={() => void approveEstateMap()}>
                {published ? "Estate map published" : "Approve and publish map"}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="edash-btn-primary" onClick={() => void loadQualityCheck()}>Check layout</button>
        )}
      </div>
    );
  }

  function renderSurveyStationSelectionModal() {
    if (!surveyStationSelection) return null;
    const stationNames = surveyStationMode === "custom" ? customSurveyStationNames : surveyStationSelection.currentNames;
    return (
      <EstateModal
        title="Choose survey station names"
        subtitle="These names will appear on the Survey Plan and its coordinate schedule."
        onClose={() => setSurveyStationSelection(null)}
      >
        <div className="edash-survey-station-options" role="radiogroup" aria-label="Survey station naming">
          <label className={`edash-survey-station-option${surveyStationMode === "current" ? " is-selected" : ""}`}>
            <input type="radio" name="survey-station-mode" checked={surveyStationMode === "current"} onChange={() => setSurveyStationMode("current")} />
            <span>
              <strong>Use current station names</strong>
              <small>{surveyStationSelection.loading ? "Loading saved names..." : surveyStationSelection.currentNames.join(", ")}</small>
            </span>
          </label>
          <label className={`edash-survey-station-option${surveyStationMode === "custom" ? " is-selected" : ""}`}>
            <input type="radio" name="survey-station-mode" checked={surveyStationMode === "custom"} onChange={() => setSurveyStationMode("custom")} />
            <span>
              <strong>Use custom station names</strong>
              <small>Edit every boundary station before opening the Survey Plan.</small>
            </span>
          </label>
        </div>
        {surveyStationMode === "custom" && (
          <div className="edash-survey-station-editor">
            <div className="edash-survey-station-editor-head"><strong>Station names</strong><span>{stationNames.length} boundary points</span></div>
            {customSurveyStationNames.map((name, index) => (
              <label className="edash-survey-station-row" key={`${surveyStationSelection.plotId}-${index}`}>
                <span>Point {index + 1}</span>
                <input
                  value={name}
                  onChange={(event) => setCustomSurveyStationNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder={surveyStationSelection.currentNames[index] || surveyStationName(index)}
                />
              </label>
            ))}
          </div>
        )}
        <div className="edash-modal-actions">
          <button type="button" className="edash-btn-outline" onClick={() => setSurveyStationSelection(null)}>Cancel</button>
          <button type="button" className="edash-btn-primary" disabled={surveyStationSelection.loading || preparingSurveyPlotId === surveyStationSelection.plotId} onClick={() => void createOfficialSurveyPlan()}>
            {preparingSurveyPlotId === surveyStationSelection.plotId ? <><Spinner size={14} /> Opening...</> : "Continue to Survey Plan"}
          </button>
        </div>
      </EstateModal>
    );
  }

  function renderActiveToolModal() {
    if (activeTool === "add-plot") {
      const isDrawOrCoordinates = addPlotMethod === "draw" || addPlotMethod === "coordinates";
      const needsSourceCrs = addPlotMethod === "csv" || addPlotMethod === "dxf";
      // "Draw", "coordinates" and "scanned-layout" all need the full named-system list
      // (COORDINATE_SYSTEM_GROUPS - wgs84/utm_31n/etc.), not the reduced EPSG-string set CSV/DXF
      // reprojection uses - but the field itself renders in the exact same shared position/style as
      // that one, one picker per method, never two at once. Drawing on the satellite map always
      // captures WGS84 vertices from Mapbox (no reprojection needed for the geometry itself), but the
      // picker still matters here: it's what this plot's DGPS export and Survey Plan handoff default
      // to afterwards, so every creation method - not just manual entry - should record and confirm it.
      const needsNamedCrs = addPlotMethod === "draw" || addPlotMethod === "coordinates" || addPlotMethod === "scanned-layout";
      return renderToolModal("Add a plot", "Choose how you want to add this plot to the Estate register.", (
        <>
          <div className="edash-form-row" style={{ marginBottom: 16 }}>
            <label className="edash-field" style={{ maxWidth: 320 }}>
              <span>Method</span>
              <select value={addPlotMethod} onChange={(event) => {
                const method = event.target.value as AddPlotMethod;
                setAddPlotMethod(method);
                if (method === "coordinates") {
                  setPlotInputPoints((current) => current.length ? current : [
                    { station: "A", lng: Number.NaN, lat: Number.NaN, is_boundary: true },
                    { station: "B", lng: Number.NaN, lat: Number.NaN, is_boundary: true },
                    { station: "C", lng: Number.NaN, lat: Number.NaN, is_boundary: true },
                  ]);
                }
              }}>
                <option value="draw">Draw on the satellite map</option>
                <option value="coordinates">Enter coordinates manually</option>
                {LAYOUT_IMPORT_METHODS.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}
              </select>
              {(() => {
                const selected = LAYOUT_IMPORT_METHODS.find((item) => item.key === addPlotMethod);
                return selected ? <p className="edash-field-note" style={{ marginTop: 4 }}>{selected.description}</p> : null;
              })()}
            </label>
            {needsSourceCrs && (
              <label className="edash-field" style={{ maxWidth: 280 }}>
                <span>Coordinate system</span>
                <select value={importSourceCrs} onChange={(event) => setImportSourceCrs(event.target.value)}>
                  {IMPORT_CRS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
            {needsNamedCrs && (
              <label className="edash-field" style={{ maxWidth: 280 }}>
                <span>Coordinate system</span>
                <select
                  value={addPlotMethod === "scanned-layout" ? scannedLayoutCrs : plotInputCoordinateSystem}
                  onChange={(event) => {
                    const nextCrs = event.target.value;
                    if (addPlotMethod === "scanned-layout") setScannedLayoutCrs(nextCrs);
                    else setPlotInputCoordinateSystem(nextCrs);
                    // Keeps the plot(s) this action creates consistent with what Survey Plan and the
                    // DGPS export pickers default to afterwards, rather than three independent choices
                    // that happen to start out matching but can silently drift apart.
                    setDgpsExportCoordinateSystem(nextCrs);
                    setLayoutExportCoordinateSystem(nextCrs);
                  }}
                >
                  {COORDINATE_SYSTEM_GROUPS.map((group) => (
                    <optgroup key={group.country} label={group.country}>
                      {group.systems.map((system) => (
                        <option key={system.key} value={system.key}>{system.name} ({system.epsgLabel})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
          </div>

          {isDrawOrCoordinates ? (
            <>
              <div className="edash-form-row" style={{ marginBottom: 4 }}>
                <label className="edash-field" style={{ maxWidth: 320 }}>
                  <span>This represents</span>
                  <select value={addPlotRepresents} onChange={(event) => setAddPlotRepresents(event.target.value as "plot" | "boundary")}>
                    <option value="plot">An individual plot</option>
                    <option value="boundary">The Estate boundary (subdivide next)</option>
                  </select>
                </label>
                {addPlotRepresents === "plot" && (
                  <label className="edash-field" style={{ maxWidth: 260 }}><span>Plot number</span><input value={plotNumber} onChange={(event) => setPlotNumber(event.target.value)} placeholder="e.g. B-024" /></label>
                )}
              </div>
              <p className="edash-field-note" style={{ marginBottom: 12 }}>
                {addPlotRepresents === "plot"
                  ? "This creates one plot record for the area you outline. To turn a large area into many smaller plots afterwards, open \"Design Layout\" and subdivide it."
                  : "This sets the Estate's overall boundary - no plot is created yet. Afterwards, open \"Design Layout\" to subdivide it or design a layout automatically."}
              </p>
              {addPlotMethod === "draw" ? (
                <div>
                  <p className="edash-status-row-desc" style={{ marginBottom: 8 }}>Trace the plot boundary directly on the satellite image, then confirm below.</p>
                  {MAPBOX_TOKEN ? <MapViewEnhanced coordinates={plotInputMapPoints} onCoordinatesDrawn={handlePlotCoordinatesDrawn} coordinateSystem="wgs84" showToolbar /> : <p className="edash-tab-empty">Map drawing is unavailable right now. Switch to "Enter coordinates manually" instead.</p>}
                </div>
              ) : (
                <div className="edash-content-row edash-content-row--split">
                  <CoordinateInput title="Plot boundary coordinates" subtitle="Enter one row for each boundary corner." points={plotInputPoints} onUpdatePoint={updatePlotInputPoint} onRemovePoint={removePlotInputPoint} onAddPoint={addPlotInputPoint} onBulkUpload={importPlotInputPoints} disabled={false} coordinateSystem={plotInputCoordinateSystem} onCoordinateSystemChange={setPlotInputCoordinateSystem} onReorderPoints={reorderPlotInputPoints} manualEntryOnly />
                  <div>
                    <div className="edash-card-head"><h3 className="edash-card-title" style={{ fontSize: "0.84rem" }}>Map preview</h3></div>
                    <p className="edash-status-row-desc" style={{ marginBottom: 8 }}>Edit the boundary on the map or use the table.</p>
                    {MAPBOX_TOKEN ? <MapViewEnhanced coordinates={plotInputMapPoints} onCoordinatesDrawn={handlePlotCoordinatesDrawn} coordinateSystem="wgs84" showToolbar /> : <p className="edash-tab-empty">Map preview is unavailable right now. You can still review the coordinates above.</p>}
                  </div>
                </div>
              )}
              <button
                type="button"
                className="edash-btn-primary"
                style={{ marginTop: 12 }}
                disabled={plotInputMapPoints.length < 3 || plotInputClosure === "self-intersecting"}
                onClick={() => void (addPlotRepresents === "boundary" ? createEstateBoundaryFromInput() : createPlotFromInput())}
              >
                {plotInputClosure === "self-intersecting" ? "Fix boundary first" : addPlotRepresents === "boundary" ? "Set as Estate boundary" : "Create plot"}
              </button>
            </>
          ) : (
            <EstateLayoutImport
              method={addPlotMethod as EstateLayoutMethod}
              reviews={importReviews}
              files={{ csv: csvFile, geojson: geojsonFile, dxf: dxfFile, "scanned-layout": scannedLayoutFile }}
              onFileChange={handleLayoutFileChange}
              onUpload={(method) => void uploadLayout(method)}
              onDecision={(reviewId, status) => void decideImportReview(reviewId, status, importAsBoundary)}
              onStartGeoreference={(file) => void startGeoreferenceImport(file)}
              onOpenGeoreference={openGeoreferenceTool}
              message={layoutMessage}
              messageTone={layoutMessageTone}
              busy={layoutUploadBusy}
              asBoundary={importAsBoundary}
              onAsBoundaryChange={setImportAsBoundary}
            />
          )}
        </>
      ));
    }
    if (activeTool === "layout") {
      const availablePlots = plots.filter((plot) => plot.commercial_status === "available");
      const targetSubdividePlotId = designSubdividePlotId ?? availablePlots[0]?.id ?? null;
      const hasBoundary = Boolean(estateDetail?.boundary);
      return renderToolModal("Design your layout", "Create or subdivide plots, then check and approve the layout before publishing.", (
        <>
          <div className="edash-form-row" style={{ marginBottom: 16, alignItems: "flex-end" }}>
            <label className="edash-field" style={{ maxWidth: 320 }}>
              <span>Method</span>
              <select value={designLayoutMethod} onChange={(event) => setDesignLayoutMethod(event.target.value as "subdivide" | "automatic")}>
                <option value="automatic">Design automatically (Nigerian estate presets)</option>
                <option value="subdivide">Subdivide a plot or the boundary evenly</option>
              </select>
            </label>
            {(plots.length > 0 || hasBoundary) && (
              <button type="button" className="edash-btn-outline" style={{ color: "var(--edash-danger)", borderColor: "var(--edash-danger-tint)" }} onClick={() => setShowResetLayoutConfirm(true)}>
                Reset layout
              </button>
            )}
          </div>

          {designLayoutMethod === "subdivide" ? (
            <>
              {availablePlots.length > 0 && (
                <div className="edash-info-card" style={{ flexDirection: "column", marginBottom: 16 }}>
                  <div className="edash-info-card-head"><span className="edash-status-row-title">Subdivide an existing plot</span></div>
                  <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>
                    Split one plot - for example a large "mother" parcel covering the whole Estate - into smaller plots. Each new plot is added to your Plots count and can be allocated to a customer.
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={targetSubdividePlotId ?? ""} onChange={(event) => setDesignSubdividePlotId(Number(event.target.value))}>
                      {availablePlots.map((plot) => <option key={plot.id} value={plot.id}>{plot.plot_number} - {formatArea(Number(plot.area_sqm || 0), unitSystem)}</option>)}
                    </select>
                    <input type="number" min="2" max="100" value={subdivisionCount} onChange={(event) => setSubdivisionCount(event.target.value)} style={{ width: 80, padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
                    <button type="button" className="edash-btn-primary" disabled={subdivisionBusy || !targetSubdividePlotId} onClick={() => targetSubdividePlotId && void subdividePlotById(targetSubdividePlotId)}>{subdivisionBusy ? <><Spinner size={13} /> Creating plots...</> : "Split into plots"}</button>
                  </div>
                </div>
              )}
              {hasBoundary && plots.length === 0 && (
                <div className="edash-info-card" style={{ flexDirection: "column", marginBottom: 16 }}>
                  <div className="edash-info-card-head"><span className="edash-status-row-title">Split the Estate boundary into equal plots</span></div>
                  <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>Fast: divide the whole boundary evenly. Best for uniform lots with no roads or open space.</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" min="2" max="200" value={subdivisionCount} onChange={(event) => setSubdivisionCount(event.target.value)} style={{ width: 80, padding: 8, borderRadius: 8, border: "1px solid var(--edash-border)" }} />
                    <button type="button" className="edash-btn-primary" disabled={subdivisionBusy} onClick={() => void splitBoundaryIntoPlots()}>{subdivisionBusy ? <><Spinner size={13} /> Creating...</> : "Split boundary"}</button>
                  </div>
                </div>
              )}
              {availablePlots.length === 0 && !(hasBoundary && plots.length === 0) && (
                <p className="edash-tab-empty">Add a plot or an Estate boundary first, then come back here to subdivide it.</p>
              )}
            </>
          ) : (
            <>
              {!hasBoundary && plots.length > 0 && (
                <div className="edash-info-card" style={{ flexDirection: "column", marginBottom: 16 }}>
                  <div className="edash-info-card-head"><span className="edash-status-row-title">No Estate boundary yet</span></div>
                  <p className="edash-status-row-desc" style={{ marginBottom: 10 }}>Automatic design needs an overall boundary to work within. Use one of your existing plots as the Estate boundary to unlock it.</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={targetSubdividePlotId ?? ""} onChange={(event) => setDesignSubdividePlotId(Number(event.target.value))}>
                      {plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.plot_number} - {formatArea(Number(plot.area_sqm || 0), unitSystem)}</option>)}
                    </select>
                    <button type="button" className="edash-btn-primary" disabled={!targetSubdividePlotId} onClick={() => targetSubdividePlotId && void useAsEstateBoundary(targetSubdividePlotId)}>Use as Estate boundary</button>
                  </div>
                </div>
              )}
              <EstateLayoutDesigner boundaryPresent={hasBoundary} boundaryAreaSqm={boundaryAreaSqm} proposal={layoutProposal} busy={layoutDesignerBusy} unitSystem={unitSystem} onGenerate={(criteria) => void generateLayoutProposal(criteria)} onDecision={(proposalId, status) => void decideLayoutProposal(proposalId, status)} onEditCandidates={editLayoutProposalCandidates} onAddFeature={addLayoutProposalFeature} onRemoveFeature={removeLayoutProposalFeature} />
            </>
          )}
          {renderLayoutApprovalStep()}
        </>
      ));
    }
    if (activeTool === "blocks") {
      return renderToolModal("Blocks", "Define block labels before assigning imported or manually created plots.", (
        <>
          <div className="edash-form-row" style={{ marginBottom: 12 }}>
            <label className="edash-field"><span>Block label</span><input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} placeholder="e.g. B" /></label>
            <label className="edash-field"><span>Block name</span><input value={blockName} onChange={(event) => setBlockName(event.target.value)} placeholder="Optional" /></label>
            <button type="button" className="edash-btn-primary" onClick={() => void createBlock()}>Add block</button>
          </div>
          <div className="edash-chip-row">
            {blocks.length ? blocks.map((block) => <span key={block.id} className="edash-chip">{block.label}{block.name ? ` - ${block.name}` : ""}</span>) : <p className="edash-tab-empty" style={{ padding: 0 }}>No blocks yet.</p>}
          </div>
        </>
      ));
    }
    if (activeTool === "layers") {
      return renderToolModal("Map layers", "Add or correct roads, drainage, open space and infrastructure.", (
        <>
          <div className="edash-form-grid" style={{ marginBottom: 20 }}>
            <div className="edash-form-row">
              <label className="edash-field"><span>Layer type</span><select value={layerType} onChange={(event) => setLayerType(event.target.value)}><option value="road">Road</option><option value="drainage">Drainage</option><option value="open_space">Open space</option><option value="infrastructure">Infrastructure</option></select></label>
              <label className="edash-field"><span>Layer name</span><input value={layerName} onChange={(event) => setLayerName(event.target.value)} placeholder="Optional" /></label>
            </div>
            <label className="edash-field"><span>Coordinates</span><textarea value={layerCoordinates} onChange={(event) => setLayerCoordinates(event.target.value)} placeholder="longitude, latitude per line" /></label>
            <div>
              <div className="edash-card-head"><h3 className="edash-card-title" style={{ fontSize: "0.8rem" }}>Or draw it on the map</h3></div>
              <p className="edash-field-note" style={{ marginBottom: 8 }}>
                {layerType === "open_space" ? "Draws a closed polygon (an area)." : "Draws an open line (a centreline) - use this for a road, drainage run or infrastructure corridor."}
              </p>
              {MAPBOX_TOKEN ? <MapViewEnhanced coordinates={parseCoordinateTextToPoints(layerCoordinates)} onCoordinatesDrawn={handleLayerCoordinatesDrawn} coordinateSystem="wgs84" showToolbar drawShape={layerType === "open_space" ? "polygon" : "line"} /> : <p className="edash-tab-empty">Map drawing is unavailable right now.</p>}
            </div>
            <button type="button" className="edash-btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => void createLayer()}>Add layer</button>
          </div>
          {layerGeojson.features.length > 0 && (
            <div className="edash-form-grid">
              <div className="edash-card-head"><h3 className="edash-card-title" style={{ fontSize: "0.86rem" }}>Spatial layer editor</h3></div>
              <label className="edash-field"><span>Layer</span>
                <select value={selectedLayerId} onChange={(event) => selectLayerForEdit(event.target.value)}>
                  <option value="">Select a layer</option>
                  {layerGeojson.features.map((feature: any) => <option key={feature.id} value={feature.id}>{feature.properties.name || feature.properties.type} #{feature.id}</option>)}
                </select>
              </label>
              {selectedLayerId && (
                <>
                  <label className="edash-field"><span>Coordinates</span><textarea value={layerEditCoordinates} onChange={(event) => setLayerEditCoordinates(event.target.value)} /></label>
                  {(() => {
                    const editingGeometryType = layerGeojson.features.find((feature: any) => String(feature.id) === selectedLayerId)?.geometry?.type;
                    if (editingGeometryType !== "Polygon" && editingGeometryType !== "LineString") return null;
                    return (
                      <div>
                        <div className="edash-card-head"><h3 className="edash-card-title" style={{ fontSize: "0.8rem" }}>Or edit vertices on the map</h3></div>
                        {MAPBOX_TOKEN ? <MapViewEnhanced coordinates={parseCoordinateTextToPoints(layerEditCoordinates)} onCoordinatesDrawn={handleLayerEditCoordinatesDrawn} coordinateSystem="wgs84" showToolbar drawShape={editingGeometryType === "Polygon" ? "polygon" : "line"} /> : <p className="edash-tab-empty">Map editing is unavailable right now.</p>}
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="edash-btn-primary" onClick={() => void updateLayer()}>Save geometry</button>
                    <button type="button" className="edash-btn-outline" onClick={() => void archiveLayer()}>Archive layer</button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      ));
    }
    if (activeTool === "export-layout") {
      return renderToolModal("Export the whole layout", "Every approved plot, road, drainage reserve and open space in this Estate, exported at once.", (
        <>
          <div className="edash-info-card" style={{ marginBottom: 12 }}>
            <span className="edash-info-card-icon"><EstateIcon name="map" /></span>
            <div className="edash-info-card-body">
              <p className="edash-info-card-name">Layout plan (PDF)</p>
              <p className="edash-info-card-meta">A clean, single-page site layout plan - plots, roads, open space and drainage, labelled with plot numbers and areas.</p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <label className="edash-field" style={{ maxWidth: 120, marginBottom: 0 }}>
                  <span>Paper size</span>
                  <select value={layoutPdfPaperSize} onChange={(event) => setLayoutPdfPaperSize(event.target.value)}>
                    {["A0", "A1", "A2", "A3", "A4"].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--edash-muted)" }}>
                  <input type="checkbox" checked={layoutPdfIncludeCustomerNames} onChange={(event) => setLayoutPdfIncludeCustomerNames(event.target.checked)} />
                  Include customer names
                </label>
              </div>
              <p className="edash-field-note" style={{ marginTop: 4 }}>
                {layoutPdfIncludeCustomerNames ? "Each allocated/reserved plot will show its customer's name - for internal use." : "No customer names shown - safe for marketing, PR or public handouts."}
              </p>
            </div>
            <button type="button" className="edash-btn-primary edash-info-card-action" disabled={layoutPdfExportBusy} onClick={() => void downloadEstateLayoutPdf(layoutPdfPaperSize, layoutPdfIncludeCustomerNames)}>
              {layoutPdfExportBusy ? <><Spinner size={13} /> Rendering...</> : "Download PDF"}
            </button>
          </div>
          <div className="edash-info-card">
            <span className="edash-info-card-icon"><EstateIcon name="download" /></span>
            <div className="edash-info-card-body">
              <p className="edash-info-card-name">Layout DGPS CSV</p>
              <p className="edash-info-card-meta">Every plot's boundary vertices in one file for a whole-layout stakeout, station names prefixed by plot number.</p>
              <div style={{ marginTop: 8, maxWidth: 280 }}>
                <CoordinateSystemSelect value={layoutExportCoordinateSystem} onChange={setLayoutExportCoordinateSystem} />
              </div>
            </div>
            <button type="button" className="edash-btn-outline edash-info-card-action" disabled={layoutDgpsExportBusy} onClick={() => void downloadEstateLayoutDgpsCsv(layoutExportCoordinateSystem)}>
              {layoutDgpsExportBusy ? <><Spinner size={13} /> Exporting...</> : "Download CSV"}
            </button>
          </div>
        </>
      ));
    }
    return null;
  }

  function renderFooter() {
    return (
      <div className="edash-footer">
        <span>landcheck-estates v3.0.0</span>
        <span>Secure &middot; Private &middot; For a more certain tomorrow</span>
      </div>
    );
  }

  if (!estateId) {
    return (
      <div className="edash-onboard">
        <div className="edash-onboard-topbar">
          <div className="edash-sidebar-brand" style={{ padding: 0 }}>
            <span className="edash-sidebar-brand-logo"><img src="/logo.svg" alt="LandCheck" width="520" height="140" /></span>
            <small className="edash-sidebar-brand-tag">Estates</small>
          </div>
          <button type="button" className="edash-btn-outline" onClick={() => { clearEstateAuthSession(); navigate("/estates", { replace: true }); }}>Sign out</button>
        </div>

        <div className="edash-onboard-body">
          <div className="edash-onboard-head">
            <h1>Choose an estate</h1>
            <p>Open an existing Estate or add a new one to get started.</p>
          </div>

          {estates.length > 0 && (
            <div className="edash-card edash-onboard-card">
              <div className="edash-card-inner">
                <div className="edash-onboard-field">
                  <span>Your estates</span>
                  <div className="edash-onboard-estate-list">
                    {estates.map((estate) => {
                      const pending = estateAttention(estate.id);
                      const parts = [
                        pending.reservations ? `${pending.reservations} reservation request${pending.reservations === 1 ? "" : "s"}` : "",
                        pending.messages ? `${pending.messages} new message${pending.messages === 1 ? "" : "s"}` : "",
                        pending.inspections ? `${pending.inspections} inspection${pending.inspections === 1 ? "" : "s"} in 48h` : "",
                      ].filter(Boolean);
                      return (
                        <div className="edash-onboard-estate-row" key={estate.id}>
                          <button type="button" className="edash-onboard-estate-open" onClick={() => navigate(`/estates/${estate.id}/map`)}>
                            <strong>{estate.name}</strong>
                            <span>{parts.length ? parts.join(" · ") : estate.location || "Nothing new"}</span>
                          </button>
                          <span className={`edash-onboard-estate-bell${pending.total > 0 ? " has-new" : ""}`} title={parts.length ? parts.join(", ") : "Nothing new"} aria-label={pending.total > 0 ? `${pending.total} new` : "Nothing new"}>
                            <EstateIcon name="bell" />
                            {pending.total > 0 && <b>{pending.total > 99 ? "99+" : pending.total}</b>}
                          </span>
                          <button
                            type="button"
                            className="edash-onboard-estate-delete"
                            aria-label={`Delete ${estate.name}`}
                            title={`Delete ${estate.name}`}
                            onClick={() => { setDeleteEstateTarget(estate); setDeleteEstateConfirmText(""); setDeleteEstateAllocationWarning(null); }}
                          >
                            <EstateIcon name="trash" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {estates.length === 0 && message !== "Loading estates..." && (
            <div className="edash-info-card edash-onboard-card">
              <span className="edash-info-card-icon"><EstateIcon name="house" /></span>
              <div className="edash-info-card-body">
                <p className="edash-info-card-name">No Estates yet</p>
                <p className="edash-info-card-meta">Add your first Estate to begin managing its layout and plots.</p>
              </div>
            </div>
          )}

          <button
            type="button"
            className="edash-btn-outline edash-onboard-add"
            aria-expanded={showCreateEstate}
            aria-controls="new-estate-form"
            onClick={() => setShowCreateEstate((open) => !open)}
          >
            <EstateIcon name={showCreateEstate ? "close" : "plus"} />
            {showCreateEstate ? "Close" : "Add new estate"}
          </button>

          {showCreateEstate && organizations.length > 0 && (
            <div id="new-estate-form" className="edash-card edash-onboard-card">
              <div className="edash-card-inner">
                <div className="edash-card-head"><h3 className="edash-card-title">New Estate details</h3></div>
                <div className="edash-onboard-field">
                  <span>Company</span>
                  <select value={newEstateOrg} onChange={(event) => setNewEstateOrg(event.target.value)}>
                    <option value="">Choose company</option>
                    {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                  </select>
                </div>
                <div className="edash-onboard-field">
                  <span>Estate name</span>
                  <input value={newEstateName} onChange={(event) => setNewEstateName(event.target.value)} placeholder="e.g. Greenview Estate" />
                </div>
                <div className="edash-onboard-field">
                  <span>Location</span>
                  <input value={newEstateLocation} onChange={(event) => setNewEstateLocation(event.target.value)} placeholder="City, state or area" />
                </div>
                <details className="edash-onboard-advanced">
                  <summary>More details (optional)</summary>
                  <div>
                    <div className="edash-onboard-field">
                      <span>Coordinate system</span>
                      <select value={newEstateCrs} onChange={(event) => setNewEstateCrs(event.target.value)}>
                        {IMPORT_CRS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="edash-onboard-field"><span>Datum</span><input value={newEstateDatum} onChange={(event) => setNewEstateDatum(event.target.value)} placeholder="Optional" /></div>
                    <div className="edash-onboard-field"><span>Project reference</span><input value={newEstateProjectReference} onChange={(event) => setNewEstateProjectReference(event.target.value)} placeholder="Optional" /></div>
                    <div className="edash-onboard-field"><span>Developer or owner</span><input value={newEstateProjectOwner} onChange={(event) => setNewEstateProjectOwner(event.target.value)} placeholder="Optional" /></div>
                    <div className="edash-onboard-field"><span>Notes</span><textarea value={newEstateOwnershipDetails} onChange={(event) => setNewEstateOwnershipDetails(event.target.value)} placeholder="Ownership or project notes" /></div>
                  </div>
                </details>
                <button type="button" className="edash-btn-primary edash-onboard-submit" onClick={() => void createEstate()}>Create Estate</button>
              </div>
            </div>
          )}

          {showCreateEstate && !organizationsLoaded && <p className="edash-onboard-hint">Loading company access...</p>}
          {showCreateEstate && organizationsLoaded && organizations.length === 0 && (
            <p className="edash-onboard-hint tone-danger">No company workspace is available for your account. Ask your organization administrator for access.</p>
          )}

          {message && message !== "Loading estates..." && <p className={`edash-onboard-hint${messageTone === "danger" ? " tone-danger" : ""}`}>{message}</p>}
        </div>

        {deleteEstateTarget && (
          <EstateModal title="Delete this Estate?" subtitle="This removes it from every list and picker. Plots, payments and documents are kept, not erased." onClose={() => { setDeleteEstateTarget(null); setDeleteEstateConfirmText(""); setDeleteEstateAllocationWarning(null); }}>
            <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
              Type <strong style={{ color: "var(--edash-ink)" }}>{deleteEstateTarget.name}</strong> to confirm.
            </p>
            <label className="edash-field" style={{ marginBottom: 14 }}>
              <span>Estate name</span>
              <input value={deleteEstateConfirmText} onChange={(event) => setDeleteEstateConfirmText(event.target.value)} placeholder={deleteEstateTarget.name} autoFocus />
            </label>
            {deleteEstateAllocationWarning && (
              <div style={{ marginBottom: 14 }}>
                <StatusBanner text={`${deleteEstateAllocationWarning} Force deleting will hide this Estate anyway - the plots, allocations and payment records are kept, they just won't be reachable from here until the Estate is restored from the database.`} tone="danger" />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {deleteEstateAllocationWarning ? (
                <button
                  type="button"
                  className="edash-btn-primary"
                  style={{ background: "var(--edash-danger)" }}
                  disabled={deleteEstateBusy || deleteEstateConfirmText.trim() !== deleteEstateTarget.name}
                  onClick={() => void deleteEstate(true)}
                >
                  {deleteEstateBusy ? <><Spinner size={14} /> Deleting...</> : "Force delete anyway"}
                </button>
              ) : (
                <button
                  type="button"
                  className="edash-btn-primary"
                  style={{ background: "var(--edash-danger)" }}
                  disabled={deleteEstateBusy || deleteEstateConfirmText.trim() !== deleteEstateTarget.name}
                  onClick={() => void deleteEstate(false)}
                >
                  {deleteEstateBusy ? <><Spinner size={14} /> Deleting...</> : "Delete estate"}
                </button>
              )}
              <button type="button" className="edash-btn-outline" onClick={() => { setDeleteEstateTarget(null); setDeleteEstateConfirmText(""); setDeleteEstateAllocationWarning(null); }}>Cancel</button>
            </div>
          </EstateModal>
        )}
      </div>
    );
  }

  return (
    <EstateShell
      estateId={estateId}
      estateName={estateDetail?.name}
      activeKey={isMapView ? "map" : "dashboard"}
      search={plotSearch}
      onSearchChange={setPlotSearch}
      onEstateNameChange={(value) => setEstateDetail((current: any) => current ? { ...current, name: value } : current)}
      recentActivity={activity}
    >
      {isMapView && renderToolsBar()}
      {isMapView && message && <StatusBanner text={message} tone={messageTone} />}
      {renderStatsRow()}
      {isMapView ? (
        <div ref={mapGridRef} className="edash-map-grid">
          <div className="edash-map-grid-left">
            {renderMapPanel()}
            {renderBottomRow(["activity", "progress"])}
          </div>
          {renderPlotDrawer()}
          {renderPlotContextMenu()}
        </div>
      ) : (
        <>
          <EstateOperationsSummary
            estateId={estateId}
            dashboard={dashboard}
            plots={plots}
            allocations={allocations}
            customers={customers}
            surveyRequests={surveyRequests}
            stakingTasks={stakingTasks}
            payments={estatePayments}
            documents={estateDocuments}
            publicSettings={publicSettings}
          />
          <EstateReservationRequests estateId={estateId} />
          {renderBottomRow()}
          {renderFooter()}
        </>
      )}
      {surveyStationSelection && renderSurveyStationSelectionModal()}
      {activeTool && renderActiveToolModal()}
      {showAddCustomer && (
        <EstateModal title="Add customer" onClose={() => setShowAddCustomer(false)}>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Full name</span>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoFocus />
          </label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Phone (optional)</span>
            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
          </label>
          <label className="edash-field" style={{ marginBottom: 12 }}>
            <span>Email (optional - lifecycle updates are sent here)</span>
            <input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
          </label>
          <button type="button" className="edash-btn-primary" disabled={!customerName.trim() || customerBusy} onClick={() => void createCustomer()}>
            {customerBusy ? <><Spinner size={14} /> Adding...</> : "Add customer"}
          </button>
        </EstateModal>
      )}
      {showEditPlotBoundary && selectedPlot && (
        <EstateModal title={`Edit boundary - ${selectedPlot.plot_number}`} subtitle="Drag a vertex to reshape it, or click along an edge to add a new point. The area recalculates automatically when you save." onClose={() => setShowEditPlotBoundary(false)}>
          {MAPBOX_TOKEN ? (
            <MapViewEnhanced coordinates={editPlotPoints} onCoordinatesDrawn={handleEditPlotCoordinatesDrawn} coordinateSystem="wgs84" showToolbar />
          ) : (
            <p className="edash-tab-empty">Map editing is unavailable right now.</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="edash-btn-primary" disabled={editPlotBusy || editPlotPoints.length < 3} onClick={() => void savePlotBoundary()}>
              {editPlotBusy ? <><Spinner size={14} /> Saving...</> : "Save boundary"}
            </button>
            <button type="button" className="edash-btn-outline" onClick={() => setShowEditPlotBoundary(false)}>Cancel</button>
          </div>
        </EstateModal>
      )}
      {showDeletePlotConfirm && selectedPlot && (
        <EstateModal title="Delete this plot?" subtitle="This permanently removes the plot record and cannot be undone." onClose={() => { setShowDeletePlotConfirm(false); setDeletePlotConfirmText(""); }}>
          <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
            Type <strong style={{ color: "var(--edash-ink)" }}>{selectedPlot.plot_number}</strong> to confirm you want to permanently delete this plot.
          </p>
          <label className="edash-field" style={{ marginBottom: 14 }}>
            <span>Plot number</span>
            <input value={deletePlotConfirmText} onChange={(event) => setDeletePlotConfirmText(event.target.value)} placeholder={selectedPlot.plot_number} autoFocus />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="edash-btn-primary"
              style={{ background: "var(--edash-danger)" }}
              disabled={deletePlotBusy || deletePlotConfirmText.trim() !== selectedPlot.plot_number}
              onClick={() => void deletePlot()}
            >
              {deletePlotBusy ? <><Spinner size={14} /> Deleting...</> : "Delete plot"}
            </button>
            <button type="button" className="edash-btn-outline" onClick={() => { setShowDeletePlotConfirm(false); setDeletePlotConfirmText(""); }}>Cancel</button>
          </div>
        </EstateModal>
      )}
      {showResetLayoutConfirm && (
        <EstateModal title="Reset this Estate's layout?" subtitle="This permanently deletes every plot, road, open space and drainage layer, and clears the Estate boundary, so you can start the layout over." onClose={() => { setShowResetLayoutConfirm(false); setResetLayoutConfirmText(""); }}>
          <p className="edash-status-row-desc" style={{ marginBottom: 12 }}>
            Type the Estate name, <strong style={{ color: "var(--edash-ink)" }}>{estateDetail?.name}</strong>, to confirm. Any plot with a customer reservation or allocation will block this action.
          </p>
          <label className="edash-field" style={{ marginBottom: 14 }}>
            <span>Estate name</span>
            <input value={resetLayoutConfirmText} onChange={(event) => setResetLayoutConfirmText(event.target.value)} placeholder={estateDetail?.name} autoFocus />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="edash-btn-primary"
              style={{ background: "var(--edash-danger)" }}
              disabled={resetLayoutBusy || resetLayoutConfirmText.trim() !== (estateDetail?.name || "")}
              onClick={() => void resetEstateLayout()}
            >
              {resetLayoutBusy ? <><Spinner size={14} /> Resetting...</> : "Reset layout"}
            </button>
            <button type="button" className="edash-btn-outline" onClick={() => { setShowResetLayoutConfirm(false); setResetLayoutConfirmText(""); }}>Cancel</button>
          </div>
        </EstateModal>
      )}
      {pendingLayoutApproval && (
        <EstateModal
          title="Replace the existing layout?"
          subtitle="This Estate already has an approved layout. Approving this draft will replace it - every existing plot, road, open space and drainage layer will be deleted and replaced with this draft's."
          onClose={() => setPendingLayoutApproval(null)}
        >
          <p className="edash-status-row-desc" style={{ marginBottom: 14 }}>Any plot with a customer reservation or allocation will block this and must be cleared first.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="edash-btn-primary"
              style={{ background: "var(--edash-danger)" }}
              disabled={layoutDesignerBusy}
              onClick={() => void decideLayoutProposal(pendingLayoutApproval.proposalId, "approved", { replaceExisting: true })}
            >
              {layoutDesignerBusy ? <><Spinner size={14} /> Replacing...</> : "Yes, replace layout"}
            </button>
            <button type="button" className="edash-btn-outline" onClick={() => setPendingLayoutApproval(null)}>Cancel</button>
          </div>
        </EstateModal>
      )}
      {dgpsExportPlotId !== null && (
        <EstateModal
          title={`Export DGPS CSV - ${plots.find((item) => item.id === dgpsExportPlotId)?.plot_number || "Plot"}`}
          subtitle="This plot's boundary is already subdivided, so every vertex is known - choose the coordinate system to export it in."
          onClose={() => setDgpsExportPlotId(null)}
        >
          <label className="edash-field" style={{ marginBottom: 16 }}>
            <span>Coordinate system</span>
            <CoordinateSystemSelect value={dgpsExportCoordinateSystem} onChange={setDgpsExportCoordinateSystem} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="edash-btn-primary"
              disabled={dgpsExportBusy}
              onClick={() => void downloadPlotDgpsCsv(dgpsExportPlotId, dgpsExportCoordinateSystem)}
            >
              {dgpsExportBusy ? <><Spinner size={14} /> Exporting...</> : "Download CSV"}
            </button>
            <button type="button" className="edash-btn-outline" onClick={() => setDgpsExportPlotId(null)}>Cancel</button>
          </div>
        </EstateModal>
      )}
    </EstateShell>
  );
}
