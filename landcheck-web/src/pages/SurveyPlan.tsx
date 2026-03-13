import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import { api } from "../api/client";
import toast, { Toaster } from "react-hot-toast";
import MapViewEnhanced from "../components/MapViewEnhanced";
import CoordinateInput from "../components/CoordinateInput";
import SurveyPreview from "../components/SurveyPreview";
import FeatureOverrideModal from "../components/FeatureOverrideModal";
import { fromWGS84, toWGS84 } from "../utils/coordinateConverter";
import "../styles/survey-plan.css";

type PlotMeta = {
  title_text: string;
  location_text: string;
  lga_text: string;
  state_text: string;
  surveyor_name: string;
  surveyor_rank: string;
  certification_statement: string;
  scale_text: string;
  paper_size: string;
  template_name: "general" | "adamawa_osg";
  adamawa_rof_no: string;
  adamawa_owner_name: string;
  adamawa_authority_title: string;
  adamawa_authority_date_text: string;
  adamawa_control_point_name: string;
  adamawa_northing: string;
  adamawa_easting: string;
  adamawa_elevation: string;
  adamawa_origin_text: string;
  adamawa_topo_sheet_text: string;
  adamawa_computation_no: string;
  adamawa_cadastral_sheet_no: string;
  adamawa_plan_no: string;
  adamawa_surveyed_by_text: string;
  adamawa_disclaimer_text: string;
};

type SubdivisionMethod = "by_count" | "by_area" | "by_fraction" | "by_custom_area";

type SubdivisionPreviewPlot = {
  index: number;
  lot_no: string;
  area_m2: number;
  area_hectares: number;
  geometry?: {
    type: "Polygon";
    coordinates: number[][][];
  };
};

type SubdivisionPreviewData = {
  method: SubdivisionMethod | string;
  resolved_count: number;
  requested_count?: number | null;
  target_area_m2?: number | null;
  orientation_deg?: number;
  fraction_weights?: number[] | null;
  fraction_breaks?: number[] | null;
  custom_areas_m2?: number[] | null;
  total_area_m2: number;
  derived_total_area_m2: number;
  area_imbalance_m2: number;
  plots: SubdivisionPreviewPlot[];
};

type SubdivisionBatchRow = {
  id: number;
  parent_plot_id: number;
  estate_name: string;
  method: string;
  requested_count: number | null;
  target_area_m2: number | null;
  orientation_deg: number | null;
  generated_count: number;
  total_area_m2: number;
  status: string;
  item_count: number;
  created_at?: string;
  updated_at?: string;
};

type WorkflowMode = "survey" | "subdivision";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
};

type PreviewType = "survey" | "orthophoto" | "topomap";
type TopoSource = "opentopomap" | "userdata";
type NorthArrowStyle = "one_side_stem" | "stacked_4n" | "classic" | "triangle" | "compass" | "chevron" | "orienteering" | "star";
type NorthArrowColor = "black" | "blue";
type BeaconStyle = "circle" | "square" | "triangle" | "diamond" | "cross";
type RoadWidthOption = "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30";

const DEFAULT_CERTIFICATION_STATEMENT =
  "I hereby certify that this survey plan is a true representation of the survey executed by me and conforms with the regulations of surveying profession.";
const SCALE_PRESETS = [250, 500, 1000, 2000, 5000];
const MIN_SCALE_DENOMINATOR = 100;
const MAX_SCALE_DENOMINATOR = 50000;
const DEFAULT_TEMPLATE_NAME: PlotMeta["template_name"] = "general";
const DEFAULT_ADAMAWA_AUTHORITY_TITLE = "SURVEYOR GENERAL";
const DEFAULT_ADAMAWA_AUTHORITY_DATE = "November, 2024";
const DEFAULT_ADAMAWA_ORIGIN_TEXT = "ORIGIN:- WGS 84 UTM ZONE 33N";
const DEFAULT_ADAMAWA_TOPO_SHEET_TEXT = "BASED ON GIREI TOPO SHEET 197 NE";
const DEFAULT_ADAMAWA_DISCLAIMER_TEXT =
  "Detail shewn not the result of accurate survey. All bearing and distances shewn on this plan have been computed from registered Co-ordinates.";
const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || "");
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

const parsePositiveInt = (value: string): number | null => {
  const parsed = Number.parseInt(String(value || "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parsePositiveFloat = (value: string): number | null => {
  const parsed = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseFractionWeights = (value: string): number[] => {
  const tokens = String(value || "")
    .split(/[\s,;:|/\\]+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item) && item > 0);
  return tokens.map((item) => Number(item));
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const sanitizeFractionBreaks = (raw: number[]): number[] => {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => (item > 1 && item <= 100 ? item / 100 : item))
    .filter((item) => item > 0 && item < 1)
    .sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const value of normalized) {
    if (!deduped.length || Math.abs(value - deduped[deduped.length - 1]) > 1e-6) {
      deduped.push(clamp01(value));
    }
  }
  return deduped;
};

const weightsToBreaks = (weights: number[]): number[] => {
  const positive = weights.filter((item) => Number.isFinite(item) && item > 0);
  if (positive.length < 2) return [];
  const total = positive.reduce((sum, item) => sum + item, 0);
  if (total <= 0) return [];
  const breaks: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < positive.length - 1; i += 1) {
    cumulative += positive[i] / total;
    breaks.push(clamp01(cumulative));
  }
  return sanitizeFractionBreaks(breaks);
};

const breaksToWeights = (breaks: number[]): number[] => {
  const safe = sanitizeFractionBreaks(breaks);
  if (!safe.length) return [];
  const out: number[] = [];
  let previous = 0;
  for (const point of safe) {
    out.push(Math.max(point - previous, 0));
    previous = point;
  }
  out.push(Math.max(1 - previous, 0));
  return out.filter((item) => item > 0);
};

const formatWeightsDraft = (weights: number[]): string => {
  const positive = weights.filter((item) => Number.isFinite(item) && item > 0);
  if (!positive.length) return "";
  return positive.map((item) => Number(item.toFixed(3)).toString()).join(", ");
};

const parseScaleDenominator = (scaleText: string): number => {
  const digits = String(scaleText || "").replace(/[^0-9]/g, "");
  const parsed = Number.parseInt(digits || "1000", 10);
  if (!Number.isFinite(parsed)) return 1000;
  return Math.min(MAX_SCALE_DENOMINATOR, Math.max(MIN_SCALE_DENOMINATOR, parsed));
};

const closeRingIfNeeded = (ring: number[][]): number[][] => {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
};

const polygonCentroid = (ringRaw: number[][]): [number, number] => {
  const ring = closeRingIfNeeded(ringRaw);
  if (ring.length < 4) {
    const simple = ring.reduce(
      (acc, point) => [acc[0] + Number(point[0] || 0), acc[1] + Number(point[1] || 0)],
      [0, 0]
    );
    return [simple[0] / Math.max(1, ring.length), simple[1] / Math.max(1, ring.length)];
  }

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const x0 = Number(ring[i][0] || 0);
    const y0 = Number(ring[i][1] || 0);
    const x1 = Number(ring[i + 1][0] || 0);
    const y1 = Number(ring[i + 1][1] || 0);
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const simple = ring.reduce(
      (acc, point) => [acc[0] + Number(point[0] || 0), acc[1] + Number(point[1] || 0)],
      [0, 0]
    );
    return [simple[0] / Math.max(1, ring.length), simple[1] / Math.max(1, ring.length)];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
};

const SURVEY_STEPS = [
  { id: 1, title: "Enter Coordinates", description: "Input plot boundary points" },
  { id: 2, title: "Preview & Details", description: "Review and add survey info" },
  { id: 3, title: "Export", description: "Download your documents" },
];

const SUBDIVISION_STEPS = [
  { id: 1, title: "Mother Parcel", description: "Input boundary points for the mother parcel" },
  { id: 2, title: "Subdivision Preview", description: "Configure and preview lot split before generation" },
  { id: 3, title: "Batch Export", description: "Export generated subdivision plans as ZIP" },
];

export default function SurveyPlan() {
  const navigate = useNavigate();
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const activeSteps = workflowMode === "subdivision" ? SUBDIVISION_STEPS : SURVEY_STEPS;

  // Coordinates state
  const [manualPoints, setManualPoints] = useState<ManualPoint[]>([
    { station: "A", lng: 0, lat: 0 },
    { station: "B", lng: 0, lat: 0 },
    { station: "C", lng: 0, lat: 0 },
  ]);
  const [coordinateSystem, setCoordinateSystem] = useState("wgs84");

  // Plot state
  const [loading, setLoading] = useState(false);
  const [plotId, setPlotId] = useState<number | null>(null);
  const [features, setFeatures] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [orthophotoUrl, setOrthophotoUrl] = useState<string | null>(null);
  const [orthophotoLoading, setOrthophotoLoading] = useState(false);
  const [topoMapUrl, setTopoMapUrl] = useState<string | null>(null);
  const [topoMapLoading, setTopoMapLoading] = useState(false);
  const [downloadLoadingKey, setDownloadLoadingKey] = useState<string | null>(null);
  const [hasHeightData, setHasHeightData] = useState(false);
  const [previewType, setPreviewType] = useState<PreviewType>("survey");
  const [topoSource, setTopoSource] = useState<TopoSource>("opentopomap");
  const [northArrowStyle, setNorthArrowStyle] = useState<NorthArrowStyle>("one_side_stem");
  const [northArrowColor, setNorthArrowColor] = useState<NorthArrowColor>("blue");
  const [beaconStyle, setBeaconStyle] = useState<BeaconStyle>("cross");
  const [roadWidth, setRoadWidth] = useState<RoadWidthOption>("10");
  const [scaleDraft, setScaleDraft] = useState<string>("1000");
  const [newRoadWidth, setNewRoadWidth] = useState<RoadWidthOption>("10");
  const [showFeatureEditor, setShowFeatureEditor] = useState(false);
  const [featureType, setFeatureType] = useState<"road" | "building" | "river" | "fence">("road");
  const [featureAction, setFeatureAction] = useState<"add" | "delete" | "update">("add");
  const [roadName, setRoadName] = useState("");
  const [subdivisionMethod, setSubdivisionMethod] = useState<SubdivisionMethod>("by_count");
  const [subdivisionCountDraft, setSubdivisionCountDraft] = useState("4");
  const [subdivisionTargetAreaDraft, setSubdivisionTargetAreaDraft] = useState("");
  const [subdivisionFractionDraft, setSubdivisionFractionDraft] = useState("1, 1");
  const [subdivisionFractionBreaks, setSubdivisionFractionBreaks] = useState<number[]>([0.5]);
  const [subdivisionCustomAreaDrafts, setSubdivisionCustomAreaDrafts] = useState<string[]>([]);
  const [subdivisionParentAreaM2, setSubdivisionParentAreaM2] = useState<number | null>(null);
  const [subdivisionParentAreaLoading, setSubdivisionParentAreaLoading] = useState(false);
  const [subdivisionOrientationDraft, setSubdivisionOrientationDraft] = useState("0");
  const [subdivisionLotPrefix, setSubdivisionLotPrefix] = useState("LOT");
  const [subdivisionEstateName, setSubdivisionEstateName] = useState("");
  const [subdivisionLotNamesDraft, setSubdivisionLotNamesDraft] = useState<string[]>([]);
  const [subdivisionPreview, setSubdivisionPreview] = useState<SubdivisionPreviewData | null>(null);
  const [subdivisionPreviewLoading, setSubdivisionPreviewLoading] = useState(false);
  const [subdivisionApplyLoading, setSubdivisionApplyLoading] = useState(false);
  const [subdivisionBatches, setSubdivisionBatches] = useState<SubdivisionBatchRow[]>([]);
  const [subdivisionBatchLoading, setSubdivisionBatchLoading] = useState(false);
  const [latestSubdivisionBatchId, setLatestSubdivisionBatchId] = useState<number | null>(null);
  const [subdivisionDownloadBatchId, setSubdivisionDownloadBatchId] = useState<number | null>(null);
  const [subdivisionPreviewPanelTab, setSubdivisionPreviewPanelTab] = useState<"survey_plan" | "subdivision_lines">("survey_plan");
  const [subdivisionDraggingBreakIndex, setSubdivisionDraggingBreakIndex] = useState<number | null>(null);
  const subdivisionLivePreviewTimerRef = useRef<number | null>(null);
  const subdivisionLineCanvasRef = useRef<HTMLElement | null>(null);
  const subdivisionMapContainerRef = useRef<HTMLDivElement | null>(null);
  const subdivisionMapRef = useRef<mapboxgl.Map | null>(null);
  const subdivisionMapReadyRef = useRef(false);
  const previewRequestId = useRef(0);
  const orthophotoRequestId = useRef(0);
  const topoRequestId = useRef(0);

  // Survey metadata
  const [meta, setMeta] = useState<PlotMeta>({
    title_text: "SURVEY PLAN",
    location_text: "",
    lga_text: "",
    state_text: "",
    surveyor_name: "",
    surveyor_rank: "",
    certification_statement: DEFAULT_CERTIFICATION_STATEMENT,
    scale_text: "1 : 1000",
    paper_size: "A4",
    template_name: DEFAULT_TEMPLATE_NAME,
    adamawa_rof_no: "",
    adamawa_owner_name: "",
    adamawa_authority_title: DEFAULT_ADAMAWA_AUTHORITY_TITLE,
    adamawa_authority_date_text: DEFAULT_ADAMAWA_AUTHORITY_DATE,
    adamawa_control_point_name: "",
    adamawa_northing: "",
    adamawa_easting: "",
    adamawa_elevation: "",
    adamawa_origin_text: DEFAULT_ADAMAWA_ORIGIN_TEXT,
    adamawa_topo_sheet_text: DEFAULT_ADAMAWA_TOPO_SHEET_TEXT,
    adamawa_computation_no: "",
    adamawa_cadastral_sheet_no: "",
    adamawa_plan_no: "",
    adamawa_surveyed_by_text: "",
    adamawa_disclaimer_text: DEFAULT_ADAMAWA_DISCLAIMER_TEXT,
  });

  useEffect(() => {
    setScaleDraft(String(parseScaleDenominator(meta.scale_text)));
  }, [meta.scale_text]);

  const commitScaleDraft = useCallback(() => {
    const parsed = parseScaleDenominator(scaleDraft);
    setScaleDraft(String(parsed));
    setMeta((m) => ({ ...m, scale_text: `1 : ${parsed}` }));
  }, [scaleDraft]);

  // Coordinate helpers
  const updatePoint = (index: number, key: keyof ManualPoint, value: string | number) => {
    setManualPoints((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value } as ManualPoint;
      return copy;
    });
  };

  // Generate station name: A, B, C, ... Z, AA, AB, ... AZ, BA, ... (unlimited)
  const getStationName = (index: number): string => {
    let name = "";
    let num = index;
    do {
      name = String.fromCharCode(65 + (num % 26)) + name;
      num = Math.floor(num / 26) - 1;
    } while (num >= 0);
    return name;
  };

  const removePoint = (index: number) => {
    if (manualPoints.length <= 3) {
      toast.error("Minimum 3 points required");
      return;
    }
    setManualPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const addPoint = () => {
    setManualPoints((prev) => [
      ...prev,
      {
        station: getStationName(prev.length),
        lng: 0,
        lat: 0,
      },
    ]);
  };

  // Handle bulk upload from CSV/Excel
  const handleBulkUpload = (points: ManualPoint[]) => {
    if (points.length < 3) {
      toast.error("Need at least 3 points for a valid plot boundary");
      return;
    }
    setManualPoints(points);

    // Check if points have height data
    const pointsWithHeight = points.filter(p => p.height !== undefined && p.height !== null);
    if (pointsWithHeight.length > 0) {
      setHasHeightData(true);
      toast.success(`Loaded ${points.length} coordinates with elevation data!`);
    } else {
      setHasHeightData(false);
      toast.success(`Loaded ${points.length} coordinates from file`);
    }
  };

  // Handle coordinates drawn on map (always comes in WGS84)
  // Convert to selected coordinate system for display
  const handleCoordinatesFromMap = useCallback((points: ManualPoint[]) => {
    if (coordinateSystem === "wgs84") {
      // No conversion needed
      setManualPoints(points);
    } else {
      // Convert from WGS84 to selected coordinate system
      const convertedPoints = points.map((p) => {
        if (p.lng === 0 && p.lat === 0) {
          return p;
        }
        const [x, y] = fromWGS84(p.lng, p.lat, coordinateSystem);
        return {
          station: p.station,
          lng: x, // Easting
          lat: y, // Northing
        };
      });
      setManualPoints(convertedPoints);
    }
  }, [coordinateSystem]);

  const closeRing = (pts: number[][]) => {
    if (pts.length < 3) return pts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const same = first[0] === last[0] && first[1] === last[1];
    return same ? pts : [...pts, first];
  };

  // Final coordinates for backend (always in WGS84)
  const finalCoords = useMemo(() => {
    const validPoints = manualPoints.filter(
      (p) => p.lng !== 0 || p.lat !== 0
    );
    if (validPoints.length >= 3) {
      // Convert to WGS84 if using projected coordinate system
      const pts = validPoints.map((p) => {
        if (coordinateSystem === "wgs84") {
          return [Number(p.lng), Number(p.lat)];
        }
        // Convert from projected to WGS84
        const [lng, lat] = toWGS84(Number(p.lng), Number(p.lat), coordinateSystem);
        return [lng, lat];
      });
      return closeRing(pts);
    }
    return null;
  }, [manualPoints, coordinateSystem]);

  const stationNames = useMemo(() => {
    return manualPoints.map((p) => (p.station || "").trim());
  }, [manualPoints]);

  const displayedSubdivisionLotNames = useMemo(() => {
    const plots = subdivisionPreview?.plots || [];
    if (!plots.length) return [];
    return plots.map((plot, idx) => {
      const custom = (subdivisionLotNamesDraft[idx] || "").trim();
      return custom || plot.lot_no;
    });
  }, [subdivisionPreview?.plots, subdivisionLotNamesDraft]);

  const subdivisionFractionBreaksEffective = useMemo(() => {
    if (subdivisionMethod === "by_fraction") {
      const fromState = sanitizeFractionBreaks(subdivisionFractionBreaks);
      if (fromState.length) return fromState;
      const parsedWeights = parseFractionWeights(subdivisionFractionDraft);
      return weightsToBreaks(parsedWeights);
    }
    const fromPreview = sanitizeFractionBreaks((subdivisionPreview?.fraction_breaks || []) as number[]);
    if (fromPreview.length) return fromPreview;
    return [];
  }, [
    subdivisionMethod,
    subdivisionFractionBreaks,
    subdivisionFractionDraft,
    subdivisionPreview?.fraction_breaks,
  ]);

  const subdivisionFractionWeightsEffective = useMemo(() => {
    const fromBreaks = breaksToWeights(subdivisionFractionBreaksEffective);
    if (fromBreaks.length >= 2) return fromBreaks;
    const parsed = parseFractionWeights(subdivisionFractionDraft);
    if (parsed.length >= 2) return parsed;
    return [];
  }, [subdivisionFractionBreaksEffective, subdivisionFractionDraft]);

  const subdivisionCustomLotCount = useMemo(
    () => parsePositiveInt(subdivisionCountDraft) ?? 0,
    [subdivisionCountDraft]
  );

  const subdivisionCustomAreasParsed = useMemo(
    () => subdivisionCustomAreaDrafts.map((item) => parsePositiveFloat(item) ?? 0),
    [subdivisionCustomAreaDrafts]
  );

  const subdivisionCustomAllocatedM2 = useMemo(
    () => subdivisionCustomAreasParsed.reduce((sum, value) => sum + value, 0),
    [subdivisionCustomAreasParsed]
  );

  const subdivisionCustomRemainingM2 = useMemo(() => {
    if (!Number.isFinite(Number(subdivisionParentAreaM2))) return null;
    return Number(subdivisionParentAreaM2) - subdivisionCustomAllocatedM2;
  }, [subdivisionParentAreaM2, subdivisionCustomAllocatedM2]);

  const subdivisionSvgPreview = useMemo(() => {
    if (!subdivisionPreview?.plots?.length) return null;

    const normalized = subdivisionPreview.plots
      .map((plot) => {
        const ringRaw = (plot.geometry?.coordinates?.[0] || [])
          .map((point) => [Number(point?.[0]), Number(point?.[1])])
          .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
        if (ringRaw.length < 3) return null;
        return {
          ...plot,
          ring: closeRingIfNeeded(ringRaw),
          centroid: polygonCentroid(ringRaw),
        };
      })
      .filter(Boolean) as Array<
      SubdivisionPreviewPlot & {
        ring: number[][];
        centroid: [number, number];
      }
    >;

    if (!normalized.length) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    normalized.forEach((plot) => {
      plot.ring.forEach((point) => {
        minX = Math.min(minX, point[0]);
        maxX = Math.max(maxX, point[0]);
        minY = Math.min(minY, point[1]);
        maxY = Math.max(maxY, point[1]);
      });
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    const width = 900;
    const height = 620;
    const padding = 42;
    const dx = Math.max(1e-9, maxX - minX);
    const dy = Math.max(1e-9, maxY - minY);
    const scale = Math.min((width - padding * 2) / dx, (height - padding * 2) / dy);
    const contentWidth = dx * scale;
    const contentHeight = dy * scale;
    const offsetX = (width - contentWidth) / 2;
    const offsetY = (height - contentHeight) / 2;

    const mapPoint = (point: [number, number]) => ({
      x: offsetX + (point[0] - minX) * scale,
      y: height - (offsetY + (point[1] - minY) * scale),
    });

    const palette = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6"];

    const plots = normalized.map((plot, idx) => {
      const projected = plot.ring.map((pt) => mapPoint([pt[0], pt[1]]));
      const path = `${projected
        .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
        .join(" ")} Z`;
      const centroidProjected = mapPoint(plot.centroid);
      return {
        idx,
        lotNo: displayedSubdivisionLotNames[idx] || plot.lot_no,
        areaM2: plot.area_m2,
        areaHa: plot.area_hectares,
        path,
        stroke: palette[idx % palette.length],
        labelX: Math.max(26, Math.min(width - 26, centroidProjected.x)),
        labelY: Math.max(24, Math.min(height - 24, centroidProjected.y)),
      };
    });

    return {
      width,
      height,
      plots,
    };
  }, [subdivisionPreview, displayedSubdivisionLotNames]);

  const subdivisionMapPreviewData = useMemo(() => {
    if (!subdivisionPreview?.plots?.length) return null;

    const polygons: any[] = [];
    const labels: any[] = [];
    const stations: any[] = [];

    subdivisionPreview.plots.forEach((plot, idx) => {
      const ring = (plot.geometry?.coordinates?.[0] || [])
        .map((point) => [Number(point?.[0]), Number(point?.[1])])
        .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (ring.length < 3) return;
      const cleanRing = closeRingIfNeeded(ring as number[][]);
      const centroid = polygonCentroid(cleanRing);
      const lotNo = displayedSubdivisionLotNames[idx] || plot.lot_no;

      polygons.push({
        type: "Feature",
        properties: {
          lotNo,
          areaHa: Number(plot.area_hectares || 0),
        },
        geometry: {
          type: "Polygon",
          coordinates: [cleanRing],
        },
      });

      labels.push({
        type: "Feature",
        properties: {
          label: `${lotNo}\n${Number(plot.area_hectares || 0).toFixed(3)} ha`,
        },
        geometry: {
          type: "Point",
          coordinates: [Number(centroid[0]), Number(centroid[1])],
        },
      });

      cleanRing.slice(0, -1).forEach((coord, stationIdx) => {
        stations.push({
          type: "Feature",
          properties: {
            station: getStationName(stationIdx),
            lotNo,
          },
          geometry: {
            type: "Point",
            coordinates: [Number(coord[0]), Number(coord[1])],
          },
        });
      });
    });

    if (!polygons.length) return null;
    return {
      polygons: {
        type: "FeatureCollection",
        features: polygons,
      },
      labels: {
        type: "FeatureCollection",
        features: labels,
      },
      stations: {
        type: "FeatureCollection",
        features: stations,
      },
    };
  }, [subdivisionPreview, displayedSubdivisionLotNames]);

  const fitSubdivisionMapToData = useCallback((map: mapboxgl.Map, fc: any) => {
    if (!fc?.features?.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    let hasCoords = false;
    fc.features.forEach((feature: any) => {
      const rings = feature?.geometry?.coordinates || [];
      rings.forEach((ring: any[]) => {
        ring.forEach((coord: any[]) => {
          const lng = Number(coord?.[0]);
          const lat = Number(coord?.[1]);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            bounds.extend([lng, lat]);
            hasCoords = true;
          }
        });
      });
    });
    if (!hasCoords) return;
    map.fitBounds(bounds, { padding: 64, maxZoom: 19, duration: 0 });
  }, []);

  useEffect(() => {
    const shouldShowSubdivisionMap =
      workflowMode === "subdivision" && currentStep === 2 && subdivisionPreviewPanelTab === "subdivision_lines";

    if (!shouldShowSubdivisionMap) {
      if (subdivisionMapRef.current) {
        subdivisionMapRef.current.remove();
        subdivisionMapRef.current = null;
      }
      subdivisionMapReadyRef.current = false;
      return;
    }

    if (!subdivisionMapContainerRef.current) return;
    if (!MAPBOX_TOKEN) return;

    if (subdivisionMapRef.current) {
      const existingContainer = subdivisionMapRef.current.getContainer();
      if (existingContainer === subdivisionMapContainerRef.current) {
        subdivisionMapRef.current.resize();
        return;
      }
      subdivisionMapRef.current.remove();
      subdivisionMapRef.current = null;
      subdivisionMapReadyRef.current = false;
    }

    const map = new mapboxgl.Map({
      container: subdivisionMapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [7.5, 9.0],
      zoom: 6,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => {
      subdivisionMapReadyRef.current = true;

      map.addSource("subdivision-lots-src", {
        type: "geojson",
        data: (subdivisionMapPreviewData?.polygons || { type: "FeatureCollection", features: [] }) as any,
      });
      map.addLayer({
        id: "subdivision-lots-fill",
        type: "fill",
        source: "subdivision-lots-src",
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.18,
        },
      });
      map.addLayer({
        id: "subdivision-lots-line",
        type: "line",
        source: "subdivision-lots-src",
        paint: {
          "line-color": "#22c55e",
          "line-width": 2.4,
        },
      });

      map.addSource("subdivision-lots-labels-src", {
        type: "geojson",
        data: (subdivisionMapPreviewData?.labels || { type: "FeatureCollection", features: [] }) as any,
      });
      map.addLayer({
        id: "subdivision-lots-labels",
        type: "symbol",
        source: "subdivision-lots-labels-src",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
          "text-anchor": "center",
        },
        paint: {
          "text-color": "#ecfdf5",
          "text-halo-color": "#0f172a",
          "text-halo-width": 1.3,
        },
      });

      map.addSource("subdivision-stations-src", {
        type: "geojson",
        data: (subdivisionMapPreviewData?.stations || { type: "FeatureCollection", features: [] }) as any,
      });
      map.addLayer({
        id: "subdivision-stations-circle",
        type: "circle",
        source: "subdivision-stations-src",
        paint: {
          "circle-radius": 3.2,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.0,
        },
      });
      map.addLayer({
        id: "subdivision-stations-label",
        type: "symbol",
        source: "subdivision-stations-src",
        layout: {
          "text-field": ["get", "station"],
          "text-size": 10,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, -1.1],
          "text-anchor": "bottom",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#f8fafc",
          "text-halo-color": "#0f172a",
          "text-halo-width": 1.0,
        },
      });

      if (subdivisionMapPreviewData?.polygons) {
        fitSubdivisionMapToData(map, subdivisionMapPreviewData.polygons);
      }
    });

    subdivisionMapRef.current = map;
  }, [
    workflowMode,
    currentStep,
    subdivisionPreviewPanelTab,
    subdivisionMapPreviewData,
    fitSubdivisionMapToData,
  ]);

  useEffect(() => {
    const map = subdivisionMapRef.current;
    if (!map || !subdivisionMapReadyRef.current) return;
    const polySource = map.getSource("subdivision-lots-src") as mapboxgl.GeoJSONSource | undefined;
    const labelSource = map.getSource("subdivision-lots-labels-src") as mapboxgl.GeoJSONSource | undefined;
    const stationSource = map.getSource("subdivision-stations-src") as mapboxgl.GeoJSONSource | undefined;
    if (polySource && subdivisionMapPreviewData?.polygons) {
      polySource.setData(subdivisionMapPreviewData.polygons as any);
      fitSubdivisionMapToData(map, subdivisionMapPreviewData.polygons);
    }
    if (labelSource && subdivisionMapPreviewData?.labels) {
      labelSource.setData(subdivisionMapPreviewData.labels as any);
    }
    if (stationSource && subdivisionMapPreviewData?.stations) {
      stationSource.setData(subdivisionMapPreviewData.stations as any);
    }
  }, [subdivisionMapPreviewData, fitSubdivisionMapToData]);

  useEffect(() => {
    if (subdivisionPreviewPanelTab !== "subdivision_lines") return;
    if (!subdivisionMapRef.current) return;
    window.setTimeout(() => {
      subdivisionMapRef.current?.resize();
    }, 0);
  }, [subdivisionPreviewPanelTab]);

  useEffect(() => {
    return () => {
      if (subdivisionMapRef.current) {
        subdivisionMapRef.current.remove();
        subdivisionMapRef.current = null;
      }
      subdivisionMapReadyRef.current = false;
    };
  }, []);

  const subdivisionTargetDisplayM2 = useMemo(() => {
    const fromPreview = Number(subdivisionPreview?.target_area_m2);
    if (Number.isFinite(fromPreview) && fromPreview > 0) return fromPreview;
    const fromDraft = parsePositiveFloat(subdivisionTargetAreaDraft);
    return fromDraft ?? 0;
  }, [subdivisionPreview?.target_area_m2, subdivisionTargetAreaDraft]);

  const subdivisionOrientationDisplayDeg = useMemo(() => {
    const fromPreview = Number(subdivisionPreview?.orientation_deg);
    if (Number.isFinite(fromPreview)) return fromPreview;
    const fromDraft = Number.parseFloat(subdivisionOrientationDraft || "0");
    if (Number.isFinite(fromDraft)) return fromDraft;
    return 0;
  }, [subdivisionPreview?.orientation_deg, subdivisionOrientationDraft]);

  // Check if coordinates are valid
  const hasValidCoords = useMemo(() => {
    const validPoints = manualPoints.filter(
      (p) => (p.lng !== 0 || p.lat !== 0) && !isNaN(p.lng) && !isNaN(p.lat)
    );
    return validPoints.length >= 3;
  }, [manualPoints]);

  // Convert form coordinates to WGS84 for map display
  const mapCoordinates = useMemo(() => {
    if (coordinateSystem === "wgs84") {
      return manualPoints;
    }
    // Convert projected coordinates to WGS84 for map
    return manualPoints.map((p) => {
      if (p.lng === 0 && p.lat === 0) {
        return p;
      }
      const [lng, lat] = toWGS84(p.lng, p.lat, coordinateSystem);
      return {
        station: p.station,
        lng,
        lat,
      };
    });
  }, [manualPoints, coordinateSystem]);

  // Save plot to localStorage for dashboard
  const savePlotToStorage = (id: number) => {
    const STORAGE_KEY = "landcheck_plots";
    const stored = localStorage.getItem(STORAGE_KEY);
    const plots = stored ? JSON.parse(stored) : [];

    const newPlot = {
      id,
      createdAt: new Date().toISOString(),
      title: meta.title_text,
      location: meta.location_text,
      scale: meta.scale_text,
      coordinates: manualPoints,
    };

    // Add to beginning of list (most recent first)
    plots.unshift(newPlot);

    // Keep only last 50 plots
    if (plots.length > 50) {
      plots.pop();
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(plots));
  };

  // Create plot on backend
  const createPlot = async () => {
    if (!finalCoords) {
      toast.error("Enter at least 3 valid coordinate points");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/plots", {
        coordinates: finalCoords,
      });
      const id = res.data.plot_id ?? res.data.id;
      setPlotId(id);
      setSubdivisionPreview(null);
      setSubdivisionLotNamesDraft([]);
      setSubdivisionFractionDraft("1, 1");
      setSubdivisionFractionBreaks([0.5]);
      setSubdivisionCustomAreaDrafts([]);
      setSubdivisionParentAreaM2(null);
      setSubdivisionBatches([]);
      setLatestSubdivisionBatchId(null);

      // Save to localStorage for dashboard
      savePlotToStorage(id);

      const featureRes = await api.get(`/plots/${id}/features`);
      setFeatures(featureRes.data);

      toast.success("Plot created successfully!");
      if (workflowMode === "subdivision") {
        setSubdivisionPreviewPanelTab("survey_plan");
      }
      setCurrentStep(2);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create plot");
    } finally {
      setLoading(false);
    }
  };

  const buildPlotMetaPayload = useCallback(() => {
    return {
      title_text: meta.title_text,
      location_text: meta.location_text,
      lga_text: meta.lga_text,
      state_text: meta.state_text,
      scale_text: meta.scale_text,
      surveyor_name: meta.surveyor_name,
      surveyor_rank: meta.surveyor_rank,
      certification_statement: meta.certification_statement,
      coordinate_system: coordinateSystem,
      paper_size: meta.paper_size,
      template_name: meta.template_name,
      adamawa_rof_no: meta.adamawa_rof_no,
      adamawa_owner_name: meta.adamawa_owner_name,
      adamawa_authority_title: meta.adamawa_authority_title,
      adamawa_authority_date_text: meta.adamawa_authority_date_text,
      adamawa_control_point_name: "",
      adamawa_northing: "",
      adamawa_easting: "",
      adamawa_elevation: "",
      adamawa_origin_text: "",
      adamawa_topo_sheet_text: meta.adamawa_topo_sheet_text,
      adamawa_computation_no: meta.adamawa_rof_no,
      adamawa_cadastral_sheet_no: meta.adamawa_cadastral_sheet_no,
      adamawa_plan_no: meta.adamawa_rof_no,
      adamawa_surveyed_by_text: "",
      adamawa_disclaimer_text: meta.adamawa_disclaimer_text,
    };
  }, [meta, coordinateSystem]);

  // Load preview image
  const loadPreview = useCallback(async () => {
    if (!plotId) return;

    const requestId = ++previewRequestId.current;
    setPreviewLoading(true);
    try {
      const payload = {
        ...buildPlotMetaPayload(),
        station_names: stationNames,
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
        beacon_style: beaconStyle,
        road_width_m: Number(roadWidth),
      };

      const res = await api.post(`/plots/${plotId}/report/preview`, payload, {
        responseType: "blob",
      });

      if (requestId !== previewRequestId.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("Preview error:", err);
      toast.error("Failed to load preview");
    } finally {
      if (requestId === previewRequestId.current) {
        setPreviewLoading(false);
      }
    }
  }, [plotId, stationNames, northArrowStyle, northArrowColor, beaconStyle, roadWidth, buildPlotMetaPayload]);

  // Debounce preview refresh while users type metadata.
  useEffect(() => {
    if (currentStep === 2 && plotId && previewType === "survey") {
      const timer = window.setTimeout(() => {
        loadPreview();
      }, 450);
      return () => window.clearTimeout(timer);
    }
  }, [currentStep, plotId, previewType, loadPreview]);

  // Load orthophoto preview (satellite imagery)
  const loadOrthophoto = useCallback(async () => {
    if (!plotId) return;

    const requestId = ++orthophotoRequestId.current;
    setOrthophotoLoading(true);
    try {
      const res = await api.post(`/plots/${plotId}/orthophoto/preview`, {
        scale_text: meta.scale_text,
        station_names: stationNames,
        coordinate_system: coordinateSystem,
        paper_size: meta.paper_size,
        use_topo_map: false, // Always satellite for orthophoto
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
      }, {
        responseType: "blob",
      });

      if (requestId !== orthophotoRequestId.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setOrthophotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("Orthophoto preview error:", err);
      toast.error("Failed to load orthophoto preview");
    } finally {
      if (requestId === orthophotoRequestId.current) {
        setOrthophotoLoading(false);
      }
    }
  }, [plotId, meta.scale_text, stationNames, coordinateSystem, meta.paper_size, northArrowStyle, northArrowColor]);

  // Load topo map preview (OpenTopoMap tiles or user height data)
  const loadTopoMap = useCallback(async (source: "opentopomap" | "userdata" = "opentopomap") => {
    if (!plotId) return;

    const requestId = ++topoRequestId.current;
    setTopoMapLoading(true);

    try {
      const res = await api.post(`/plots/${plotId}/orthophoto/preview`, {
        scale_text: meta.scale_text,
        station_names: stationNames,
        coordinate_system: coordinateSystem,
        paper_size: meta.paper_size,
        use_topo_map: true, // Always topo for topo map
        topo_source: source, // "opentopomap" or "userdata"
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
      }, {
        responseType: "blob",
      });

      if (requestId !== topoRequestId.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setTopoMapUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("Topo map preview error:", err);
      toast.error("Failed to load topo map preview");
    } finally {
      if (requestId === topoRequestId.current) {
        setTopoMapLoading(false);
      }
    }
  }, [plotId, meta.scale_text, stationNames, coordinateSystem, meta.paper_size, northArrowStyle, northArrowColor]);

  // Debounce orthophoto/topo refresh to avoid repeated heavy tile fetches.
  useEffect(() => {
    if (!plotId) return;
    if (currentStep !== 2 && currentStep !== 3) return;

    if (previewType === "orthophoto") {
      const timer = window.setTimeout(() => {
        loadOrthophoto();
      }, 500);
      return () => window.clearTimeout(timer);
    }

    if (previewType === "topomap") {
      const timer = window.setTimeout(() => {
        loadTopoMap(topoSource);
      }, 500);
      return () => window.clearTimeout(timer);
    }
  }, [
    plotId,
    currentStep,
    previewType,
    topoSource,
    meta.scale_text,
    meta.paper_size,
    northArrowStyle,
    northArrowColor,
    loadOrthophoto,
    loadTopoMap,
  ]);

  useEffect(() => {
    if (workflowMode === "subdivision" && currentStep === 2 && previewType !== "survey") {
      setPreviewType("survey");
    }
  }, [workflowMode, currentStep, previewType]);

  // Reset everything
  const resetAll = () => {
    setWorkflowMode(null);
    setManualPoints([
      { station: "A", lng: 0, lat: 0 },
      { station: "B", lng: 0, lat: 0 },
      { station: "C", lng: 0, lat: 0 },
    ]);
    setCoordinateSystem("wgs84");
    setPlotId(null);
    setFeatures(null);
    setPreviewUrl(null);
    setOrthophotoUrl(null);
    setTopoMapUrl(null);
    setCurrentStep(1);
    setHasHeightData(false);
    setPreviewType("survey");
    setTopoSource("opentopomap");
    setNorthArrowStyle("one_side_stem");
    setNorthArrowColor("blue");
    setBeaconStyle("cross");
    setRoadWidth("10");
    setSubdivisionMethod("by_count");
    setSubdivisionCountDraft("4");
    setSubdivisionTargetAreaDraft("");
    setSubdivisionFractionDraft("1, 1");
    setSubdivisionFractionBreaks([0.5]);
    setSubdivisionCustomAreaDrafts([]);
    setSubdivisionParentAreaM2(null);
    setSubdivisionParentAreaLoading(false);
    setSubdivisionOrientationDraft("0");
    setSubdivisionLotPrefix("LOT");
    setSubdivisionEstateName("");
    setSubdivisionLotNamesDraft([]);
    setSubdivisionPreview(null);
    setSubdivisionPreviewLoading(false);
    setSubdivisionApplyLoading(false);
    setSubdivisionBatches([]);
    setSubdivisionBatchLoading(false);
    setLatestSubdivisionBatchId(null);
    setSubdivisionDownloadBatchId(null);
    setMeta({
      title_text: "SURVEY PLAN",
      location_text: "",
      lga_text: "",
      state_text: "",
      surveyor_name: "",
      surveyor_rank: "",
      certification_statement: DEFAULT_CERTIFICATION_STATEMENT,
      scale_text: "1 : 1000",
      paper_size: "A4",
      template_name: DEFAULT_TEMPLATE_NAME,
      adamawa_rof_no: "",
      adamawa_owner_name: "",
      adamawa_authority_title: DEFAULT_ADAMAWA_AUTHORITY_TITLE,
      adamawa_authority_date_text: DEFAULT_ADAMAWA_AUTHORITY_DATE,
      adamawa_control_point_name: "",
      adamawa_northing: "",
      adamawa_easting: "",
      adamawa_elevation: "",
      adamawa_origin_text: DEFAULT_ADAMAWA_ORIGIN_TEXT,
      adamawa_topo_sheet_text: DEFAULT_ADAMAWA_TOPO_SHEET_TEXT,
      adamawa_computation_no: "",
      adamawa_cadastral_sheet_no: "",
      adamawa_plan_no: "",
      adamawa_surveyed_by_text: "",
      adamawa_disclaimer_text: DEFAULT_ADAMAWA_DISCLAIMER_TEXT,
    });
    toast("Reset completed");
  };

  const triggerBlobDownload = (blobData: BlobPart, contentType: string | undefined, filename: string) => {
    const blob = new Blob([blobData], { type: contentType || "application/octet-stream" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  // Download function for PDF endpoints that need JSON body
  const downloadWithJson = async (
    url: string,
    filename: string,
    loadingKey: string,
    useTopoMap = false,
    customTitle?: string
  ) => {
    if (downloadLoadingKey) return;
    setDownloadLoadingKey(loadingKey);
    try {
      // Use custom title if provided, otherwise use meta title
      const titleText = customTitle || meta.title_text;

      const payload = {
        title_text: titleText,
        location_text: meta.location_text,
        lga_text: meta.lga_text,
        state_text: meta.state_text,
        scale_text: meta.scale_text,
        surveyor_name: meta.surveyor_name,
        surveyor_rank: meta.surveyor_rank,
        certification_statement: meta.certification_statement,
        station_names: stationNames,
        coordinate_system: coordinateSystem,
        paper_size: meta.paper_size,
        use_topo_map: useTopoMap,
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
        beacon_style: beaconStyle,
        road_width_m: Number(roadWidth),
        template_name: meta.template_name,
        adamawa_rof_no: meta.adamawa_rof_no,
        adamawa_owner_name: meta.adamawa_owner_name,
        adamawa_authority_title: meta.adamawa_authority_title,
        adamawa_authority_date_text: meta.adamawa_authority_date_text,
        adamawa_control_point_name: "",
        adamawa_northing: "",
        adamawa_easting: "",
        adamawa_elevation: "",
        adamawa_origin_text: "",
        adamawa_topo_sheet_text: meta.adamawa_topo_sheet_text,
        adamawa_computation_no: meta.adamawa_rof_no,
        adamawa_cadastral_sheet_no: meta.adamawa_cadastral_sheet_no,
        adamawa_plan_no: meta.adamawa_rof_no,
        adamawa_surveyed_by_text: "",
        adamawa_disclaimer_text: meta.adamawa_disclaimer_text,
      };

      const res = await api.post(url, payload, { responseType: "blob" });
      triggerBlobDownload(res.data, res.headers["content-type"], filename);

      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to download file");
    } finally {
      setDownloadLoadingKey((prev) => (prev === loadingKey ? null : prev));
    }
  };

  const downloadWithGet = async (url: string, filename: string, loadingKey: string) => {
    if (downloadLoadingKey) return;
    setDownloadLoadingKey(loadingKey);
    try {
      const res = await api.get(url, { responseType: "blob" });
      triggerBlobDownload(res.data, res.headers["content-type"], filename);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to download file");
    } finally {
      setDownloadLoadingKey((prev) => (prev === loadingKey ? null : prev));
    }
  };

  const loadSubdivisionBatches = useCallback(async () => {
    if (!plotId) return;
    setSubdivisionBatchLoading(true);
    try {
      const res = await api.get(`/plots/${plotId}/subdivision/batches`);
      const rows = Array.isArray(res.data) ? (res.data as SubdivisionBatchRow[]) : [];
      setSubdivisionBatches(rows);
      setLatestSubdivisionBatchId((prev) => prev ?? (rows[0]?.id ?? null));
    } catch (err) {
      console.error("Failed to load subdivision batches:", err);
    } finally {
      setSubdivisionBatchLoading(false);
    }
  }, [plotId]);

  useEffect(() => {
    if (!plotId) {
      setSubdivisionBatches([]);
      return;
    }
    if (currentStep < 2) return;
    loadSubdivisionBatches();
  }, [plotId, currentStep, loadSubdivisionBatches]);

  useEffect(() => {
    if (!plotId || workflowMode !== "subdivision" || currentStep < 2) return;
    let cancelled = false;
    setSubdivisionParentAreaLoading(true);
    api
      .get(`/plots/${plotId}/report`)
      .then((res) => {
        if (cancelled) return;
        const area = Number(res?.data?.area_m2);
        setSubdivisionParentAreaM2(Number.isFinite(area) && area > 0 ? area : null);
      })
      .catch(() => {
        if (cancelled) return;
        setSubdivisionParentAreaM2(null);
      })
      .finally(() => {
        if (!cancelled) {
          setSubdivisionParentAreaLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plotId, workflowMode, currentStep]);

  useEffect(() => {
    if (subdivisionMethod !== "by_custom_area") return;
    const count = parsePositiveInt(subdivisionCountDraft) ?? 0;
    if (count < 2) return;

    setSubdivisionCustomAreaDrafts((prev) =>
      Array.from({ length: count }, (_, idx) => prev[idx] ?? "")
    );
    setSubdivisionLotNamesDraft((prev) =>
      Array.from({ length: count }, (_, idx) => {
        const existing = (prev[idx] || "").trim();
        if (existing) return existing;
        const prefix = (subdivisionLotPrefix || "LOT").trim().toUpperCase() || "LOT";
        return `${prefix}-${String(idx + 1).padStart(3, "0")}`;
      })
    );
  }, [subdivisionMethod, subdivisionCountDraft, subdivisionLotPrefix]);

  useEffect(() => {
    return () => {
      if (subdivisionLivePreviewTimerRef.current !== null) {
        window.clearTimeout(subdivisionLivePreviewTimerRef.current);
      }
    };
  }, []);

  const getSubdivisionBreakValueFromClientX = useCallback(
    (clientX: number): number | null => {
      const canvas = subdivisionLineCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || rect.width <= 0) return null;
      return clamp01((clientX - rect.left) / rect.width);
    },
    []
  );

  const stopSubdivisionBreakDrag = useCallback(() => {
    setSubdivisionDraggingBreakIndex(null);
  }, []);

  const applySubdivisionPreviewResponse = useCallback((data: SubdivisionPreviewData) => {
    setSubdivisionPreview(data);

    const apiBreaks = sanitizeFractionBreaks((data.fraction_breaks || []) as number[]);
    if (apiBreaks.length) {
      setSubdivisionFractionBreaks(apiBreaks);
      const apiWeights =
        Array.isArray(data.fraction_weights) && data.fraction_weights.length >= 2
          ? data.fraction_weights.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
          : breaksToWeights(apiBreaks);
      if (apiWeights.length >= 2) {
        setSubdivisionFractionDraft(formatWeightsDraft(apiWeights));
      }
    }

    if (Array.isArray(data.custom_areas_m2) && data.custom_areas_m2.length >= 2) {
      setSubdivisionCustomAreaDrafts(data.custom_areas_m2.map((value) => Number(value).toFixed(2)));
      setSubdivisionCountDraft(String(data.custom_areas_m2.length));
    }

    if (Array.isArray(data.plots) && data.plots.length) {
      setSubdivisionLotNamesDraft((prev) =>
        data.plots.map((plot, idx) => {
          const existing = (prev[idx] || "").trim();
          return existing || plot.lot_no;
        })
      );
    }
  }, []);

  const buildSubdivisionPayload = useCallback(
    (silent = false) => {
      const count = parsePositiveInt(subdivisionCountDraft);
      const targetArea = parsePositiveFloat(subdivisionTargetAreaDraft);
      const orientationDeg = Number.parseFloat(subdivisionOrientationDraft || "0");
      const lotPrefix = (subdivisionLotPrefix || "LOT").trim() || "LOT";

      if (subdivisionMethod === "by_count" && (count === null || count < 2)) {
        if (!silent) toast.error("Set derived plot count to 2 or more.");
        return null;
      }
      if (subdivisionMethod === "by_area" && (targetArea === null || targetArea <= 0)) {
        if (!silent) toast.error("Set a positive target area in square meters.");
        return null;
      }

      const payload: Record<string, any> = {
        method: subdivisionMethod,
        split_count: subdivisionMethod === "by_count" ? count : null,
        target_area_m2: subdivisionMethod === "by_area" ? targetArea : null,
        orientation_deg: Number.isFinite(orientationDeg) ? orientationDeg : 0,
        lot_prefix: lotPrefix,
        estate_name: subdivisionEstateName.trim(),
      };

      if (subdivisionMethod === "by_fraction") {
        const effectiveBreaks = sanitizeFractionBreaks(subdivisionFractionBreaksEffective);
        const effectiveWeights = subdivisionFractionWeightsEffective;
        if (effectiveWeights.length < 2) {
          if (!silent) toast.error("Provide at least two fraction values (example: 2, 3, 5).");
          return null;
        }
        payload.fraction_weights = effectiveWeights;
        payload.fraction_breaks = effectiveBreaks;
        payload.split_count = effectiveWeights.length;
      }

      if (subdivisionMethod === "by_custom_area") {
        if (count === null || count < 2) {
          if (!silent) toast.error("Set number of lots to 2 or more.");
          return null;
        }
        const customAreas = Array.from({ length: count }, (_, idx) => parsePositiveFloat(subdivisionCustomAreaDrafts[idx] || ""));
        if (customAreas.some((value) => value === null || (value as number) <= 0)) {
          if (!silent) toast.error("Enter a valid positive area for each lot.");
          return null;
        }
        const areaValues = customAreas as number[];
        const allocated = areaValues.reduce((sum, value) => sum + value, 0);
        if (Number.isFinite(Number(subdivisionParentAreaM2)) && Number(subdivisionParentAreaM2) > 0) {
          const parentArea = Number(subdivisionParentAreaM2);
          const tolerance = 0.01;
          if (allocated > parentArea + tolerance) {
            if (!silent) toast.error(`Custom areas exceed mother parcel by ${(allocated - parentArea).toFixed(2)} sqm.`);
            return null;
          }
          if (allocated < parentArea - tolerance) {
            if (!silent) toast.error(`Custom areas are short by ${(parentArea - allocated).toFixed(2)} sqm. Allocate full area.`);
            return null;
          }
        }
        payload.custom_areas_m2 = areaValues;
        payload.split_count = count;
      }

      const lotNames = subdivisionLotNamesDraft.map((value) => String(value || "").trim());
      if (lotNames.some((value) => value.length > 0)) {
        payload.lot_names = lotNames;
      }

      return payload;
    },
    [
      subdivisionCountDraft,
      subdivisionTargetAreaDraft,
      subdivisionOrientationDraft,
      subdivisionLotPrefix,
      subdivisionEstateName,
      subdivisionMethod,
      subdivisionFractionBreaksEffective,
      subdivisionFractionWeightsEffective,
      subdivisionCustomAreaDrafts,
      subdivisionParentAreaM2,
      subdivisionLotNamesDraft,
    ]
  );

  const previewSubdivision = useCallback(
    async (silent = false) => {
      if (!plotId) return;
      const payload = buildSubdivisionPayload(silent);
      if (!payload) return;

      setSubdivisionPreviewLoading(true);
      try {
        const res = await api.post(`/plots/${plotId}/subdivision/preview`, payload);
        applySubdivisionPreviewResponse(res.data as SubdivisionPreviewData);
        if (!silent) {
          toast.success("Subdivision preview ready.");
        }
      } catch (err: any) {
        if (!silent) {
          const detail = err?.response?.data?.detail;
          toast.error(typeof detail === "string" ? detail : "Failed to preview subdivision.");
        }
      } finally {
        setSubdivisionPreviewLoading(false);
      }
    },
    [plotId, buildSubdivisionPayload, applySubdivisionPreviewResponse]
  );

  const scheduleSubdivisionLivePreview = useCallback(() => {
    if (!plotId || workflowMode !== "subdivision" || currentStep !== 2) return;
    if (subdivisionLivePreviewTimerRef.current !== null) {
      window.clearTimeout(subdivisionLivePreviewTimerRef.current);
    }
    subdivisionLivePreviewTimerRef.current = window.setTimeout(() => {
      previewSubdivision(true);
    }, 450);
  }, [plotId, workflowMode, currentStep, previewSubdivision]);

  const applySubdivision = async () => {
    if (!plotId) return;
    const payload = buildSubdivisionPayload(false);
    if (!payload) return;

    // Persist latest metadata quickly (without rendering preview) before generating child plots.
    try {
      await api.post(`/plots/${plotId}/meta`, buildPlotMetaPayload());
    } catch {
      toast.error("Could not save latest survey details before batch generation.");
      return;
    }

    setSubdivisionApplyLoading(true);
    try {
      const res = await api.post(`/plots/${plotId}/subdivision/apply`, {
        ...payload,
        include_feature_detection: false,
      });
      const batchId = Number(res?.data?.batch_id || 0) || null;
      if (batchId) {
        setLatestSubdivisionBatchId(batchId);
      }
      await loadSubdivisionBatches();
      const generated = Number(res?.data?.generated_count || 0);
      toast.success(`Subdivision generated (${generated} plots).`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to generate subdivision batch.");
    } finally {
      setSubdivisionApplyLoading(false);
    }
  };

  const updateSubdivisionLotName = useCallback((index: number, value: string) => {
    setSubdivisionLotNamesDraft((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const updateSubdivisionCustomAreaDraft = useCallback((index: number, value: string) => {
    setSubdivisionCustomAreaDrafts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const commitSubdivisionFractionDraft = useCallback(() => {
    const weights = parseFractionWeights(subdivisionFractionDraft);
    if (weights.length < 2) {
      toast.error("Enter at least two fraction values, for example 2, 3, 5.");
      return;
    }
    const breaks = weightsToBreaks(weights);
    setSubdivisionFractionBreaks(breaks);
    setSubdivisionFractionDraft(formatWeightsDraft(weights));
    scheduleSubdivisionLivePreview();
  }, [subdivisionFractionDraft, scheduleSubdivisionLivePreview]);

  const updateSubdivisionFractionBreak = useCallback(
    (index: number, nextBreakValue: number) => {
      setSubdivisionFractionBreaks((prev) => {
        if (!prev.length || index < 0 || index >= prev.length) return prev;
        const minGap = 0.02;
        const lower = index === 0 ? minGap : prev[index - 1] + minGap;
        const upper = index === prev.length - 1 ? 1 - minGap : prev[index + 1] - minGap;
        const clamped = Math.max(lower, Math.min(upper, nextBreakValue));
        const next = [...prev];
        next[index] = clamp01(clamped);
        const weights = breaksToWeights(next);
        if (weights.length >= 2) {
          setSubdivisionFractionDraft(formatWeightsDraft(weights));
        }
        return next;
      });
      scheduleSubdivisionLivePreview();
    },
    [scheduleSubdivisionLivePreview]
  );

  const startSubdivisionBreakDrag = useCallback(
    (index: number, clientX: number) => {
      if (subdivisionMethod !== "by_fraction") return;
      setSubdivisionDraggingBreakIndex(index);
      const nextBreak = getSubdivisionBreakValueFromClientX(clientX);
      if (nextBreak !== null) {
        updateSubdivisionFractionBreak(index, nextBreak);
      }
    },
    [subdivisionMethod, getSubdivisionBreakValueFromClientX, updateSubdivisionFractionBreak]
  );

  useEffect(() => {
    if (subdivisionDraggingBreakIndex === null) return;
    if (subdivisionMethod !== "by_fraction") {
      setSubdivisionDraggingBreakIndex(null);
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextBreak = getSubdivisionBreakValueFromClientX(event.clientX);
      if (nextBreak === null) return;
      updateSubdivisionFractionBreak(subdivisionDraggingBreakIndex, nextBreak);
    };

    const handlePointerEnd = () => {
      setSubdivisionDraggingBreakIndex(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [
    subdivisionDraggingBreakIndex,
    subdivisionMethod,
    getSubdivisionBreakValueFromClientX,
    updateSubdivisionFractionBreak,
  ]);

  const downloadSubdivisionBatch = async (batchId: number) => {
    if (subdivisionDownloadBatchId !== null) return;
    setSubdivisionDownloadBatchId(batchId);
    try {
      const res = await api.get(`/plots/subdivision/batches/${batchId}/export/survey-plans.zip`, {
        responseType: "blob",
      });
      triggerBlobDownload(
        res.data,
        res.headers["content-type"],
        `subdivision_batch_${batchId}_survey_plans.zip`
      );
      toast.success("Batch survey plans ZIP downloaded.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to download subdivision batch.");
    } finally {
      setSubdivisionDownloadBatchId(null);
    }
  };

  // Get feature counts from nested response structure
  const getFeatureCount = (type: string) => {
    if (!features) return 0;
    const insideCount = features.inside?.[type] || 0;
    const bufferCount = features.buffer?.[type] || 0;
    return insideCount + bufferCount;
  };

  const handleSaveOverride = async (payload: { feature_type: "road" | "building" | "river" | "fence"; action: "add" | "delete" | "update"; name?: string; width_m?: number; geojson: any }) => {
    if (!plotId) return;
    try {
      await api.post(`/plots/${plotId}/feature-overrides`, payload);
      toast.success("Feature saved");
      setShowFeatureEditor(false);
      setPreviewUrl(null);
      setOrthophotoUrl(null);
      setTopoMapUrl(null);
      setTimeout(() => {
        loadPreview();
        if (previewType === "orthophoto") loadOrthophoto();
        if (previewType === "topomap") loadTopoMap(topoSource);
      }, 250);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save feature");
    }
  };

  return (
    <div
      className={`survey-container${workflowMode ? " has-workflow" : ""}${
        workflowMode && currentStep === 2 ? " is-preview-step" : ""
      }${workflowMode === "subdivision" ? " is-subdivision-flow" : ""}${
        workflowMode === "survey" ? " is-survey-flow" : ""
      }`}
    >
      <Toaster position="top-right" />

      {/* Header */}
      <header className="survey-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <h1 className="survey-title">
          {workflowMode === "survey" ? "Survey Plan Production" : workflowMode === "subdivision" ? "Plot Subdivision" : "Survey Plan"}
        </h1>
        <button className="reset-btn" onClick={resetAll}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Reset
        </button>
      </header>

      {/* Progress Stepper */}
      {workflowMode && (
        <div className="stepper">
          {activeSteps.map((step, index) => (
            <div
              key={step.id}
              className={`step ${currentStep >= step.id ? "active" : ""} ${currentStep > step.id ? "completed" : ""}`}
            >
              <div className="step-indicator">
                {currentStep > step.id ? (
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <div className="step-content">
                <span className="step-title">{step.title}</span>
                <span className="step-desc">{step.description}</span>
              </div>
              {index < activeSteps.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="survey-content">
        {!workflowMode && (
          <div className="mode-select-shell">
            <div className="mode-select-head">
              <h2>Choose Workflow</h2>
              <p>Select how you want to use Survey Plan in this session.</p>
            </div>
            <div className="mode-card-grid">
              <button
                type="button"
                className="mode-card"
                onClick={() => {
                  setWorkflowMode("survey");
                  setPreviewType("survey");
                  setCurrentStep(1);
                }}
              >
                <div className="mode-card-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5h10a2 2 0 0 1 2 2v12H6a2 2 0 0 0-2 2z" />
                    <path d="M16 7h4v12a2 2 0 0 1-2 2h-8" />
                    <path d="M8 10h6M8 13h6M8 16h4" />
                  </svg>
                </div>
                <h3>Survey Plan Production</h3>
                <p>Create one parcel plan, preview map layout, and export all standard documents.</p>
                <span className="mode-card-cta">Use Survey Plan Production</span>
              </button>
              <button
                type="button"
                className="mode-card"
                onClick={() => {
                  setWorkflowMode("subdivision");
                  setPreviewType("survey");
                  setSubdivisionPreviewPanelTab("survey_plan");
                  setCurrentStep(1);
                }}
              >
                <div className="mode-card-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3h18v18H3z" />
                    <path d="M3 12h18M12 3v18" />
                    <path d="M3 8h9M12 16h9" />
                  </svg>
                </div>
                <h3>Plot Subdivision</h3>
                <p>Split a mother parcel into multiple lots, preview lot outputs, then export batch survey plans.</p>
                <span className="mode-card-cta">Use Plot Subdivision</span>
              </button>
            </div>
          </div>
        )}

        {workflowMode === "survey" && (
          <FeatureOverrideModal
          isOpen={showFeatureEditor}
          onClose={() => setShowFeatureEditor(false)}
          onSave={handleSaveOverride}
          plotCoords={finalCoords}
          featureType={featureType}
          setFeatureType={setFeatureType}
          action={featureAction}
          setAction={setFeatureAction}
          roadName={roadName}
          setRoadName={setRoadName}
          roadWidth={newRoadWidth}
          setRoadWidth={setNewRoadWidth}
          plotId={plotId}
        />
        )}
        {/* Step 1: Coordinate Input */}
        {workflowMode && currentStep === 1 && (
          <div className="step-panel">
            <div className="panel-left">
              <CoordinateInput
                points={manualPoints}
                onUpdatePoint={updatePoint}
                onRemovePoint={removePoint}
                onAddPoint={addPoint}
                onBulkUpload={handleBulkUpload}
                disabled={loading}
                coordinateSystem={coordinateSystem}
                onCoordinateSystemChange={setCoordinateSystem}
              />
              <div className="action-bar">
                <button
                  className="btn-primary"
                  disabled={!hasValidCoords || loading}
                  onClick={createPlot}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Creating Plot...
                    </>
                  ) : (
                    <>
                      {workflowMode === "subdivision" ? "Create Mother Parcel & Continue" : "Create Plot & Continue"}
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <MapViewEnhanced
                coordinates={mapCoordinates}
                onCoordinatesDrawn={handleCoordinatesFromMap}
                disabled={loading}
              />
            </div>
          </div>
        )}

        {/* Step 2: Preview & Details (Survey Plan Production) */}
        {workflowMode === "survey" && currentStep === 2 && (
          <div className="step-panel preview-panel">
            <div className="panel-left">
              {/* Features Summary - Horizontal Compact Layout (moved to top) */}
              {features && (
                <div className="features-bar">
                  <span className="features-bar-label">Detected:</span>
                  <div className="features-bar-items">
                    <div className="feature-chip building">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 3v15M9 9v.01M9 12v.01M9 15v.01M17 9v.01M17 12v.01M17 15v.01" />
                      </svg>
                      <span className="chip-count">{getFeatureCount("building")}</span>
                      <span className="chip-label">Buildings</span>
                    </div>
                    <div className="feature-chip road">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19L8 5M16 19L20 5M12 19V5M8 10H6M18 10h-2M8 14H6M18 14h-2" />
                      </svg>
                      <span className="chip-count">{getFeatureCount("road")}</span>
                      <span className="chip-label">Roads</span>
                    </div>
                    <div className="feature-chip river">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7c3-2 6-2 9 0s6 2 9 0M3 12c3-2 6-2 9 0s6 2 9 0M3 17c3-2 6-2 9 0s6 2 9 0" />
                      </svg>
                      <span className="chip-count">{getFeatureCount("river")}</span>
                      <span className="chip-label">Rivers</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-section">
                <h3 className="section-title">Survey Details</h3>
                <div className="form-grid">
                  <div className="form-group full-width template-selector-group">
                    <label>Template</label>
                    <select
                      value={meta.template_name}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          template_name: e.target.value as PlotMeta["template_name"],
                        }))
                      }
                    >
                      <option value="general">General</option>
                      <option value="adamawa_osg">Adamawa OSG</option>
                    </select>
                    {meta.template_name === "adamawa_osg" && (
                      <span className="template-hint">
                        Adamawa OSG template 
                      </span>
                    )}
                  </div>
                  {meta.template_name === "general" ? (
                    <>
                      <div className="form-group">
                        <label>Title</label>
                        <input
                          value={meta.title_text}
                          onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))}
                          placeholder="SURVEY PLAN"
                        />
                      </div>
                      <div className="form-group">
                        <label>Location</label>
                        <input
                          value={meta.location_text}
                          onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))}
                          placeholder="Enter location"
                        />
                      </div>
                      <div className="form-group">
                        <label>LGA</label>
                        <input
                          value={meta.lga_text}
                          onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))}
                          placeholder="Local Government Area"
                        />
                      </div>
                      <div className="form-group">
                        <label>State</label>
                        <input
                          value={meta.state_text}
                          onChange={(e) => setMeta((m) => ({ ...m, state_text: e.target.value }))}
                          placeholder="Enter state"
                        />
                      </div>
                      <div className="form-group">
                        <label>Surveyor Name</label>
                        <input
                          value={meta.surveyor_name}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))}
                          placeholder="Enter surveyor name"
                        />
                      </div>
                      <div className="form-group">
                        <label>Rank</label>
                        <input
                          value={meta.surveyor_rank}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))}
                          placeholder="Surveyor rank"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Certification Statement (Editable)</label>
                        <textarea
                          value={meta.certification_statement}
                          onChange={(e) => setMeta((m) => ({ ...m, certification_statement: e.target.value }))}
                          placeholder={DEFAULT_CERTIFICATION_STATEMENT}
                          rows={3}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-group">
                        <label>R of O Number</label>
                        <input
                          value={meta.adamawa_rof_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_rof_no: e.target.value }))}
                          placeholder="E.G ADS50530"
                        />
                      </div>
                      <div className="form-group">
                        <label>Owner Name</label>
                        <input
                          value={meta.adamawa_owner_name}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_owner_name: e.target.value }))}
                          placeholder="LAND OWNER NAME"
                        />
                      </div>
                      <div className="form-group">
                        <label>Location (AT)</label>
                        <input
                          value={meta.location_text}
                          onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))}
                          placeholder="LOCATION"
                        />
                      </div>
                      <div className="form-group">
                        <label>Local Government</label>
                        <input
                          value={meta.lga_text}
                          onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))}
                          placeholder="LOCAL GOVERNMENT"
                        />
                      </div>
                      <div className="form-group">
                        <label>Authority Title</label>
                        <input
                          value={meta.adamawa_authority_title}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_title: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_AUTHORITY_TITLE}
                        />
                      </div>
                      <div className="form-group">
                        <label>Authority Date</label>
                        <input
                          value={meta.adamawa_authority_date_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_date_text: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_AUTHORITY_DATE}
                        />
                      </div>
                      <div className="form-group">
                        <label>Surveyor Name</label>
                        <input
                          value={meta.surveyor_name}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))}
                          placeholder="Survor Name"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Control Data Source</label>
                        <input value="Auto from plotted coordinates/stations (read-only)" readOnly />
                      </div>
                      <div className="form-group">
                        <label>Cadastral Sheet No</label>
                        <input
                          value={meta.adamawa_cadastral_sheet_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_cadastral_sheet_no: e.target.value }))}
                          placeholder="07"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Topo Sheet Text</label>
                        <input
                          value={meta.adamawa_topo_sheet_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_topo_sheet_text: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_TOPO_SHEET_TEXT}
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Disclaimer Text</label>
                        <textarea
                          value={meta.adamawa_disclaimer_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_disclaimer_text: e.target.value }))}
                          rows={2}
                          placeholder={DEFAULT_ADAMAWA_DISCLAIMER_TEXT}
                        />
                      </div>
                    </>
                  )}
                  <div className="form-group scale-group">
                    <label>Scale</label>
                    <div className="scale-input-wrapper">
                      <span className="scale-prefix">1 :</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={scaleDraft}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setScaleDraft(val);
                        }}
                        onBlur={commitScaleDraft}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitScaleDraft();
                          }
                        }}
                        className="scale-number-input"
                        placeholder="1000"
                        aria-label="Scale denominator"
                      />
                    </div>
                    <span className="scale-helper">Type only the number after `1 :` (example: `1000`).</span>
                    <div className="scale-presets">
                      {SCALE_PRESETS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`scale-preset-btn ${parseScaleDenominator(meta.scale_text) === s ? "active" : ""}`}
                          onClick={() => {
                            setScaleDraft(String(s));
                            setMeta((m) => ({ ...m, scale_text: `1 : ${s}` }));
                          }}
                        >
                          1:{s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group paper-size-group">
                    <label>Paper Size</label>
                    <div className="paper-size-presets">
                      {["A4", "A3", "A2", "A1", "A0"].map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={`paper-size-btn ${meta.paper_size === size ? "active" : ""}`}
                          onClick={() => setMeta((m) => ({ ...m, paper_size: size }))}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                    <span className="paper-size-hint">
                      {meta.paper_size === "A4" && "Standard (210 x 297 mm)"}
                      {meta.paper_size === "A3" && "Large (297 x 420 mm)"}
                      {meta.paper_size === "A2" && "Extra Large (420 x 594 mm)"}
                      {meta.paper_size === "A1" && "Poster (594 x 841 mm)"}
                      {meta.paper_size === "A0" && "Maximum (841 x 1189 mm)"}
                    </span>
                  </div>
                </div>

                <div className="edit-feature-bar">
                  <button className="btn-secondary" onClick={loadPreview} disabled={previewLoading}>
                    {previewLoading ? "Updating..." : "Update Preview"}
                  </button>
                  <button className="btn-outline" onClick={() => setShowFeatureEditor(true)} disabled={!plotId}>
                    Edit Features
                  </button>
                </div>
              </div>
              <div className="action-bar">
                <button className="btn-outline" onClick={() => setCurrentStep(1)}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back to Coordinates
                </button>
                <button className="btn-primary" onClick={() => setCurrentStep(3)}>
                  Continue to Export
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="panel-right preview-container">
              <SurveyPreview
                previewType={previewType}
                onPreviewTypeChange={setPreviewType}
                topoSource={topoSource}
                onTopoSourceChange={setTopoSource}
                northArrowStyle={northArrowStyle}
                northArrowColor={northArrowColor}
                beaconStyle={beaconStyle}
                roadWidth={roadWidth}
                onNorthArrowStyleChange={(value) => setNorthArrowStyle(value as NorthArrowStyle)}
                onNorthArrowColorChange={(value) => setNorthArrowColor(value as NorthArrowColor)}
                onBeaconStyleChange={(value) => setBeaconStyle(value as BeaconStyle)}
                onRoadWidthChange={(value) => setRoadWidth(value as RoadWidthOption)}
                paperSize={meta.paper_size}
                surveyPreviewUrl={previewUrl}
                orthophotoPreviewUrl={orthophotoUrl}
                topoMapPreviewUrl={topoMapUrl}
                loading={previewLoading}
                orthophotoLoading={orthophotoLoading}
                topoMapLoading={topoMapLoading}
                hasHeightData={hasHeightData}
              />
            </div>
          </div>
        )}

        {/* Step 2: Subdivision Preview */}
        {workflowMode === "subdivision" && currentStep === 2 && (
          <div className="step-panel preview-panel">
            <div className="panel-left">
              <div className="form-section subdivision-section">
                <h3 className="section-title">Plot Subdivision & Batch Plans</h3>
                <p className="section-desc">
                  Configure lot split for this mother parcel, preview output, then generate a batch.
                </p>
                <div className="form-grid">
                  <div className="form-group full-width template-selector-group">
                    <label>Template</label>
                    <select
                      value={meta.template_name}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          template_name: e.target.value as PlotMeta["template_name"],
                        }))
                      }
                    >
                      <option value="general">General</option>
                      <option value="adamawa_osg">Adamawa OSG</option>
                    </select>
                    {meta.template_name === "adamawa_osg" && (
                      <span className="template-hint">
                        Adamawa OSG template
                      </span>
                    )}
                  </div>
                  {meta.template_name === "general" ? (
                    <>
                      <div className="form-group">
                        <label>Title</label>
                        <input
                          value={meta.title_text}
                          onChange={(e) => setMeta((m) => ({ ...m, title_text: e.target.value }))}
                          placeholder="SURVEY PLAN"
                        />
                      </div>
                      <div className="form-group">
                        <label>Location</label>
                        <input
                          value={meta.location_text}
                          onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))}
                          placeholder="Enter location"
                        />
                      </div>
                      <div className="form-group">
                        <label>LGA</label>
                        <input
                          value={meta.lga_text}
                          onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))}
                          placeholder="Local Government Area"
                        />
                      </div>
                      <div className="form-group">
                        <label>State</label>
                        <input
                          value={meta.state_text}
                          onChange={(e) => setMeta((m) => ({ ...m, state_text: e.target.value }))}
                          placeholder="Enter state"
                        />
                      </div>
                      <div className="form-group">
                        <label>Surveyor Name</label>
                        <input
                          value={meta.surveyor_name}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))}
                          placeholder="Enter surveyor name"
                        />
                      </div>
                      <div className="form-group">
                        <label>Rank</label>
                        <input
                          value={meta.surveyor_rank}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_rank: e.target.value }))}
                          placeholder="Surveyor rank"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Certification Statement (Editable)</label>
                        <textarea
                          value={meta.certification_statement}
                          onChange={(e) => setMeta((m) => ({ ...m, certification_statement: e.target.value }))}
                          placeholder={DEFAULT_CERTIFICATION_STATEMENT}
                          rows={3}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-group">
                        <label>R of O Number</label>
                        <input
                          value={meta.adamawa_rof_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_rof_no: e.target.value }))}
                          placeholder="E.G ADS50530"
                        />
                      </div>
                      <div className="form-group">
                        <label>Owner Name</label>
                        <input
                          readOnly
                          value="Auto from lot names in this subdivision batch"
                        />
                      </div>
                      <div className="form-group">
                        <label>Location (AT)</label>
                        <input
                          value={meta.location_text}
                          onChange={(e) => setMeta((m) => ({ ...m, location_text: e.target.value }))}
                          placeholder="LOCATION"
                        />
                      </div>
                      <div className="form-group">
                        <label>Local Government</label>
                        <input
                          value={meta.lga_text}
                          onChange={(e) => setMeta((m) => ({ ...m, lga_text: e.target.value }))}
                          placeholder="LOCAL GOVERNMENT"
                        />
                      </div>
                      <div className="form-group">
                        <label>Authority Title</label>
                        <input
                          value={meta.adamawa_authority_title}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_title: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_AUTHORITY_TITLE}
                        />
                      </div>
                      <div className="form-group">
                        <label>Authority Date</label>
                        <input
                          value={meta.adamawa_authority_date_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_authority_date_text: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_AUTHORITY_DATE}
                        />
                      </div>
                      <div className="form-group">
                        <label>Surveyor Name</label>
                        <input
                          value={meta.surveyor_name}
                          onChange={(e) => setMeta((m) => ({ ...m, surveyor_name: e.target.value }))}
                          placeholder="Surveyor Name"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Control Data Source</label>
                        <input value="Auto from plotted coordinates/stations (read-only)" readOnly />
                      </div>
                      <div className="form-group">
                        <label>Cadastral Sheet No</label>
                        <input
                          value={meta.adamawa_cadastral_sheet_no}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_cadastral_sheet_no: e.target.value }))}
                          placeholder="07"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Topo Sheet Text</label>
                        <input
                          value={meta.adamawa_topo_sheet_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_topo_sheet_text: e.target.value }))}
                          placeholder={DEFAULT_ADAMAWA_TOPO_SHEET_TEXT}
                        />
                      </div>
                      <div className="form-group full-width">
                        <label>Disclaimer Text</label>
                        <textarea
                          value={meta.adamawa_disclaimer_text}
                          onChange={(e) => setMeta((m) => ({ ...m, adamawa_disclaimer_text: e.target.value }))}
                          rows={2}
                          placeholder={DEFAULT_ADAMAWA_DISCLAIMER_TEXT}
                        />
                      </div>
                    </>
                  )}
                  <div className="form-group scale-group">
                    <label>Scale</label>
                    <div className="scale-input-wrapper">
                      <span className="scale-prefix">1 :</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={scaleDraft}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setScaleDraft(val);
                        }}
                        onBlur={commitScaleDraft}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitScaleDraft();
                          }
                        }}
                        className="scale-number-input"
                        placeholder="1000"
                        aria-label="Scale denominator"
                      />
                    </div>
                    <span className="scale-helper">Type only the number after `1 :` (example: `1000`).</span>
                    <div className="scale-presets">
                      {SCALE_PRESETS.map((s) => (
                        <button
                          key={`sub_scale_${s}`}
                          type="button"
                          className={`scale-preset-btn ${parseScaleDenominator(meta.scale_text) === s ? "active" : ""}`}
                          onClick={() => {
                            setScaleDraft(String(s));
                            setMeta((m) => ({ ...m, scale_text: `1 : ${s}` }));
                          }}
                        >
                          1:{s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group paper-size-group">
                    <label>Paper Size</label>
                    <div className="paper-size-presets">
                      {["A4", "A3", "A2", "A1", "A0"].map((size) => (
                        <button
                          key={`sub_size_${size}`}
                          type="button"
                          className={`paper-size-btn ${meta.paper_size === size ? "active" : ""}`}
                          onClick={() => setMeta((m) => ({ ...m, paper_size: size }))}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                    <span className="paper-size-hint">
                      {meta.paper_size === "A4" && "Standard (210 x 297 mm)"}
                      {meta.paper_size === "A3" && "Large (297 x 420 mm)"}
                      {meta.paper_size === "A2" && "Extra Large (420 x 594 mm)"}
                      {meta.paper_size === "A1" && "Poster (594 x 841 mm)"}
                      {meta.paper_size === "A0" && "Maximum (841 x 1189 mm)"}
                    </span>
                  </div>
                </div>

                <div className="edit-feature-bar">
                  <button className="btn-secondary" onClick={loadPreview} disabled={previewLoading}>
                    {previewLoading ? "Updating preview..." : "Update Parcel Preview"}
                  </button>
                </div>

                <hr className="subdivision-divider" />
                <div className="form-grid">
                  <div className="form-group">
                    <label>Subdivision Method</label>
                    <select
                      value={subdivisionMethod}
                      onChange={(e) => {
                        const nextMethod = e.target.value as SubdivisionMethod;
                        setSubdivisionMethod(nextMethod);
                        if (nextMethod === "by_fraction") {
                          let weights = subdivisionFractionWeightsEffective;
                          if (weights.length < 2) {
                            const fallbackCount = Math.max(2, Number(subdivisionPreview?.resolved_count || 0) || 2);
                            weights = Array.from({ length: fallbackCount }, () => 1);
                          }
                          const breaks = weightsToBreaks(weights);
                          if (breaks.length) {
                            setSubdivisionFractionBreaks(breaks);
                          }
                          setSubdivisionFractionDraft(formatWeightsDraft(weights));
                        }
                        if (nextMethod === "by_custom_area") {
                          const fallbackCount = Math.max(2, parsePositiveInt(subdivisionCountDraft) ?? subdivisionPreview?.resolved_count ?? 2);
                          setSubdivisionCountDraft(String(fallbackCount));
                          setSubdivisionCustomAreaDrafts((prev) =>
                            Array.from({ length: fallbackCount }, (_, idx) => prev[idx] ?? "")
                          );
                        }
                      }}
                    >
                      <option value="by_count">Split by number of plots</option>
                      <option value="by_area">Split by target plot area (sqm)</option>
                      <option value="by_fraction">Split by fractions</option>
                      <option value="by_custom_area">Split by custom lot areas</option>
                    </select>
                  </div>
                  {subdivisionMethod === "by_count" ? (
                    <div className="form-group">
                      <label>Derived Plot Count</label>
                      <input
                        type="number"
                        min={2}
                        max={500}
                        value={subdivisionCountDraft}
                        onChange={(e) => setSubdivisionCountDraft(e.target.value)}
                        placeholder="e.g. 20"
                      />
                    </div>
                  ) : subdivisionMethod === "by_area" ? (
                    <div className="form-group">
                      <label>Target Plot Area (sqm)</label>
                      <input
                        type="number"
                        min={1}
                        value={subdivisionTargetAreaDraft}
                        onChange={(e) => setSubdivisionTargetAreaDraft(e.target.value)}
                        placeholder="e.g. 450"
                      />
                    </div>
                  ) : subdivisionMethod === "by_fraction" ? (
                    <div className="form-group full-width">
                      <label>Fractions (comma separated)</label>
                      <input
                        value={subdivisionFractionDraft}
                        onChange={(e) => setSubdivisionFractionDraft(e.target.value)}
                        onBlur={commitSubdivisionFractionDraft}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitSubdivisionFractionDraft();
                          }
                        }}
                        placeholder="e.g. 2, 3, 5"
                      />
                      <span className="scale-helper">
                        Example `2,3,5` means 20%, 30%, 50%. Drag division lines directly in Subdivision Line Preview.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label>Number of Lots</label>
                        <input
                          type="number"
                          min={2}
                          max={500}
                          value={subdivisionCountDraft}
                          onChange={(e) => setSubdivisionCountDraft(e.target.value)}
                          placeholder="e.g. 5"
                        />
                      </div>
                      <div className="form-group">
                        <label>Mother Parcel Area (sqm)</label>
                        <input
                          readOnly
                          value={
                            subdivisionParentAreaLoading
                              ? "Loading area..."
                              : subdivisionParentAreaM2
                              ? subdivisionParentAreaM2.toFixed(2)
                              : "Area unavailable"
                          }
                        />
                      </div>
                      <div className="form-group full-width">
                        <span className="scale-helper">
                          Allocate area for each lot below. Total allocated area must not exceed the mother parcel area.
                        </span>
                      </div>
                    </>
                  )}
                  <div className="form-group">
                    <label>Orientation (degrees)</label>
                    <input
                      type="number"
                      value={subdivisionOrientationDraft}
                      onChange={(e) => setSubdivisionOrientationDraft(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Lot Prefix</label>
                    <input
                      value={subdivisionLotPrefix}
                      onChange={(e) => setSubdivisionLotPrefix(e.target.value.toUpperCase())}
                      placeholder="LOT"
                      maxLength={16}
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>Estate / Layout Name (Optional)</label>
                    <input
                      value={subdivisionEstateName}
                      onChange={(e) => setSubdivisionEstateName(e.target.value)}
                      placeholder="e.g. Think Green Estate Phase 1"
                    />
                  </div>
                </div>

                {subdivisionMethod === "by_fraction" && (
                  <p className="subdivision-note subdivision-break-hint">
                    Division-line editing is now on-canvas: open <strong>Subdivision Line Preview</strong> and drag the vertical guides.
                  </p>
                )}

                {subdivisionMethod === "by_custom_area" && subdivisionCustomLotCount >= 2 && (
                  <div className="subdivision-custom-areas-wrap">
                    <div className="subdivision-custom-areas-head">
                      <h5>Custom Lot Area Allocation</h5>
                      <span>
                        Allocated: {subdivisionCustomAllocatedM2.toFixed(2)} sqm
                        {subdivisionCustomRemainingM2 !== null && (
                          <> | Remaining: {subdivisionCustomRemainingM2.toFixed(2)} sqm</>
                        )}
                      </span>
                    </div>
                    <div className="subdivision-table-wrap">
                      <table className="subdivision-table">
                        <thead>
                          <tr>
                            <th>Lot / Owner Name</th>
                            <th>Custom Area (sqm)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: subdivisionCustomLotCount }).map((_, idx) => (
                            <tr key={`custom_area_row_${idx}`}>
                              <td>
                                <input
                                  className="subdivision-lot-name-input"
                                  value={subdivisionLotNamesDraft[idx] ?? ""}
                                  onChange={(e) => updateSubdivisionLotName(idx, e.target.value)}
                                  placeholder={`Lot ${idx + 1} name`}
                                />
                              </td>
                              <td>
                                <input
                                  className="subdivision-lot-name-input"
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={subdivisionCustomAreaDrafts[idx] ?? ""}
                                  onChange={(e) => updateSubdivisionCustomAreaDraft(idx, e.target.value)}
                                  placeholder="0.00"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {subdivisionCustomRemainingM2 !== null && subdivisionCustomRemainingM2 < -0.01 && (
                      <p className="subdivision-validation-error">
                        Allocated area exceeds mother parcel by {Math.abs(subdivisionCustomRemainingM2).toFixed(2)} sqm.
                      </p>
                    )}
                    {subdivisionCustomRemainingM2 !== null && subdivisionCustomRemainingM2 > 0.01 && (
                      <p className="subdivision-note">
                        Remaining unallocated area: {subdivisionCustomRemainingM2.toFixed(2)} sqm. Allocate full area before preview.
                      </p>
                    )}
                  </div>
                )}

                <div className="subdivision-action-row">
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setSubdivisionPreviewPanelTab("subdivision_lines");
                      previewSubdivision(false);
                    }}
                    disabled={!plotId || subdivisionPreviewLoading || subdivisionApplyLoading}
                  >
                    {subdivisionPreviewLoading ? (
                      <>
                        <span className="spinner" />
                        Computing...
                      </>
                    ) : (
                      "Preview Split"
                    )}
                  </button>
                </div>

                <div className="subdivision-help-card">
                  <div className="subdivision-help-row">
                    <strong>Orientation</strong>
                    <span>
                      {Number.isFinite(Number(subdivisionOrientationDraft)) ? Number(subdivisionOrientationDraft).toFixed(1) : "0.0"} deg
                      {" - "}rotates split-line direction.
                    </span>
                  </div>
                  <div className="subdivision-help-row">
                    <strong>Target by area</strong>
                    <span>
                      {subdivisionMethod === "by_area"
                        ? `${(parsePositiveFloat(subdivisionTargetAreaDraft) || 0).toLocaleString()} sqm per lot (approx).`
                        : subdivisionMethod === "by_fraction"
                        ? "Uses your fractions and draggable preview guides to control each lot share."
                        : subdivisionMethod === "by_custom_area"
                        ? "Uses exact per-lot areas you enter. Total must match mother parcel area."
                        : "Not used in by-count mode; lots are balanced by area."}
                    </span>
                  </div>
                  {subdivisionPreview && (
                    <div className="subdivision-help-row">
                      <strong>Computed output</strong>
                      <span>
                        {subdivisionPreview.resolved_count} plots, total {subdivisionPreview.derived_total_area_m2.toFixed(2)} sqm.
                      </span>
                    </div>
                  )}
                </div>

                {subdivisionPreview && (
                  <div className="subdivision-preview-wrap">
                    <div className="subdivision-kpis">
                      <div className="subdivision-kpi">
                        <span className="subdivision-kpi-label">Derived plots</span>
                        <strong>{subdivisionPreview.resolved_count}</strong>
                      </div>
                      <div className="subdivision-kpi">
                        <span className="subdivision-kpi-label">Mother parcel area</span>
                        <strong>{subdivisionPreview.total_area_m2.toFixed(2)} sqm</strong>
                      </div>
                      <div className="subdivision-kpi">
                        <span className="subdivision-kpi-label">Area imbalance</span>
                        <strong>{Math.abs(subdivisionPreview.area_imbalance_m2).toFixed(4)} sqm</strong>
                      </div>
                    </div>
                    <div className="subdivision-table-wrap">
                      <table className="subdivision-table">
                        <thead>
                          <tr>
                            <th>Lot / Owner Name</th>
                            <th>Area (sqm)</th>
                            <th>Area (ha)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subdivisionPreview.plots.slice(0, 12).map((item) => (
                            <tr key={`sub_lot_${item.index}`}>
                              <td>
                                <input
                                  className="subdivision-lot-name-input"
                                  value={subdivisionLotNamesDraft[item.index - 1] ?? item.lot_no}
                                  onChange={(e) => updateSubdivisionLotName(item.index - 1, e.target.value)}
                                  placeholder="Lot name / owner"
                                />
                              </td>
                              <td>{item.area_m2.toFixed(2)}</td>
                              <td>{item.area_hectares.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {subdivisionPreview.plots.length > 12 && (
                      <p className="subdivision-note">
                        Showing first 12 lots in preview. Total generated lots: {subdivisionPreview.plots.length}.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="subdivision-batch-wrap">
                <div className="subdivision-batch-header">
                  <h4>Generated Batches</h4>
                  <button
                    className="btn-outline btn-mini"
                    onClick={loadSubdivisionBatches}
                    disabled={!plotId || subdivisionBatchLoading}
                  >
                    {subdivisionBatchLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                {subdivisionBatches.length === 0 ? (
                  <p className="subdivision-note">No subdivision batches generated yet for this mother parcel.</p>
                ) : (
                  <div className="subdivision-batch-list">
                    {subdivisionBatches.slice(0, 6).map((batch) => (
                      <div key={batch.id} className="subdivision-batch-item">
                        <div>
                          <strong>Batch #{batch.id}</strong>
                          <div className="subdivision-note">
                            {batch.method} - {batch.generated_count} plots - {(batch.total_area_m2 ?? 0).toFixed(2)} sqm
                          </div>
                        </div>
                        <button
                          className="download-btn"
                          disabled={subdivisionDownloadBatchId !== null}
                          onClick={() => downloadSubdivisionBatch(batch.id)}
                        >
                          {subdivisionDownloadBatchId === batch.id ? "Downloading..." : "Export ZIP"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="action-bar">
                <button className="btn-outline" onClick={() => setCurrentStep(1)}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back to Mother Parcel
                </button>
                <button
                  className="btn-secondary"
                  onClick={applySubdivision}
                  disabled={!plotId || subdivisionApplyLoading || subdivisionPreviewLoading}
                >
                  {subdivisionApplyLoading ? (
                    <>
                      <span className="spinner" />
                      Generating...
                    </>
                  ) : (
                    "Generate Batch"
                  )}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => setCurrentStep(3)}
                  disabled={subdivisionBatches.length === 0}
                >
                  Continue to Batch Export
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="panel-right preview-container">
              <div className="subdivision-right-wrap">
                <div className="subdivision-right-header">
                  <h4>{subdivisionPreviewPanelTab === "survey_plan" ? "Survey Plan Preview" : "Subdivision Line Preview"}</h4>
                  <span>
                    {subdivisionPreviewPanelTab === "survey_plan"
                      ? "Review the rendered survey plan before exporting."
                      : subdivisionMethod === "by_fraction"
                      ? "Drag vertical guides to adjust lot fractions live."
                      : "Each lot boundary + area label"}
                  </span>
                  <div className="subdivision-right-tabs" role="tablist" aria-label="Subdivision preview tabs">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={subdivisionPreviewPanelTab === "survey_plan"}
                      className={`subdivision-right-tab ${subdivisionPreviewPanelTab === "survey_plan" ? "active" : ""}`}
                      onClick={() => setSubdivisionPreviewPanelTab("survey_plan")}
                    >
                      Survey Plan Preview
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={subdivisionPreviewPanelTab === "subdivision_lines"}
                      className={`subdivision-right-tab ${subdivisionPreviewPanelTab === "subdivision_lines" ? "active" : ""}`}
                      onClick={() => setSubdivisionPreviewPanelTab("subdivision_lines")}
                    >
                      Subdivision Line Preview
                    </button>
                  </div>
                </div>
                {subdivisionPreviewPanelTab === "survey_plan" ? (
                  <div className="subdivision-survey-wrap">
                    <SurveyPreview
                      previewType={previewType}
                      onPreviewTypeChange={setPreviewType}
                      topoSource={topoSource}
                      onTopoSourceChange={setTopoSource}
                      northArrowStyle={northArrowStyle}
                      northArrowColor={northArrowColor}
                      beaconStyle={beaconStyle}
                      roadWidth={roadWidth}
                      onNorthArrowStyleChange={(value) => setNorthArrowStyle(value as NorthArrowStyle)}
                      onNorthArrowColorChange={(value) => setNorthArrowColor(value as NorthArrowColor)}
                      onBeaconStyleChange={(value) => setBeaconStyle(value as BeaconStyle)}
                      onRoadWidthChange={(value) => setRoadWidth(value as RoadWidthOption)}
                      paperSize={meta.paper_size}
                      surveyPreviewUrl={previewUrl}
                      orthophotoPreviewUrl={orthophotoUrl}
                      topoMapPreviewUrl={topoMapUrl}
                      loading={previewLoading}
                      orthophotoLoading={orthophotoLoading}
                      topoMapLoading={topoMapLoading}
                      hasHeightData={hasHeightData}
                      allowedPreviewTypes={["survey"]}
                    />
                  </div>
                ) : (
                  <>
                    {!subdivisionPreview && (
                      <div className="preview-empty">
                        <p>Click <strong>Preview Split</strong> to see lot lines and area labels here.</p>
                      </div>
                    )}
                    {(subdivisionMapPreviewData || subdivisionSvgPreview) && (
                      <div
                        ref={(node) => {
                          subdivisionLineCanvasRef.current = node;
                        }}
                        className="subdivision-map-wrap"
                        onPointerUp={stopSubdivisionBreakDrag}
                        onPointerCancel={stopSubdivisionBreakDrag}
                      >
                        {subdivisionMapPreviewData && MAPBOX_TOKEN ? (
                          <div ref={subdivisionMapContainerRef} className="subdivision-map-canvas" />
                        ) : (
                          <div className="subdivision-svg-wrap">
                            {subdivisionSvgPreview && (
                              <svg
                                viewBox={`0 0 ${subdivisionSvgPreview.width} ${subdivisionSvgPreview.height}`}
                                className="subdivision-svg"
                                role="img"
                                aria-label="Subdivision lot preview"
                              >
                                <rect x="0" y="0" width={subdivisionSvgPreview.width} height={subdivisionSvgPreview.height} fill="#0f172a" />
                                <g>
                              {subdivisionSvgPreview.plots.map((plot) => (
                                <path
                                  key={`plot_path_${plot.idx}`}
                                  d={plot.path}
                                  fill="rgba(16,185,129,0.08)"
                                  stroke={plot.stroke}
                                  strokeWidth={2.4}
                                />
                                  ))}
                                </g>
                                <g>
                              {subdivisionSvgPreview.plots.map((plot) => (
                                <text
                                  key={`plot_label_${plot.idx}`}
                                  x={plot.labelX}
                                  y={plot.labelY}
                                  textAnchor="middle"
                                  className="subdivision-svg-label"
                                    >
                                      <tspan x={plot.labelX} dy="0">{plot.lotNo}</tspan>
                                      <tspan x={plot.labelX} dy="12">{plot.areaHa.toFixed(3)} ha</tspan>
                                    </text>
                                  ))}
                                </g>
                              </svg>
                            )}
                          </div>
                        )}

                        {subdivisionMethod === "by_fraction" && subdivisionFractionBreaksEffective.length > 0 && (
                          <div className="subdivision-break-overlay">
                            {subdivisionFractionBreaksEffective.map((value, idx) => {
                              const isActive = subdivisionDraggingBreakIndex === idx;
                              return (
                                <div
                                  key={`subdiv_guide_${idx}`}
                                  className={`subdivision-break-guide-dom${isActive ? " active" : ""}`}
                                  style={{ left: `${Math.max(2, Math.min(98, value * 100))}%` }}
                                >
                                  <div
                                    className="subdivision-break-hitline-dom"
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      startSubdivisionBreakDrag(idx, event.clientX);
                                    }}
                                  />
                                  <div className="subdivision-break-line-dom" />
                                  <button
                                    type="button"
                                    className="subdivision-break-handle-dom"
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      startSubdivisionBreakDrag(idx, event.clientX);
                                    }}
                                  />
                                  <span className="subdivision-break-value-dom">{(value * 100).toFixed(1)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {subdivisionPreview && (
                      <div className="subdivision-legend">
                        <span>Resolved lots: <strong>{subdivisionPreview.resolved_count}</strong></span>
                        <span>
                          Target area: <strong>{subdivisionTargetDisplayM2 > 0 ? `${subdivisionTargetDisplayM2.toFixed(2)} sqm` : "n/a"}</strong>
                        </span>
                        <span>Orientation: <strong>{subdivisionOrientationDisplayDeg.toFixed(1)} deg</strong></span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Export (Survey Plan Production) */}
        {workflowMode === "survey" && currentStep === 3 && plotId && (
          <div className="step-panel export-panel">
            <div className="panel-left">
              <div className="export-section">
                <h3 className="section-title">Download Documents</h3>
                <p className="section-desc">Your survey documents are ready. Choose the formats you need:</p>

                <div className="export-grid">
                  {/* Survey Plan PDF */}
                  <div className="export-card">
                    <div className="export-icon pdf">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M7 21h10a2 2 0 002-2V9l-5-5H7a2 2 0 00-2 2v13a2 2 0 002 2z" />
                        <path d="M14 4v5h5" />
                        <path d="M9 13h6M9 17h4" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Survey Plan PDF</h4>
                      <p>Complete survey plan with all details</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/report/pdf`,
                          `plot_${plotId}_survey_plan.pdf`,
                          "survey_pdf",
                          false,
                          "SURVEY PLAN"
                        )
                      }
                    >
                      {downloadLoadingKey === "survey_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Orthophoto PDF */}
                  <div className="export-card">
                    <div className="export-icon ortho">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Orthophoto PDF</h4>
                      <p>Aerial imagery with plot overlay</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/orthophoto/pdf`,
                          `plot_${plotId}_orthophoto.pdf`,
                          "orthophoto_pdf",
                          false,
                          "ORTHOPHOTO"
                        )
                      }
                    >
                      {downloadLoadingKey === "orthophoto_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* DWG File */}
                  <div className="export-card">
                    <div className="export-icon dwg">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M8 15l2-2 2 2 2-2 2 2" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>DWG/DXF File</h4>
                      <p>CAD-compatible survey drawing</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithGet(
                          `/plots/${plotId}/survey-plan/dwg`,
                          `plot_${plotId}_survey_plan.dxf`,
                          "dwg"
                        )
                      }
                    >
                      {downloadLoadingKey === "dwg" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download DWG</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Shapefile ZIP */}
                  <div className="export-card">
                    <div className="export-icon topo">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
                        <path d="M9 3v15M15 6v15" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Shapefile (ZIP)</h4>
                      <p>GIS boundary export for ArcGIS/QGIS</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithGet(
                          `/plots/${plotId}/survey-plan/shapefile`,
                          `plot_${plotId}_survey_plan_shapefile.zip`,
                          "shapefile_zip"
                        )
                      }
                    >
                      {downloadLoadingKey === "shapefile_zip" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download ZIP</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Topo Map PDF */}
                  <div className="export-card">
                    <div className="export-icon topo">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                        <circle cx="12" cy="9" r="2.5" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Topo Map PDF</h4>
                      <p>Terrain contours with plot overlay</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/orthophoto/pdf`,
                          `plot_${plotId}_topomap.pdf`,
                          "topomap_pdf",
                          true,
                          "TOPO MAP"
                        )
                      }
                    >
                      {downloadLoadingKey === "topomap_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Back Computation */}
                  <div className="export-card">
                    <div className="export-icon calc">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="4" y="2" width="16" height="20" rx="2" />
                        <line x1="8" y1="6" x2="16" y2="6" />
                        <line x1="8" y1="10" x2="16" y2="10" />
                        <line x1="8" y1="14" x2="12" y2="14" />
                        <line x1="8" y1="18" x2="10" y2="18" />
                      </svg>
                    </div>
                    <div className="export-info">
                      <h4>Back Computation</h4>
                      <p>Survey calculation sheet</p>
                    </div>
                    <button
                      className="download-btn"
                      disabled={Boolean(downloadLoadingKey)}
                      onClick={() =>
                        downloadWithJson(
                          `/plots/${plotId}/back-computation/pdf`,
                          `plot_${plotId}_back_computation.pdf`,
                          "back_computation_pdf"
                        )
                      }
                    >
                      {downloadLoadingKey === "back_computation_pdf" ? (
                        <>
                          <span className="spinner download-spinner" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="action-bar">
                <button className="btn-outline" onClick={() => setCurrentStep(2)}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back to Preview
                </button>
                <button className="btn-primary" onClick={() => navigate("/")}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Complete & Return Home
                </button>
              </div>
            </div>
            <div className="panel-right preview-container">
              <SurveyPreview
                previewType={previewType}
                onPreviewTypeChange={setPreviewType}
                topoSource={topoSource}
                onTopoSourceChange={setTopoSource}
                northArrowStyle={northArrowStyle}
                northArrowColor={northArrowColor}
                beaconStyle={beaconStyle}
                roadWidth={roadWidth}
                onNorthArrowStyleChange={(value) => setNorthArrowStyle(value as NorthArrowStyle)}
                onNorthArrowColorChange={(value) => setNorthArrowColor(value as NorthArrowColor)}
                onBeaconStyleChange={(value) => setBeaconStyle(value as BeaconStyle)}
                onRoadWidthChange={(value) => setRoadWidth(value as RoadWidthOption)}
                paperSize={meta.paper_size}
                surveyPreviewUrl={previewUrl}
                orthophotoPreviewUrl={orthophotoUrl}
                topoMapPreviewUrl={topoMapUrl}
                loading={false}
                orthophotoLoading={orthophotoLoading}
                topoMapLoading={topoMapLoading}
                hasHeightData={hasHeightData}
              />
            </div>
          </div>
        )}

        {/* Step 3: Batch Export (Subdivision) */}
        {workflowMode === "subdivision" && currentStep === 3 && plotId && (
          <div className="step-panel export-panel">
            <div className="panel-left">
              <div className="export-section">
                <h3 className="section-title">Subdivision Batch Export</h3>
                <p className="section-desc">
                  Export generated subdivision plans as one ZIP package. Preview the split before downloading.
                </p>
                <p className="section-desc">
                  Output settings: Template <strong>{meta.template_name === "adamawa_osg" ? "Adamawa OSG" : "General"}</strong>,
                  Scale <strong>{meta.scale_text}</strong>, Paper <strong>{meta.paper_size}</strong>.
                </p>

                <div className="export-grid">
                  {(latestSubdivisionBatchId ?? subdivisionBatches[0]?.id) && (
                    <div className="export-card">
                      <div className="export-icon calc">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M4 4h16v4H4zM4 10h16v10H4z" />
                          <path d="M8 14h8M8 18h5" />
                        </svg>
                      </div>
                      <div className="export-info">
                        <h4>Latest Batch ZIP</h4>
                        <p>Download all generated lots from the latest subdivision batch</p>
                      </div>
                      <button
                        className="download-btn"
                        disabled={subdivisionDownloadBatchId !== null}
                        onClick={() => downloadSubdivisionBatch((latestSubdivisionBatchId ?? subdivisionBatches[0]?.id) as number)}
                      >
                        {subdivisionDownloadBatchId === (latestSubdivisionBatchId ?? subdivisionBatches[0]?.id) ? (
                          <>
                            <span className="spinner download-spinner" />
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            <span>Download ZIP</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <div className="form-section subdivision-section">
                    <div className="subdivision-batch-header">
                      <h4>All Batches</h4>
                      <button
                        className="btn-outline btn-mini"
                        onClick={loadSubdivisionBatches}
                        disabled={!plotId || subdivisionBatchLoading}
                      >
                        {subdivisionBatchLoading ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                    {subdivisionBatches.length === 0 ? (
                      <p className="subdivision-note">No batch generated yet. Go back and generate subdivision first.</p>
                    ) : (
                      <div className="subdivision-batch-list">
                        {subdivisionBatches.map((batch) => (
                          <div key={batch.id} className="subdivision-batch-item">
                            <div>
                              <strong>Batch #{batch.id}</strong>
                              <div className="subdivision-note">
                                {batch.method} - {batch.generated_count} plots - {(batch.total_area_m2 ?? 0).toFixed(2)} sqm
                              </div>
                            </div>
                            <button
                              className="download-btn"
                              disabled={subdivisionDownloadBatchId !== null}
                              onClick={() => downloadSubdivisionBatch(batch.id)}
                            >
                              {subdivisionDownloadBatchId === batch.id ? "Downloading..." : "Export ZIP"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="action-bar">
                <button
                  className="btn-outline"
                  onClick={() => {
                    setSubdivisionPreviewPanelTab("subdivision_lines");
                    setCurrentStep(2);
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back to Subdivision Preview
                </button>
                <button className="btn-primary" onClick={() => navigate("/")}>
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Complete & Return Home
                </button>
              </div>
            </div>
            <div className="panel-right preview-container">
              {subdivisionPreview ? (
                <div className="subdivision-preview-wrap subdivision-preview-right">
                  <h4 className="section-title">Subdivision Preview</h4>
                  <div className="subdivision-kpis">
                    <div className="subdivision-kpi">
                      <span className="subdivision-kpi-label">Derived plots</span>
                      <strong>{subdivisionPreview.resolved_count}</strong>
                    </div>
                    <div className="subdivision-kpi">
                      <span className="subdivision-kpi-label">Mother parcel area</span>
                      <strong>{subdivisionPreview.total_area_m2.toFixed(2)} sqm</strong>
                    </div>
                    <div className="subdivision-kpi">
                      <span className="subdivision-kpi-label">Area imbalance</span>
                      <strong>{Math.abs(subdivisionPreview.area_imbalance_m2).toFixed(4)} sqm</strong>
                    </div>
                  </div>
                  <div className="subdivision-table-wrap">
                    <table className="subdivision-table">
                      <thead>
                        <tr>
                          <th>Lot</th>
                          <th>Area (sqm)</th>
                          <th>Area (ha)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subdivisionPreview.plots.slice(0, 18).map((item) => (
                          <tr key={item.lot_no}>
                            <td>{item.lot_no}</td>
                            <td>{item.area_m2.toFixed(2)}</td>
                            <td>{item.area_hectares.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="preview-empty">
                  <p>No subdivision preview yet. Go back and click Preview Split.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
