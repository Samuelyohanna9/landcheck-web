import { Suspense, lazy, startTransition, useEffect, useMemo, useState, useCallback, useRef, type SetStateAction, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, withRetry, extractApiErrorMessage } from "../api/client";
import toast, { Toaster } from "react-hot-toast";
import {
  consumePendingSurveyDownload,
  isSurveyAuthed,
  type PendingSurveyDownload,
} from "../auth/surveyAuth";
import {
  fromWGS84,
  isProjectedCoordinateSystem,
  resolveCoordinateSystemKey,
  toWGS84,
} from "../utils/coordinateConverter";
import { loadMapboxGl, MAPBOX_TOKEN } from "../utils/mapboxLoader";
import { useDeferredMount } from "../hooks/useDeferredMount";
import { useLowBandwidthMode } from "../hooks/useLowBandwidthMode";
import type {
  GeoreferenceControlPoint,
  GeoreferenceFeature,
  GeoreferenceSession,
} from "../types/surveyGeoreference";
import type { TechnicalReportFields } from "../components/survey-plan/TechnicalReportModal";
import SurveyNetworkMotif from "../components/survey-plan/SurveyNetworkMotif";
import {
  clearSurveyPlanDraft,
  loadSurveyPlanDraft,
  saveSurveyPlanDraft,
} from "../offline/surveyPlanDraft";
import "../styles/survey-tokens.css";
import "../styles/survey-plan.css";

const SurveyPreview = lazy(() => import("../components/SurveyPreview"));
const SignupGateModal = lazy(() => import("../components/SignupGateModal"));
const FeatureOverrideModal = lazy(() => import("../components/FeatureOverrideModal"));
const TechnicalReportModal = lazy(() => import("../components/survey-plan/TechnicalReportModal"));
const SurveyPlanStepOnePanel = lazy(() => import("../components/survey-plan/SurveyPlanStepOnePanel"));
const SurveyPlanSurveyPreviewStep = lazy(() => import("../components/survey-plan/SurveyPlanSurveyPreviewStep"));
const SurveyPlanSubdivisionPreviewStep = lazy(() => import("../components/survey-plan/SurveyPlanSubdivisionPreviewStep"));
const SurveyPlanSubdivisionExportStep = lazy(() => import("../components/survey-plan/SurveyPlanSubdivisionExportStep"));
const SurveyPlanGeoreferenceSetupStep = lazy(() => import("../components/survey-plan/SurveyPlanGeoreferenceSetupStep"));
const SurveyPlanGeoreferenceWorkspaceStep = lazy(() => import("../components/survey-plan/SurveyPlanGeoreferenceWorkspaceStep"));
const SurveyPlanGeoreferenceExportStep = lazy(() => import("../components/survey-plan/SurveyPlanGeoreferenceExportStep"));

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
  // "" = no template chosen yet - the state a brand-new plot starts in, so template selection is
  // never silently skipped. See requireTemplate in the preview-step components, which blocks
  // rendering/CAD-editor/continue actions until this becomes a real value.
  template_name: "" | "general" | "site_plan" | "adamawa_osg" | "akwa_ibom_osg" | "rivers_osg" | "cross_river_osg" | "fct_abuja_osg";
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
  cadastral_plan_no: string;
  cadastral_area_name: string;
  cadastral_datum_text: string;
  cadastral_firm_block_text: string;
  fct_file_no: string;
  fct_district: string;
  fct_cadastral_zone: string;
  fct_origin_beacon_text: string;
  fct_cadastral_map_ref: string;
  fct_title_prefix: string;
  technical_report_instruments: string[];
  technical_report_dgps_type: string;
  technical_report_num_surveyors: number | null;
  technical_report_num_technical_officers: number | null;
  technical_report_num_labourers: number | null;
  technical_report_recce_text: string;
  technical_report_demarcation_text: string;
  technical_report_computation_software_text: string;
  technical_report_plotting_software_text: string;
  technical_report_general_observation_text: string;
};

type SubdivisionMethod = "by_count" | "by_area" | "by_fraction" | "by_custom_area" | "by_dimension";
type SubdivisionDimensionUnit = "m" | "ft";

type SubdivisionPreviewPlot = {
  index: number;
  lot_no: string;
  area_m2: number;
  area_hectares: number;
  // Set when a lot combining both sides of an excluded road (equal-size division across the
  // road) got split into separate same-lot-number entries (LOT-004A / LOT-004B) - every saved
  // plot is a single contiguous parcel, so each part is its own ordinary Polygon entry, linked
  // back to the others sharing this base lot number for display/coloring purposes.
  combined_group?: string | null;
  geometry?:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
};

// Every exterior ring of a lot's geometry, whether it's one Polygon or several disjoint parts of
// a MultiPolygon - callers treat each ring as its own closed shape to draw/measure.
const subdivisionLotExteriorRings = (geometry: SubdivisionPreviewPlot["geometry"]): number[][][] => {
  if (!geometry) return [];
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).map((poly) => poly?.[0] || []).filter((ring) => ring.length >= 3);
  }
  const ring = geometry.coordinates?.[0] || [];
  return ring.length >= 3 ? [ring] : [];
};

// Cheap "how big is this ring" proxy (bounding-box area, not true polygon area) used only to pick
// which part of a merged, multi-ring lot is the "main" one for label/station placement.
const ringBBoxArea = (ring: number[][]): number => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  ring.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
};

type SubdivisionZoneGeojson = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: any;
  };
};

type SubdivisionRoadSegment = {
  id: string;
  source: "detected" | "override";
  override_id: number | null;
  geojson: {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: { type: "LineString"; coordinates: number[][] };
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
  lot_width_m?: number | null;
  lot_height_m?: number | null;
  dimension_unit?: SubdivisionDimensionUnit | null;
  exclude_road?: boolean;
  road_width_m?: number | null;
  excluded_geojson?: SubdivisionZoneGeojson | null;
  excluded_area_m2?: number | null;
  road_segments?: SubdivisionRoadSegment[] | null;
  leftover_geojson?: SubdivisionZoneGeojson | null;
  leftover_area_m2?: number | null;
  lot_count_balanced?: boolean;
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

type SubdivisionBatchItem = {
  id: number;
  batch_id: number;
  child_plot_id: number;
  lot_no: string;
  area_m2: number;
  created_at?: string;
};

type SubdivisionBatchDetailResponse = {
  batch: SubdivisionBatchRow;
  items: SubdivisionBatchItem[];
};

type PlotExportJob = {
  id: string;
  status: string;
  file_name?: string | null;
  local_path?: string | null;
  error_text?: string | null;
  download_url?: string | null;
};

type WorkflowMode = "survey" | "subdivision" | "georeference";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
  is_boundary?: boolean;
};

type PreviewType = "survey" | "orthophoto" | "topomap";
type TopoSource = "opentopomap" | "userdata";
type NorthArrowStyle = "one_side_stem" | "stacked_4n" | "classic" | "triangle" | "compass" | "chevron" | "orienteering" | "star" | "un_marker" | "nn_arrow";
type NorthArrowColor = "black" | "blue";
type BeaconStyle = "circle" | "square" | "triangle" | "diamond" | "cross";
type RoadWidthOption = "2" | "4" | "6" | "8" | "10" | "12" | "15" | "20" | "30";
type BuildingHatchType = "horizontal" | "vertical" | "diagonal" | "cross" | "solid";
// "" = this template's own existing default (solid for general/Adamawa, dashed for cadastral/FCT) -
// left unset unless the user explicitly picks one, so existing plans keep looking exactly as they do.
type RoadStyleOption = "" | "solid" | "dashed_symbol";
type ScaleRecommendation = {
  paper_size: "A4" | "A3" | "A2" | "A1" | "A0";
  scale_text: string;
  scale_denominator: number;
  fitted_scale_denominator: number;
  deferred_dimension_count: number;
  template_name: string;
  reason: string;
};
type PreviewRenderSelection = Pick<ScaleRecommendation, "scale_text" | "paper_size">;

type SurveyPlanDraftState = {
  workflowMode: WorkflowMode | null;
  currentStep: number;
  featureEditorOpen: boolean;
  manualPoints: ManualPoint[];
  coordinateSystem: string;
  plotId: number | null;
  hasHeightData: boolean;
  previewType: PreviewType;
  topoSource: TopoSource;
  contourInterval: number | null;
  topoBuildingHatch: BuildingHatchType;
  northArrowStyle: NorthArrowStyle;
  northArrowColor: NorthArrowColor;
  beaconStyle: BeaconStyle;
  roadWidth: RoadWidthOption;
  boundaryColor: string;
  gridColor: string;
  textColor: string;
  roadColor: string;
  riverColor: string;
  buildingColor: string;
  buildingHatchType: BuildingHatchType;
  roadStyle: RoadStyleOption;
  titleFont: string;
  titleSize: string;
  gridFont: string;
  gridSize: string;
  stationFont: string;
  stationSize: string;
  bearingFont: string;
  bearingSize: string;
  areaFont: string;
  areaSize: string;
  meta: PlotMeta;
  hasManualScaleOverride: boolean;
  subdivisionMethod: SubdivisionMethod;
  subdivisionCountDraft: string;
  subdivisionTargetAreaDraft: string;
  subdivisionFractionDraft: string;
  subdivisionFractionBreaks: number[];
  subdivisionCustomAreaDrafts: string[];
  subdivisionParentAreaM2: number | null;
  subdivisionOrientationDraft: string;
  subdivisionLotPrefix: string;
  subdivisionEstateName: string;
  subdivisionLotNamesDraft: string[];
  lastServerSyncAt: string | null;
  lastServerSyncSignature: string | null;
  hasUnsyncedServerChanges: boolean;
  georefSessionId: string | null;
  georefTargetCoordinateSystem: string;
  georefSelectedControlPointId: string | null;
};

const DEFAULT_CERTIFICATION_STATEMENT =
  "I hereby certify that this survey plan is a true representation of the survey executed by me and conforms with the regulations of surveying profession.";
const SCALE_PRESETS = [250, 500, 1000, 1250, 2000, 2500, 5000, 10000, 12500, 20000, 25000, 50000];
const MIN_SCALE_DENOMINATOR = 100;
const MAX_SCALE_DENOMINATOR = 50000;
const DEFAULT_TEMPLATE_NAME: PlotMeta["template_name"] = "";
const DEFAULT_ADAMAWA_AUTHORITY_TITLE = "SURVEYOR GENERAL";
const DEFAULT_ADAMAWA_AUTHORITY_DATE = "November, 2024";
const DEFAULT_ADAMAWA_ORIGIN_TEXT = "ORIGIN:- WGS 84 UTM ZONE 33N";
const DEFAULT_ADAMAWA_TOPO_SHEET_TEXT = "BASED ON GIREI TOPO SHEET 197 NE";
const DEFAULT_ADAMAWA_DISCLAIMER_TEXT =
  "Detail shewn not the result of accurate survey. All bearing and distances shewn on this plan have been computed from registered Co-ordinates.";
const DEFAULT_TECHNICAL_REPORT_COMPUTATION_SOFTWARE = "AutoCAD software";
const DEFAULT_TECHNICAL_REPORT_PLOTTING_SOFTWARE = "AutoCAD software";
const DEFAULT_TECHNICAL_REPORT_GENERAL_OBSERVATION = "The work was hitch-free.";
const ACTIVE_SURVEY_DRAFT_ID = "active";

// The shared `api` client's default timeout (30s) suits quick calls, but anything that renders a
// plan (which, for templates like Site Plan, chains through several satellite-imagery fallback
// fetches server-side) or transfers an actual file is a different class of request - Nigerian
// networks make both legitimately slower than 30s even when nothing is actually stuck.
const SLOW_NETWORK_TIMEOUT_MS = 180000;

const buildDefaultManualPoints = (): ManualPoint[] => [
  { station: "A", lng: 0, lat: 0 },
  { station: "B", lng: 0, lat: 0 },
  { station: "C", lng: 0, lat: 0 },
];

const buildDefaultPlotMeta = (): PlotMeta => ({
  title_text: "SURVEY PLAN",
  location_text: "",
  lga_text: "",
  state_text: "",
  surveyor_name: "",
  surveyor_rank: "",
  certification_statement: DEFAULT_CERTIFICATION_STATEMENT,
  scale_text: "auto",
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
  cadastral_plan_no: "",
  cadastral_area_name: "",
  cadastral_datum_text: "",
  cadastral_firm_block_text: "",
  fct_file_no: "",
  fct_district: "",
  fct_cadastral_zone: "",
  fct_origin_beacon_text: "",
  fct_cadastral_map_ref: "",
  fct_title_prefix: "",
  technical_report_instruments: [],
  technical_report_dgps_type: "",
  technical_report_num_surveyors: null,
  technical_report_num_technical_officers: null,
  technical_report_num_labourers: null,
  technical_report_recce_text: "",
  technical_report_demarcation_text: "",
  technical_report_computation_software_text: DEFAULT_TECHNICAL_REPORT_COMPUTATION_SOFTWARE,
  technical_report_plotting_software_text: DEFAULT_TECHNICAL_REPORT_PLOTTING_SOFTWARE,
  technical_report_general_observation_text: DEFAULT_TECHNICAL_REPORT_GENERAL_OBSERVATION,
});

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

const normalizeApiDownloadPath = (value: string) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  try {
    const parsed = new URL(rawValue, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return rawValue;
  }
};

const formatDraftUpdatedAt = (value: string | null) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

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

const isAutoScaleText = (scaleText: string): boolean => {
  const normalized = String(scaleText || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return !normalized || ["auto", "fit", "autofit", "1:auto", "1:fit", "1:autofit"].includes(normalized);
};

const closeRingIfNeeded = (ring: number[][]): number[][] => {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
};

const normalizeGeoreferenceNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampGeoreferenceNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const estimateNextGeoreferenceControlPoint = (
  controlPoints: GeoreferenceControlPoint[],
  sourceWidth: number,
  sourceHeight: number,
  targetCoordinateSystem: string,
) => {
  const meaningfulImagePoints = controlPoints.filter(
    (point) =>
      Number.isFinite(point.image_x) &&
      Number.isFinite(point.image_y) &&
      (Math.abs(point.image_x) > 0.5 || Math.abs(point.image_y) > 0.5),
  );
  const meaningfulGroundPoints = controlPoints.filter(
    (point) =>
      Number.isFinite(point.ground_x) &&
      Number.isFinite(point.ground_y) &&
      (Math.abs(point.ground_x) > 1e-6 || Math.abs(point.ground_y) > 1e-6),
  );

  const defaultImageStepX = Math.max(36, Math.min((sourceWidth || 900) * 0.08, 120));
  const defaultImageStepY = Math.max(36, Math.min((sourceHeight || 900) * 0.08, 120));
  const projectedGroundSystem = isProjectedCoordinateSystem(targetCoordinateSystem);
  const defaultGroundStep = projectedGroundSystem ? 25 : 0.00025;

  const estimateImageAxis = (axis: "image_x" | "image_y", fallbackStep: number, upperBound: number) => {
    if (!meaningfulImagePoints.length) {
      const centerValue = upperBound > 0 ? upperBound / 2 : fallbackStep;
      return Number(centerValue.toFixed(4));
    }
    const last = meaningfulImagePoints[meaningfulImagePoints.length - 1];
    if (meaningfulImagePoints.length >= 2) {
      const prev = meaningfulImagePoints[meaningfulImagePoints.length - 2];
      const delta = Number(last[axis]) - Number(prev[axis]);
      const nextValue = Number(last[axis]) + (Math.abs(delta) > 0.1 ? delta : fallbackStep);
      return Number(clampGeoreferenceNumber(nextValue, 0, Math.max(upperBound, 0)).toFixed(4));
    }
    return Number(clampGeoreferenceNumber(Number(last[axis]) + fallbackStep, 0, Math.max(upperBound, 0)).toFixed(4));
  };

  const estimateGroundAxis = (axis: "ground_x" | "ground_y") => {
    if (!meaningfulGroundPoints.length) return 0;
    const last = meaningfulGroundPoints[meaningfulGroundPoints.length - 1];
    if (meaningfulGroundPoints.length >= 2) {
      const prev = meaningfulGroundPoints[meaningfulGroundPoints.length - 2];
      const delta = Number(last[axis]) - Number(prev[axis]);
      return Number((Number(last[axis]) + (Math.abs(delta) > 1e-6 ? delta : defaultGroundStep)).toFixed(projectedGroundSystem ? 3 : 6));
    }
    return Number((Number(last[axis]) + defaultGroundStep).toFixed(projectedGroundSystem ? 3 : 6));
  };

  const imageX = estimateImageAxis("image_x", defaultImageStepX, Math.max((sourceWidth || 1) - 1, 1));
  const imageY = estimateImageAxis("image_y", defaultImageStepY, Math.max((sourceHeight || 1) - 1, 1));
  const groundX = estimateGroundAxis("ground_x");
  const groundY = estimateGroundAxis("ground_y");

  return {
    image_x: imageX,
    image_y: imageY,
    ground_x: groundX,
    ground_y: groundY,
    lng: groundX,
    lat: groundY,
  };
};

const normalizeGeoreferenceControlPoint = (
  point: Partial<GeoreferenceControlPoint> & Record<string, unknown>,
  index: number,
): GeoreferenceControlPoint => {
  const groundX = normalizeGeoreferenceNumber(point.ground_x ?? point.lng);
  const groundY = normalizeGeoreferenceNumber(point.ground_y ?? point.lat);
  const errorValue = point.error_m;
  const normalized: GeoreferenceControlPoint = {
    id: String(point.id || `gcp_${index + 1}`),
    label: String(point.label || `GCP ${index + 1}`),
    image_x: normalizeGeoreferenceNumber(point.image_x),
    image_y: normalizeGeoreferenceNumber(point.image_y),
    ground_x: groundX,
    ground_y: groundY,
    lng: groundX,
    lat: groundY,
  };
  if (errorValue != null) {
    const parsedError = Number(errorValue);
    if (Number.isFinite(parsedError)) {
      normalized.error_m = parsedError;
    }
  }
  return normalized;
};

const normalizeGeoreferenceSessionPayload = (session: GeoreferenceSession): GeoreferenceSession => {
  const controlPoints = Array.isArray(session.ground_control_points)
    ? session.ground_control_points.map((point, index) =>
        normalizeGeoreferenceControlPoint(point as Partial<GeoreferenceControlPoint> & Record<string, unknown>, index),
      )
    : [];
  const transform = session.transform
    ? {
        ...session.transform,
        residuals: Array.isArray(session.transform.residuals)
          ? session.transform.residuals.map((point, index) =>
              normalizeGeoreferenceControlPoint(
                point as Partial<GeoreferenceControlPoint> & Record<string, unknown>,
                index,
              ),
            )
          : [],
      }
    : null;
  return {
    ...session,
    ground_control_points: controlPoints,
    transform,
    features: Array.isArray(session.features) ? session.features : [],
  };
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

const GEOREFERENCE_STEPS = [
  { id: 1, title: "Upload & Control Points", description: "Anchor the raster against real coordinates" },
  { id: 2, title: "Digitize Workspace", description: "Trace parcels, stake points, and lines" },
  { id: 3, title: "Export & Continue", description: "Download DGPS CSV and continue into Survey Plan" },
];

export default function SurveyPlan() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isLowBandwidth, manualLowBandwidth, setManualLowBandwidth } = useLowBandwidthMode();
  const deferredDraftMap = useDeferredMount(250);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);
  const [signupGateOpen, setSignupGateOpen] = useState(false);
  const [pendingGateDownload, setPendingGateDownload] = useState<PendingSurveyDownload | null>(null);
  const openSignupGate = useCallback((download: PendingSurveyDownload) => {
    setPendingGateDownload(download);
    setSignupGateOpen(true);
  }, []);
  const [currentStep, setCurrentStep] = useState(1);
  const surveyContentRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [forceShowDraftMap, setForceShowDraftMap] = useState(false);
  const activeSteps =
    workflowMode === "subdivision"
      ? SUBDIVISION_STEPS
      : workflowMode === "georeference"
        ? GEOREFERENCE_STEPS
        : SURVEY_STEPS;
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [restoredDraftUpdatedAt, setRestoredDraftUpdatedAt] = useState<string | null>(null);
  const [showDraftRecoveryBanner, setShowDraftRecoveryBanner] = useState(false);
  const [pendingFeatureEditorRestore, setPendingFeatureEditorRestore] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const el = surveyContentRef.current;
    if (!el) return;
    const SCROLL_HINT_THRESHOLD_PX = 24;
    const evaluate = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollHint(remaining > SCROLL_HINT_THRESHOLD_PX);
    };
    evaluate();
    el.addEventListener("scroll", evaluate, { passive: true });
    window.addEventListener("resize", evaluate);
    // Content height often changes without a scroll/resize event (preview images loading,
    // feature counts arriving, step switching), so also watch the container's own size.
    const resizeObserver = new ResizeObserver(evaluate);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", evaluate);
      window.removeEventListener("resize", evaluate);
      resizeObserver.disconnect();
    };
  }, [workflowMode, currentStep]);
  const [lastServerSyncAt, setLastServerSyncAt] = useState<string | null>(null);
  const [lastServerSyncSignature, setLastServerSyncSignature] = useState<string | null>(null);
  const [hasUnsyncedServerChanges, setHasUnsyncedServerChanges] = useState(false);
  const [serverSyncing, setServerSyncing] = useState(false);
  const pendingDraftWriteRef = useRef<number | null>(null);
  const skipDirtyEffectRef = useRef(true);
  const restoreActionsAppliedRef = useRef(false);

  // Coordinates state
  const [manualPoints, setManualPoints] = useState<ManualPoint[]>(buildDefaultManualPoints);
  const [coordinateSystem, setCoordinateSystem] = useState("wgs84");

  // Plot state
  const loading = false;
  const [plotId, setPlotId] = useState<number | null>(null);
  const [features, setFeatures] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scaleRecommendation, setScaleRecommendation] = useState<ScaleRecommendation | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [orthophotoUrl, setOrthophotoUrl] = useState<string | null>(null);
  const [orthophotoLoading, setOrthophotoLoading] = useState(false);
  const [topoMapUrl, setTopoMapUrl] = useState<string | null>(null);
  const [topoMapLoading, setTopoMapLoading] = useState(false);
  const [downloadLoadingKey, setDownloadLoadingKey] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [showTechnicalReportModal, setShowTechnicalReportModal] = useState(false);
  const [generatingTechnicalReport, setGeneratingTechnicalReport] = useState(false);
  const [hasHeightData, setHasHeightData] = useState(false);
  const [previewType, setPreviewType] = useState<PreviewType>("survey");
  const [topoSource, setTopoSource] = useState<TopoSource>("opentopomap");
  // null = Auto (backend picks a contour interval from the site's actual relief); otherwise a
  // fixed interval in metres the user explicitly chose.
  const [contourInterval, setContourInterval] = useState<number | null>(null);
  const [northArrowStyle, setNorthArrowStyle] = useState<NorthArrowStyle>("one_side_stem");
  const [northArrowColor, setNorthArrowColor] = useState<NorthArrowColor>("blue");
  const [beaconStyle, setBeaconStyle] = useState<BeaconStyle>("cross");
  const [roadWidth, setRoadWidth] = useState<RoadWidthOption>("10");
  const [boundaryColor, setBoundaryColor] = useState<string>("#ff0000");
  const [gridColor, setGridColor] = useState<string>("#0000ff");
  const [textColor, setTextColor] = useState<string>("#000000");
  const [roadColor, setRoadColor] = useState<string>("#000000");
  const [riverColor, setRiverColor] = useState<string>("#0000ff");
  const [buildingColor, setBuildingColor] = useState<string>("#000000");
  const [buildingHatchType, setBuildingHatchType] = useState<BuildingHatchType>("diagonal");
  // Topo Map gets its own building style (defaults to Solid Fill, which reads far more clearly
  // against a terrain-colored contour background than hatching does) - independent from the main
  // Survey Plan's own buildingHatchType/default above, though the user can change either freely.
  const [topoBuildingHatch, setTopoBuildingHatch] = useState<BuildingHatchType>("solid");
  const [roadStyle, setRoadStyle] = useState<RoadStyleOption>("");
  const [titleFont, setTitleFont] = useState<string>("");
  const [titleSize, setTitleSize] = useState<string>("");
  const [gridFont, setGridFont] = useState<string>("");
  const [gridSize, setGridSize] = useState<string>("");
  const [stationFont, setStationFont] = useState<string>("");
  const [stationSize, setStationSize] = useState<string>("");
  const [bearingFont, setBearingFont] = useState<string>("");
  const [bearingSize, setBearingSize] = useState<string>("");
  const [areaFont, setAreaFont] = useState<string>("");
  const [areaSize, setAreaSize] = useState<string>("");
  const textStylePayload = {
    title_font: titleFont || undefined,
    title_size: titleSize ? Number(titleSize) : undefined,
    grid_font: gridFont || undefined,
    grid_size: gridSize ? Number(gridSize) : undefined,
    station_font: stationFont || undefined,
    station_size: stationSize ? Number(stationSize) : undefined,
    bearing_font: bearingFont || undefined,
    bearing_size: bearingSize ? Number(bearingSize) : undefined,
    area_font: areaFont || undefined,
    area_size: areaSize ? Number(areaSize) : undefined,
  };
  const [scaleDraft, setScaleDraft] = useState<string>("");
  const [scaleDraftDirty, setScaleDraftDirty] = useState(false);
  const [newRoadWidth, setNewRoadWidth] = useState<string>("10");
  const [showFeatureEditor, setShowFeatureEditor] = useState(false);
  const featureEditsPendingRef = useRef(false);
  const [featureType, setFeatureType] = useState<"road" | "building" | "river" | "fence">("road");
  const [featureAction, setFeatureAction] = useState<"add" | "delete" | "update">("add");
  const [roadName, setRoadName] = useState("");
  const [riverName, setRiverName] = useState("");
  const [subdivisionMethod, setSubdivisionMethod] = useState<SubdivisionMethod>("by_count");
  const [subdivisionCountDraft, setSubdivisionCountDraft] = useState("4");
  const [subdivisionTargetAreaDraft, setSubdivisionTargetAreaDraft] = useState("");
  const [subdivisionLotWidthDraft, setSubdivisionLotWidthDraft] = useState("");
  const [subdivisionLotHeightDraft, setSubdivisionLotHeightDraft] = useState("");
  const [subdivisionDimensionUnit, setSubdivisionDimensionUnit] = useState<SubdivisionDimensionUnit>("m");
  const [subdivisionExcludeRoad, setSubdivisionExcludeRoad] = useState(false);
  const [subdivisionRoadWidthDraft, setSubdivisionRoadWidthDraft] = useState("10");
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
  const [subdivisionCleanCopyBatchId, setSubdivisionCleanCopyBatchId] = useState<number | null>(null);
  const [subdivisionCleanCopyTitle, setSubdivisionCleanCopyTitle] = useState("");
  const [subdivisionCleanCopyItems, setSubdivisionCleanCopyItems] = useState<SubdivisionBatchItem[]>([]);
  const [subdivisionCleanCopyAreaDrafts, setSubdivisionCleanCopyAreaDrafts] = useState<Record<string, string>>({});
  const [subdivisionCleanCopyLoadingBatchId, setSubdivisionCleanCopyLoadingBatchId] = useState<number | null>(null);
  const [subdivisionCleanCopyDownloadBatchId, setSubdivisionCleanCopyDownloadBatchId] = useState<number | null>(null);
  const [subdivisionPreviewPanelTab, setSubdivisionPreviewPanelTab] = useState<"survey_plan" | "subdivision_lines">("survey_plan");
  const [subdivisionDraggingBreakIndex, setSubdivisionDraggingBreakIndex] = useState<number | null>(null);
  const subdivisionLivePreviewTimerRef = useRef<number | null>(null);
  const subdivisionLineCanvasRef = useRef<HTMLElement | null>(null);
  const subdivisionMapContainerRef = useRef<HTMLDivElement | null>(null);
  const subdivisionMapRef = useRef<any>(null);
  const subdivisionMapboxRef = useRef<any>(null);
  const subdivisionMapReadyRef = useRef(false);
  const [selectedRoadSegmentId, setSelectedRoadSegmentId] = useState<string | null>(null);
  // On low-bandwidth connections the map should stay genuinely off (never just delayed) until
  // the user explicitly asks for it via "Load Map Now".
  const showDraftMap = forceShowDraftMap || (!isLowBandwidth && deferredDraftMap);
  const previewRequestId = useRef(0);
  const orthophotoRequestId = useRef(0);
  const topoRequestId = useRef(0);
  const planGenerationRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);
  const orthophotoAbortRef = useRef<AbortController | null>(null);
  const topoAbortRef = useRef<AbortController | null>(null);
  const plotCreateRequestIdRef = useRef<{ signature: string; id: string } | null>(null);
  const [georefSession, setGeorefSession] = useState<GeoreferenceSession | null>(null);
  const [georefRasterObjectUrl, setGeorefRasterObjectUrl] = useState<string | null>(null);
  const [georefFeatures, setGeorefFeatures] = useState<GeoreferenceFeature[]>([]);
  const [georefTargetCoordinateSystem, setGeorefTargetCoordinateSystem] = useState("wgs84");
  const [georefSelectedControlPointId, setGeorefSelectedControlPointId] = useState<string | null>(null);
  const [georefSessionLoading, setGeorefSessionLoading] = useState(false);
  const [georefUploading, setGeorefUploading] = useState(false);
  const [georefSolving, setGeorefSolving] = useState(false);
  const [georefSavingFeatures, setGeorefSavingFeatures] = useState(false);
  const [georefDownloadingCsv, setGeorefDownloadingCsv] = useState(false);
  const [georefContinuing, setGeorefContinuing] = useState(false);
  const effectiveCoordinateSystem = useMemo(() => {
    const sample = manualPoints.find(
      (point) =>
        (point.lng !== 0 || point.lat !== 0) &&
        Number.isFinite(Number(point.lng)) &&
        Number.isFinite(Number(point.lat))
    );
    return resolveCoordinateSystemKey(
      coordinateSystem,
      sample ? Number(sample.lng) : undefined,
      sample ? Number(sample.lat) : undefined
    );
  }, [coordinateSystem, manualPoints]);
  const currentStepTitle = activeSteps.find((step) => step.id === currentStep)?.title || "current step";

  // Survey metadata
  const [meta, setMeta] = useState<PlotMeta>(buildDefaultPlotMeta);
  const [hasManualScaleOverride, setHasManualScaleOverride] = useState(false);

  // Turns free text (an applicant's name, a location) into a filesystem-safe filename segment -
  // spaces/punctuation become underscores, and it's capped so a long address doesn't blow past
  // typical filename length limits.
  const sanitizeFilenameSegment = useCallback((value: string | null | undefined): string => {
    const cleaned = String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned.length > 60 ? cleaned.slice(0, 60).replace(/_+$/g, "") : cleaned;
  }, []);

  // Builds a human-readable download filename from whichever identity fields the current draft
  // actually has (applicant/title, location, estate name, ...) instead of the opaque
  // "plot_<id>_..." names these exports used before - falls back to the plot id only when the
  // user hasn't filled in anything identifying yet.
  const buildExportFilename = useCallback(
    (identityParts: (string | null | undefined)[], docLabel: string, ext: string) => {
      const cleanParts = identityParts.map((part) => sanitizeFilenameSegment(part)).filter(Boolean);
      const identity = cleanParts.join("_") || (plotId ? `Plot_${plotId}` : "Untitled_Plot");
      return `${identity}_${docLabel}.${ext}`;
    },
    [plotId, sanitizeFilenameSegment]
  );

  // The "Title" field defaults to the literal placeholder "SURVEY PLAN" on the general template
  // (not a real identifying name), so that default shouldn't itself become part of the filename -
  // fall through to location-only naming in that case.
  const surveyPlanIdentitySegments = useCallback((): (string | null)[] => {
    const rawTitle = meta.title_text.trim();
    const isPlaceholderTitle = !rawTitle || rawTitle.toUpperCase() === "SURVEY PLAN";
    return [isPlaceholderTitle ? null : rawTitle, meta.location_text];
  }, [meta.title_text, meta.location_text]);

  const handleScaleDraftChange = useCallback((value: SetStateAction<string>) => {
    setScaleDraft((prev) => (typeof value === "function" ? value(prev) : value));
    setScaleDraftDirty(true);
  }, []);

  useEffect(() => {
    if (!hasManualScaleOverride || isAutoScaleText(meta.scale_text)) {
      setScaleDraft("");
      setScaleDraftDirty(false);
      return;
    }
    setScaleDraft(String(parseScaleDenominator(meta.scale_text)));
    setScaleDraftDirty(false);
  }, [hasManualScaleOverride, meta.scale_text]);

  const resolveScaleDraftState = useCallback(() => {
    if (!scaleDraftDirty) {
      const manualOverride = hasManualScaleOverride && !isAutoScaleText(meta.scale_text);
      return {
        scaleText: manualOverride ? meta.scale_text : "auto",
        nextDraft: manualOverride ? String(parseScaleDenominator(meta.scale_text)) : "",
        manualOverride,
      };
    }
    const trimmed = String(scaleDraft || "").trim();
    if (!trimmed) {
      return {
        scaleText: "auto",
        nextDraft: "",
        manualOverride: false,
      };
    }
    const parsed = parseScaleDenominator(trimmed);
    return {
      scaleText: `1 : ${parsed}`,
      nextDraft: String(parsed),
      manualOverride: true,
    };
  }, [hasManualScaleOverride, meta.scale_text, scaleDraft, scaleDraftDirty]);

  const applyResolvedScaleState = useCallback(
    (resolved: { scaleText: string; nextDraft: string; manualOverride: boolean }) => {
      setScaleDraftDirty(false);
      setScaleDraft((prev) => (prev === resolved.nextDraft ? prev : resolved.nextDraft));
      setHasManualScaleOverride(resolved.manualOverride);
      setMeta((m) => (m.scale_text === resolved.scaleText ? m : { ...m, scale_text: resolved.scaleText }));
    },
    []
  );

  const commitScaleDraft = useCallback(() => {
    applyResolvedScaleState(resolveScaleDraftState());
  }, [applyResolvedScaleState, resolveScaleDraftState]);

  const applyScalePreset = useCallback(
    (scale: number) => {
      const parsed = parseScaleDenominator(String(scale));
      applyResolvedScaleState({
        scaleText: `1 : ${parsed}`,
        nextDraft: String(parsed),
        manualOverride: true,
      });
    },
    [applyResolvedScaleState]
  );

  const clearGeorefLocalState = useCallback(() => {
    setGeorefSession(null);
    setGeorefRasterObjectUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setGeorefFeatures([]);
    setGeorefTargetCoordinateSystem("wgs84");
    setGeorefSelectedControlPointId(null);
    setGeorefSessionLoading(false);
    setGeorefUploading(false);
    setGeorefSolving(false);
    setGeorefSavingFeatures(false);
    setGeorefDownloadingCsv(false);
    setGeorefContinuing(false);
  }, []);

  useEffect(() => {
    return () => {
      if (georefRasterObjectUrl) {
        URL.revokeObjectURL(georefRasterObjectUrl);
      }
    };
  }, [georefRasterObjectUrl]);

  const applyGeoreferenceSession = useCallback(
    (session: GeoreferenceSession, preferredControlPointId?: string | null) => {
      const normalizedSession = normalizeGeoreferenceSessionPayload(session);
      const controlPoints = normalizedSession.ground_control_points;
      const preferredId =
        preferredControlPointId && controlPoints.some((item) => item.id === preferredControlPointId)
          ? preferredControlPointId
          : controlPoints[controlPoints.length - 1]?.id || null;
      setGeorefSession(normalizedSession);
      setGeorefFeatures(normalizedSession.features);
      setGeorefTargetCoordinateSystem(normalizedSession.target_coordinate_system || "wgs84");
      setGeorefSelectedControlPointId(preferredId);
      if (normalizedSession.id) saveGeorefSessionToStorage(normalizedSession.id);
    },
    []
  );

  const loadGeoreferenceRaster = useCallback(async (sessionId: string) => {
    const res = await api.get(`/survey-georeference/sessions/${encodeURIComponent(sessionId)}/raster`, {
      responseType: "blob",
      timeout: SLOW_NETWORK_TIMEOUT_MS,
    });
    const nextObjectUrl = URL.createObjectURL(res.data);
    setGeorefRasterObjectUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return nextObjectUrl;
    });
  }, []);

  const loadGeoreferenceSession = useCallback(
    async (sessionId: string, options?: { preferredControlPointId?: string | null; silent?: boolean }) => {
      setGeorefSessionLoading(true);
      try {
        const res = await api.get(`/survey-georeference/sessions/${encodeURIComponent(sessionId)}`);
        const session = res.data?.session as GeoreferenceSession;
        applyGeoreferenceSession(session, options?.preferredControlPointId);
        await loadGeoreferenceRaster(sessionId);
        return session;
      } catch (err: any) {
        if (!options?.silent) {
          const detail = err?.response?.data?.detail;
          toast.error(typeof detail === "string" ? detail : "Unable to load the georeference workspace.");
        }
        throw err;
      } finally {
        setGeorefSessionLoading(false);
      }
    },
    [applyGeoreferenceSession, loadGeoreferenceRaster]
  );

  useEffect(() => {
    let active = true;
    loadSurveyPlanDraft<SurveyPlanDraftState>(ACTIVE_SURVEY_DRAFT_ID)
      .then(async (record) => {
        if (!active || !record?.state) return;
        const saved = record.state;
        const restoredSyncSignature =
          typeof saved.lastServerSyncSignature === "string" ? saved.lastServerSyncSignature : null;
        const restoredWorkflowMode = saved.workflowMode || null;
        const maxStep =
          restoredWorkflowMode === "georeference"
            ? 3
            : restoredWorkflowMode === "subdivision"
              ? 3
              : restoredWorkflowMode === "survey"
                ? 3
                : 1;
        const restoredStep = Math.min(Math.max(Number(saved.currentStep || 1), 1), maxStep);
        const shouldRestoreFeatureEditor =
          Boolean(saved.featureEditorOpen) &&
          (restoredWorkflowMode === "survey" || restoredWorkflowMode === "subdivision") &&
          restoredStep >= 2;
        setRestoredDraftUpdatedAt(record.updatedAt || null);
        setShowDraftRecoveryBanner(true);
        restoreActionsAppliedRef.current = false;
        if (saved.workflowMode) setWorkflowMode(saved.workflowMode);
        setCurrentStep(restoredStep);
        setPendingFeatureEditorRestore(shouldRestoreFeatureEditor);
        if (Array.isArray(saved.manualPoints) && saved.manualPoints.length >= 3) setManualPoints(saved.manualPoints);
        if (saved.coordinateSystem) setCoordinateSystem(saved.coordinateSystem);
        if (typeof saved.plotId === "number") setPlotId(saved.plotId);
        setHasHeightData(Boolean(saved.hasHeightData));
        if (saved.previewType === "orthophoto" || saved.previewType === "topomap" || saved.previewType === "survey") {
          setPreviewType(saved.previewType);
        } else {
          setPreviewType("survey");
        }
        if (saved.topoSource) setTopoSource(saved.topoSource);
        if (typeof saved.contourInterval === "number" || saved.contourInterval === null) {
          setContourInterval(saved.contourInterval);
        }
        if (saved.northArrowStyle) setNorthArrowStyle(saved.northArrowStyle);
        if (saved.northArrowColor) setNorthArrowColor(saved.northArrowColor);
        if (saved.beaconStyle) setBeaconStyle(saved.beaconStyle);
        if (saved.roadWidth) setRoadWidth(saved.roadWidth);
        if (saved.boundaryColor) setBoundaryColor(saved.boundaryColor);
        if (saved.gridColor) setGridColor(saved.gridColor);
        if (saved.textColor) setTextColor(saved.textColor);
        if (saved.roadColor) setRoadColor(saved.roadColor);
        if (saved.riverColor) setRiverColor(saved.riverColor);
        if (saved.buildingColor) setBuildingColor(saved.buildingColor);
        if (saved.buildingHatchType) setBuildingHatchType(saved.buildingHatchType);
        if (saved.topoBuildingHatch) setTopoBuildingHatch(saved.topoBuildingHatch);
        if (saved.roadStyle) setRoadStyle(saved.roadStyle);
        if (saved.titleFont) setTitleFont(saved.titleFont);
        if (saved.titleSize) setTitleSize(saved.titleSize);
        if (saved.gridFont) setGridFont(saved.gridFont);
        if (saved.gridSize) setGridSize(saved.gridSize);
        if (saved.stationFont) setStationFont(saved.stationFont);
        if (saved.stationSize) setStationSize(saved.stationSize);
        if (saved.bearingFont) setBearingFont(saved.bearingFont);
        if (saved.bearingSize) setBearingSize(saved.bearingSize);
        if (saved.areaFont) setAreaFont(saved.areaFont);
        if (saved.areaSize) setAreaSize(saved.areaSize);
        if (saved.meta) setMeta({ ...buildDefaultPlotMeta(), ...saved.meta });
        setHasManualScaleOverride(Boolean(saved.hasManualScaleOverride));
        if (saved.subdivisionMethod) setSubdivisionMethod(saved.subdivisionMethod);
        if (typeof saved.subdivisionCountDraft === "string") setSubdivisionCountDraft(saved.subdivisionCountDraft);
        if (typeof saved.subdivisionTargetAreaDraft === "string") setSubdivisionTargetAreaDraft(saved.subdivisionTargetAreaDraft);
        if (typeof saved.subdivisionFractionDraft === "string") setSubdivisionFractionDraft(saved.subdivisionFractionDraft);
        if (Array.isArray(saved.subdivisionFractionBreaks) && saved.subdivisionFractionBreaks.length) {
          setSubdivisionFractionBreaks(saved.subdivisionFractionBreaks);
        }
        if (Array.isArray(saved.subdivisionCustomAreaDrafts)) setSubdivisionCustomAreaDrafts(saved.subdivisionCustomAreaDrafts);
        if (saved.subdivisionParentAreaM2 !== undefined) setSubdivisionParentAreaM2(saved.subdivisionParentAreaM2);
        if (typeof saved.subdivisionOrientationDraft === "string") setSubdivisionOrientationDraft(saved.subdivisionOrientationDraft);
        if (typeof saved.subdivisionLotPrefix === "string") setSubdivisionLotPrefix(saved.subdivisionLotPrefix);
        if (typeof saved.subdivisionEstateName === "string") setSubdivisionEstateName(saved.subdivisionEstateName);
        if (Array.isArray(saved.subdivisionLotNamesDraft)) setSubdivisionLotNamesDraft(saved.subdivisionLotNamesDraft);
        if (typeof saved.georefTargetCoordinateSystem === "string" && saved.georefTargetCoordinateSystem.trim()) {
          setGeorefTargetCoordinateSystem(saved.georefTargetCoordinateSystem.trim());
        }
        if (typeof saved.georefSelectedControlPointId === "string" && saved.georefSelectedControlPointId.trim()) {
          setGeorefSelectedControlPointId(saved.georefSelectedControlPointId.trim());
        }
        setLastServerSyncAt(saved.lastServerSyncAt || null);
        setLastServerSyncSignature(restoredSyncSignature);
        setHasUnsyncedServerChanges(Boolean(saved.hasUnsyncedServerChanges || (saved.plotId && !restoredSyncSignature)));
        const savedGeorefSessionId =
          typeof saved.georefSessionId === "string" ? saved.georefSessionId.trim() : "";
        if (savedGeorefSessionId) {
          try {
            await loadGeoreferenceSession(savedGeorefSessionId, {
              preferredControlPointId: saved.georefSelectedControlPointId || null,
              silent: true,
            });
          } catch {
            if (active) {
              clearGeorefLocalState();
            }
          }
        }
      })
      .finally(() => {
        if (active) {
          skipDirtyEffectRef.current = true;
          setDraftHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, [clearGeorefLocalState, loadGeoreferenceSession]);

  // Dashboard's quick-tools row links here with ?mode=survey|subdivision|georeference - only
  // applied once a restored draft (if any) has had a chance to set its own mode first, so a
  // returning user's in-progress work always wins over the link that got them here.
  useEffect(() => {
    if (!draftHydrated || workflowMode) return;
    const modeParam = searchParams.get("mode");
    if (modeParam === "survey" || modeParam === "subdivision" || modeParam === "georeference") {
      setWorkflowMode(modeParam);
    }
  }, [draftHydrated, workflowMode, searchParams]);

  // Dashboard "Continue" links for a specific georeference session with
  // ?mode=georeference&session=<id> - loads that exact session instead of whatever's in this
  // browser's local draft (which may be a different session, or none at all).
  useEffect(() => {
    if (!draftHydrated || workflowMode !== "georeference") return;
    const sessionParam = searchParams.get("session");
    if (!sessionParam || georefSession?.id === sessionParam) return;
    loadGeoreferenceSession(sessionParam, { silent: true }).catch(() => {
      toast.error("Could not open that georeference session.");
    });
  }, [draftHydrated, workflowMode, searchParams, georefSession?.id, loadGeoreferenceSession]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);


  // Coordinate helpers
  const updatePoint = useCallback((index: number, key: keyof ManualPoint, value: string | number | boolean) => {
    setManualPoints((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value } as ManualPoint;
      return copy;
    });
  }, []);

  // Boundary vertex dragged in the Feature CAD Editor: convert the WGS84 point back into
  // whatever coordinate system the manual point table is currently using and update it in place.
  const handleBoundaryPointChange = useCallback(
    (index: number, lngLat: [number, number]) => {
      const [x, y] = fromWGS84(lngLat[0], lngLat[1], coordinateSystem);
      setManualPoints((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const copy = [...prev];
        copy[index] = { ...copy[index], lng: x, lat: y };
        return copy;
      });
    },
    [coordinateSystem]
  );

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

  const removePoint = useCallback((index: number) => {
    setManualPoints((prev) => {
      const target = prev[index];
      const isBoundary = target?.is_boundary !== false;
      const boundaryCount = prev.filter((p) => p.is_boundary !== false).length;
      // Spot-height-only points don't count toward the "need 3 corners for a polygon" rule, so
      // they can always be freely deleted - only removing a boundary point is blocked once just
      // 3 remain.
      if (isBoundary && boundaryCount <= 3) {
        toast.error("Minimum 3 boundary points required");
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addPoint = useCallback(() => {
    setManualPoints((prev) => [
      ...prev,
      {
        station: getStationName(prev.length),
        lng: 0,
        lat: 0,
        is_boundary: true,
      },
    ]);
  }, []);

  // Handle bulk upload from CSV/Excel
  const handleBulkUpload = useCallback((points: ManualPoint[]) => {
    if (points.length < 3) {
      toast.error("Need at least 3 points for a valid plot boundary");
      return;
    }
    setManualPoints(points);
    setForceShowDraftMap(true);

    // Check if points have height data
    const pointsWithHeight = points.filter(p => p.height !== undefined && p.height !== null);
    if (pointsWithHeight.length > 0) {
      setHasHeightData(true);
      toast.success(`Loaded ${points.length} coordinates with elevation data!`);
    } else {
      setHasHeightData(false);
      toast.success(`Loaded ${points.length} coordinates from file`);
    }
  }, []);

  // Handle coordinates drawn on map (always comes in WGS84)
  // Convert to selected coordinate system for display
  const handleCoordinatesFromMap = useCallback((points: ManualPoint[]) => {
    const boundaryPoints = points.map((p) => ({ ...p, is_boundary: true }));
    if (coordinateSystem === "wgs84") {
      // No conversion needed - keep any existing spot-height-only points, the interactive draw
      // only ever sees/edits the boundary subset, so replacing the whole list here would silently
      // drop them.
      setManualPoints((prev) => [...boundaryPoints, ...prev.filter((p) => p.is_boundary === false)]);
    } else {
      // Convert from WGS84 to selected coordinate system
      const convertedPoints = boundaryPoints.map((p) => {
        if (p.lng === 0 && p.lat === 0) {
          return p;
        }
        const [x, y] = fromWGS84(p.lng, p.lat, coordinateSystem);
        return {
          station: p.station,
          lng: x, // Easting
          lat: y, // Northing
          is_boundary: true,
        };
      });
      setManualPoints((prev) => [...convertedPoints, ...prev.filter((p) => p.is_boundary === false)]);
    }
  }, [coordinateSystem]);

  const closeRing = (pts: number[][]) => {
    if (pts.length < 3) return pts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const same = first[0] === last[0] && first[1] === last[1];
    return same ? pts : [...pts, first];
  };

  // Points that actually form the plot boundary ring - everything else is a spot-height-only
  // sample (still used for elevation/topo purposes, see elevationPointsPayload below, but never
  // fed into the polygon geometry or its per-vertex station labels).
  const boundaryManualPoints = useMemo(
    () => manualPoints.filter((p) => p.is_boundary !== false),
    [manualPoints]
  );

  // Final coordinates for backend (always in WGS84)
  const finalCoords = useMemo(() => {
    const validPoints = boundaryManualPoints.filter(
      (p) => p.lng !== 0 || p.lat !== 0
    );
    if (validPoints.length >= 3) {
      // Convert to WGS84 if using projected coordinate system
      const pts = validPoints.map((p) => {
        if (effectiveCoordinateSystem === "wgs84") {
          return [Number(p.lng), Number(p.lat)];
        }
        // Convert from projected to WGS84
        const [lng, lat] = toWGS84(Number(p.lng), Number(p.lat), effectiveCoordinateSystem);
        return [lng, lat];
      });
      return closeRing(pts);
    }
    return null;
  }, [boundaryManualPoints, effectiveCoordinateSystem]);

  // Elevation samples for the "Your Data" topo map mode - same WGS84 conversion as finalCoords,
  // but keeping the uploaded height value alongside each point instead of just the boundary ring.
  const elevationPointsPayload = useMemo(() => {
    const withHeight = manualPoints.filter(
      (p) => (p.lng !== 0 || p.lat !== 0) && p.height !== undefined && p.height !== null && Number.isFinite(Number(p.height)),
    );
    if (withHeight.length < 3) return [];
    return withHeight.map((p) => {
      if (effectiveCoordinateSystem === "wgs84") {
        return { lng: Number(p.lng), lat: Number(p.lat), elevation_m: Number(p.height) };
      }
      const [lng, lat] = toWGS84(Number(p.lng), Number(p.lat), effectiveCoordinateSystem);
      return { lng, lat, elevation_m: Number(p.height) };
    });
  }, [manualPoints, effectiveCoordinateSystem]);

  const surveyInputCoordinatesPayload = useMemo(() => {
    const validPoints = manualPoints.filter((p) => p.lng !== 0 || p.lat !== 0);
    if (validPoints.length < 3) return [];
    return validPoints.map((p, index) => ({
      station: String((p.station || String.fromCharCode(65 + index)).trim()),
      x: Number(p.lng),
      y: Number(p.lat),
      height:
        p.height !== undefined && p.height !== null && Number.isFinite(Number(p.height))
          ? Number(p.height)
          : null,
      is_boundary: p.is_boundary !== false,
    }));
  }, [manualPoints]);

  const effectiveRenderScaleText = useMemo(() => resolveScaleDraftState().scaleText, [resolveScaleDraftState]);

  const plotMetaPayload = useMemo(
    () => ({
      title_text: meta.title_text,
      location_text: meta.location_text,
      lga_text: meta.lga_text,
      state_text: meta.state_text,
      scale_text: effectiveRenderScaleText,
      surveyor_name: meta.surveyor_name,
      surveyor_rank: meta.surveyor_rank,
      certification_statement: meta.certification_statement,
      coordinate_system: effectiveCoordinateSystem,
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
      cadastral_plan_no: meta.cadastral_plan_no,
      cadastral_area_name: meta.cadastral_area_name,
      cadastral_datum_text: meta.cadastral_datum_text,
      cadastral_firm_block_text: meta.cadastral_firm_block_text,
      fct_file_no: meta.fct_file_no,
      fct_district: meta.fct_district,
      fct_cadastral_zone: meta.fct_cadastral_zone,
      fct_origin_beacon_text: meta.fct_origin_beacon_text,
      fct_cadastral_map_ref: meta.fct_cadastral_map_ref,
      fct_title_prefix: meta.fct_title_prefix,
      survey_input_coordinates: surveyInputCoordinatesPayload,
    }),
    [effectiveCoordinateSystem, effectiveRenderScaleText, meta, surveyInputCoordinatesPayload]
  );

  const serverSyncSignature = useMemo(
    () =>
      JSON.stringify({
        coordinates: finalCoords ?? null,
        meta: plotMetaPayload,
        // These don't change the plot geometry/meta stored server-side, but they do change what
        // the next render looks like - without them here, tweaking e.g. road width after a
        // preview was already rendered left the "changes aren't in the preview yet" banner off.
        renderOptions: {
          contourInterval,
          topoBuildingHatch,
          northArrowStyle,
          northArrowColor,
          beaconStyle,
          roadWidth,
          boundaryColor,
          gridColor,
          textColor,
          roadColor,
          riverColor,
          buildingColor,
          buildingHatchType,
          roadStyle,
          titleFont,
          titleSize,
          gridFont,
          gridSize,
          stationFont,
          stationSize,
          bearingFont,
          bearingSize,
          areaFont,
          areaSize,
        },
      }),
    [
      finalCoords,
      plotMetaPayload,
      contourInterval,
      topoBuildingHatch,
      northArrowStyle,
      northArrowColor,
      beaconStyle,
      roadWidth,
      boundaryColor,
      gridColor,
      textColor,
      roadColor,
      riverColor,
      buildingColor,
      buildingHatchType,
      roadStyle,
      titleFont,
      titleSize,
      gridFont,
      gridSize,
      stationFont,
      stationSize,
      bearingFont,
      bearingSize,
      areaFont,
      areaSize,
    ]
  );

  const stationNames = useMemo(() => {
    return boundaryManualPoints.map((p) => (p.station || "").trim());
  }, [boundaryManualPoints]);

  useEffect(() => {
    if (!draftHydrated) return;
    const draftState: SurveyPlanDraftState = {
      workflowMode,
      currentStep,
      featureEditorOpen: showFeatureEditor,
      manualPoints,
      coordinateSystem,
      plotId,
      hasHeightData,
      previewType,
      topoSource,
      contourInterval,
      topoBuildingHatch,
      northArrowStyle,
      northArrowColor,
      beaconStyle,
      roadWidth,
      boundaryColor,
      gridColor,
      textColor,
      roadColor,
      riverColor,
      buildingColor,
      buildingHatchType,
      roadStyle,
      titleFont,
      titleSize,
      gridFont,
      gridSize,
      stationFont,
      stationSize,
      bearingFont,
      bearingSize,
      areaFont,
      areaSize,
      meta,
      hasManualScaleOverride,
      subdivisionMethod,
      subdivisionCountDraft,
      subdivisionTargetAreaDraft,
      subdivisionFractionDraft,
      subdivisionFractionBreaks,
      subdivisionCustomAreaDrafts,
      subdivisionParentAreaM2,
      subdivisionOrientationDraft,
      subdivisionLotPrefix,
      subdivisionEstateName,
      subdivisionLotNamesDraft,
      lastServerSyncAt,
      lastServerSyncSignature,
      hasUnsyncedServerChanges,
      georefSessionId: georefSession?.id || null,
      georefTargetCoordinateSystem,
      georefSelectedControlPointId,
    };

    if (pendingDraftWriteRef.current !== null) {
      window.clearTimeout(pendingDraftWriteRef.current);
    }
    pendingDraftWriteRef.current = window.setTimeout(() => {
      saveSurveyPlanDraft(ACTIVE_SURVEY_DRAFT_ID, draftState).catch(() => {});
      pendingDraftWriteRef.current = null;
    }, 180);

    return () => {
      if (pendingDraftWriteRef.current !== null) {
        window.clearTimeout(pendingDraftWriteRef.current);
        pendingDraftWriteRef.current = null;
      }
    };
  }, [
    draftHydrated,
    workflowMode,
    currentStep,
    showFeatureEditor,
    manualPoints,
    coordinateSystem,
    plotId,
    hasHeightData,
    previewType,
    topoSource,
    contourInterval,
    topoBuildingHatch,
    northArrowStyle,
    northArrowColor,
    beaconStyle,
    roadWidth,
    boundaryColor,
    gridColor,
    textColor,
    roadColor,
    riverColor,
    buildingColor,
    buildingHatchType,
    roadStyle,
    titleFont,
    titleSize,
    gridFont,
    gridSize,
    stationFont,
    stationSize,
    bearingFont,
    bearingSize,
    areaFont,
    areaSize,
    meta,
    hasManualScaleOverride,
    subdivisionMethod,
    subdivisionCountDraft,
    subdivisionTargetAreaDraft,
    subdivisionFractionDraft,
    subdivisionFractionBreaks,
    subdivisionCustomAreaDrafts,
    subdivisionParentAreaM2,
    subdivisionOrientationDraft,
    subdivisionLotPrefix,
    subdivisionEstateName,
    subdivisionLotNamesDraft,
    lastServerSyncAt,
    lastServerSyncSignature,
    hasUnsyncedServerChanges,
    georefSession?.id,
    georefTargetCoordinateSystem,
    georefSelectedControlPointId,
  ]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (skipDirtyEffectRef.current) {
      skipDirtyEffectRef.current = false;
      return;
    }
    if (!plotId) return;
    setHasUnsyncedServerChanges(lastServerSyncSignature !== serverSyncSignature);
  }, [
    draftHydrated,
    plotId,
    lastServerSyncSignature,
    serverSyncSignature,
  ]);

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
        const rings = subdivisionLotExteriorRings(plot.geometry)
          .map((ringRaw) =>
            closeRingIfNeeded(
              ringRaw
                .map((point) => [Number(point?.[0]), Number(point?.[1])])
                .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
            )
          )
          .filter((ring) => ring.length >= 3);
        if (!rings.length) return null;
        // Label at the centroid of the largest part - a merged lot spanning both sides of an
        // excluded road (see subdivisionLotExteriorRings) has more than one ring here.
        const mainRing = rings.reduce((a, b) => (ringBBoxArea(b) > ringBBoxArea(a) ? b : a));
        return {
          ...plot,
          rings,
          centroid: polygonCentroid(mainRing),
        };
      })
      .filter(Boolean) as Array<
      SubdivisionPreviewPlot & {
        rings: number[][][];
        centroid: [number, number];
      }
    >;

    if (!normalized.length) return null;

    // Rings for either a Polygon or MultiPolygon zone geometry, each closed and coerced to
    // finite [x,y] pairs - a MultiPolygon (a road split into two reserve strips, several
    // disjoint leftover slivers) becomes multiple independent rings here, which one SVG <path>
    // with several "M...Z" subpaths renders correctly (each disjoint part fills on its own).
    const extractZoneRings = (zone: SubdivisionZoneGeojson | null | undefined): number[][][] => {
      if (!zone?.geometry) return [];
      const polyRingsList: any[] = zone.geometry.type === "MultiPolygon" ? zone.geometry.coordinates || [] : [zone.geometry.coordinates || []];
      const out: number[][][] = [];
      polyRingsList.forEach((rings: any) => {
        const outerRing = (rings?.[0] || [])
          .map((point: any) => [Number(point?.[0]), Number(point?.[1])])
          .filter((point: number[]) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
        if (outerRing.length >= 3) out.push(closeRingIfNeeded(outerRing));
      });
      return out;
    };
    const excludedRings = extractZoneRings(subdivisionPreview.excluded_geojson);
    const leftoverRings = extractZoneRings(subdivisionPreview.leftover_geojson);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    normalized.forEach((plot) => {
      plot.rings.forEach((ring) => {
        ring.forEach((point) => {
          minX = Math.min(minX, point[0]);
          maxX = Math.max(maxX, point[0]);
          minY = Math.min(minY, point[1]);
          maxY = Math.max(maxY, point[1]);
        });
      });
    });
    [...excludedRings, ...leftoverRings].forEach((ring) => {
      ring.forEach((point) => {
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

    const ringsToPath = (rings: number[][][]) =>
      rings
        .map((ring) => {
          const projected = ring.map((pt) => mapPoint([pt[0], pt[1]]));
          return `${projected.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ")} Z`;
        })
        .join(" ");

    // A lot combining both sides of an excluded road is saved as two separate same-lot-number
    // entries (LOT-004A / LOT-004B, see combined_group) - grouping the color by combined_group
    // (falling back to the lot's own number) means both parts share a color instead of each
    // looking like an unrelated lot, even though each draws its own separate shape below.
    const colorKeyOrder: string[] = [];
    normalized.forEach((plot) => {
      const key = plot.combined_group || plot.lot_no;
      if (!colorKeyOrder.includes(key)) colorKeyOrder.push(key);
    });

    // A merged lot (see subdivisionLotExteriorRings) draws as multiple subpaths in one <path> -
    // SVG fills each disjoint part on its own, exactly like the zone/road paths below already do.
    const plots = normalized.map((plot, idx) => {
      const path = ringsToPath(plot.rings);
      const centroidProjected = mapPoint(plot.centroid);
      const colorIdx = colorKeyOrder.indexOf(plot.combined_group || plot.lot_no);
      return {
        idx,
        lotNo: displayedSubdivisionLotNames[idx] || plot.lot_no,
        areaM2: plot.area_m2,
        areaHa: plot.area_hectares,
        path,
        stroke: palette[colorIdx % palette.length],
        labelX: Math.max(26, Math.min(width - 26, centroidProjected.x)),
        labelY: Math.max(24, Math.min(height - 24, centroidProjected.y)),
      };
    });

    const excludedPath = excludedRings.length ? ringsToPath(excludedRings) : null;
    const leftoverPath = leftoverRings.length ? ringsToPath(leftoverRings) : null;

    // Individual roads (visual only in this lightweight fallback view - the Mapbox preview is
    // where they're actually clickable to delete; see subdivisionMapPreviewData).
    const roadSegmentPaths = (subdivisionPreview.road_segments || [])
      .map((seg) => {
        const coords = (seg.geojson?.geometry?.coordinates || [])
          .map((point) => [Number(point?.[0]), Number(point?.[1])])
          .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
        if (coords.length < 2) return null;
        const projected = coords.map((pt) => mapPoint([pt[0], pt[1]]));
        return projected.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
      })
      .filter(Boolean) as string[];

    return {
      width,
      height,
      plots,
      excludedPath,
      leftoverPath,
      roadSegmentPaths,
    };
  }, [subdivisionPreview, displayedSubdivisionLotNames]);

  const subdivisionMapPreviewData = useMemo(() => {
    if (!subdivisionPreview?.plots?.length) return null;

    const polygons: any[] = [];
    const labels: any[] = [];
    const stations: any[] = [];

    subdivisionPreview.plots.forEach((plot, idx) => {
      // A lot combining both sides of an excluded road is a MultiPolygon - Mapbox renders that
      // natively in a fill/line layer, so the real geometry goes straight into the Feature. The
      // "main" ring (the largest part) is only used below for where to put the label/stations.
      const rings = subdivisionLotExteriorRings(plot.geometry);
      if (!rings.length) return;
      const mainRing = rings.reduce((a, b) => (ringBBoxArea(b) > ringBBoxArea(a) ? b : a));
      const cleanRing = closeRingIfNeeded(mainRing);
      const centroid = polygonCentroid(cleanRing);
      const lotNo = displayedSubdivisionLotNames[idx] || plot.lot_no;

      polygons.push({
        type: "Feature",
        properties: {
          lotNo,
          areaHa: Number(plot.area_hectares || 0),
        },
        geometry: plot.geometry,
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

    // Road-exclusion corridor / fixed-dimension leftover area, shown as their own zones - never
    // as numbered lots. Either can legitimately be a MultiPolygon (a road split into two reserve
    // strips, several disjoint leftover slivers); Mapbox GL renders that natively in fill/line
    // layers, so the geometry is passed straight through rather than forced into single polygons.
    const zones: any[] = [];
    const zoneLabels: any[] = [];
    const addZone = (zone: SubdivisionZoneGeojson | null | undefined, kind: "excluded" | "leftover", areaM2: number | null | undefined, label: string) => {
      if (!zone?.geometry) return;
      zones.push({
        type: "Feature",
        properties: { kind },
        geometry: zone.geometry,
      });
      const firstRing = zone.geometry.type === "MultiPolygon" ? zone.geometry.coordinates?.[0]?.[0] : zone.geometry.coordinates?.[0];
      if (Array.isArray(firstRing) && firstRing.length >= 3) {
        const centroid = polygonCentroid(firstRing as number[][]);
        zoneLabels.push({
          type: "Feature",
          properties: { label: `${label}\n${(Number(areaM2 || 0) / 10000).toFixed(3)} ha` },
          geometry: { type: "Point", coordinates: [Number(centroid[0]), Number(centroid[1])] },
        });
      }
    };
    addZone(subdivisionPreview.excluded_geojson, "excluded", subdivisionPreview.excluded_area_m2, "Road Reserve");
    addZone(subdivisionPreview.leftover_geojson, "leftover", subdivisionPreview.leftover_area_m2, "Remainder");

    // Individual roads feeding into the exclusion, each clickable on the map so a user can select
    // and remove just that one (see deleteSubdivisionRoadSegment) instead of only the merged zone.
    const roadSegments = (subdivisionPreview.road_segments || [])
      .filter((seg) => seg?.geojson?.geometry?.coordinates?.length)
      .map((seg) => ({
        type: "Feature" as const,
        properties: { segmentId: seg.id },
        geometry: seg.geojson.geometry,
      }));

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
      zones: {
        type: "FeatureCollection",
        features: zones,
      },
      zoneLabels: {
        type: "FeatureCollection",
        features: zoneLabels,
      },
      roadSegments: {
        type: "FeatureCollection",
        features: roadSegments,
      },
    };
  }, [subdivisionPreview, displayedSubdivisionLotNames]);

  const fitSubdivisionMapToData = useCallback((map: any, fc: any) => {
    const mapboxgl = subdivisionMapboxRef.current;
    if (!mapboxgl || !fc?.features?.length) return;
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

    let disposed = false;

    void (async () => {
      const mapboxgl = await loadMapboxGl();
      if (disposed || !subdivisionMapContainerRef.current) return;
      subdivisionMapboxRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container: subdivisionMapContainerRef.current,
        style: isLowBandwidth
          ? "mapbox://styles/mapbox/streets-v12"
          : "mapbox://styles/mapbox/satellite-streets-v12",
        center: [7.5, 9.0],
        zoom: 6,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("load", () => {
        subdivisionMapReadyRef.current = true;

        // Zones (road-reserve / leftover) are added before the lots layers so they always sit
        // visually beneath the numbered lots.
        map.addSource("subdivision-zones-src", {
          type: "geojson",
          data: (subdivisionMapPreviewData?.zones || { type: "FeatureCollection", features: [] }) as any,
        });
        map.addLayer({
          id: "subdivision-zones-fill",
          type: "fill",
          source: "subdivision-zones-src",
          paint: {
            "fill-color": "#94a3b8",
            "fill-opacity": 0.35,
          },
        });
        map.addLayer({
          id: "subdivision-zones-line",
          type: "line",
          source: "subdivision-zones-src",
          paint: {
            "line-color": "#64748b",
            "line-width": 1.6,
            "line-dasharray": [2, 1.5],
          },
        });
        map.addSource("subdivision-zone-labels-src", {
          type: "geojson",
          data: (subdivisionMapPreviewData?.zoneLabels || { type: "FeatureCollection", features: [] }) as any,
        });
        map.addLayer({
          id: "subdivision-zone-labels",
          type: "symbol",
          source: "subdivision-zone-labels-src",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
            "text-anchor": "center",
          },
          paint: {
            "text-color": "#e2e8f0",
            "text-halo-color": "#334155",
            "text-halo-width": 1.3,
          },
        });

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

        // Individual roads feeding into "Exclude access road" - drawn last (on top) so they stay
        // clickable even where a lot or the road-reserve zone sits underneath. The "-hit" layer is
        // a wide, invisible line purely to make thin road lines easy to click/tap.
        map.addSource("subdivision-road-segments-src", {
          type: "geojson",
          data: (subdivisionMapPreviewData?.roadSegments || { type: "FeatureCollection", features: [] }) as any,
        });
        map.addLayer({
          id: "subdivision-road-segments-hit",
          type: "line",
          source: "subdivision-road-segments-src",
          paint: { "line-color": "#000000", "line-width": 18, "line-opacity": 0.01 },
        });
        map.addLayer({
          id: "subdivision-road-segments-line",
          type: "line",
          source: "subdivision-road-segments-src",
          paint: {
            // Highlighted when it matches selectedRoadSegmentId - kept in sync by the effect
            // below via setPaintProperty, since a fresh paint expression is baked in at layer
            // creation and this layer isn't recreated every time the selection changes.
            "line-color": ["case", ["==", ["get", "segmentId"], ""], "#facc15", "#fb923c"],
            "line-width": ["case", ["==", ["get", "segmentId"], ""], 5, 3.2],
            "line-dasharray": [1.5, 1],
          },
        });
        map.on("click", "subdivision-road-segments-hit", (e: any) => {
          const segmentId = e.features?.[0]?.properties?.segmentId;
          if (!segmentId) return;
          setSelectedRoadSegmentId((prev) => (prev === segmentId ? null : segmentId));
        });
        map.on("mouseenter", "subdivision-road-segments-hit", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "subdivision-road-segments-hit", () => {
          map.getCanvas().style.cursor = "";
        });

        if (subdivisionMapPreviewData?.polygons) {
          fitSubdivisionMapToData(map, subdivisionMapPreviewData.polygons);
        }
      });

      subdivisionMapRef.current = map;
    })();

    return () => {
      disposed = true;
    };
  }, [
    workflowMode,
    currentStep,
    subdivisionPreviewPanelTab,
    subdivisionMapPreviewData,
    isLowBandwidth,
    fitSubdivisionMapToData,
  ]);

  useEffect(() => {
    const map = subdivisionMapRef.current;
    if (!map || !subdivisionMapReadyRef.current) return;
    const polySource = map.getSource("subdivision-lots-src") as any;
    const labelSource = map.getSource("subdivision-lots-labels-src") as any;
    const stationSource = map.getSource("subdivision-stations-src") as any;
    const zoneSource = map.getSource("subdivision-zones-src") as any;
    const zoneLabelSource = map.getSource("subdivision-zone-labels-src") as any;
    const roadSegmentSource = map.getSource("subdivision-road-segments-src") as any;
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
    if (zoneSource) {
      zoneSource.setData((subdivisionMapPreviewData?.zones || { type: "FeatureCollection", features: [] }) as any);
    }
    if (zoneLabelSource) {
      zoneLabelSource.setData((subdivisionMapPreviewData?.zoneLabels || { type: "FeatureCollection", features: [] }) as any);
    }
    if (roadSegmentSource) {
      roadSegmentSource.setData((subdivisionMapPreviewData?.roadSegments || { type: "FeatureCollection", features: [] }) as any);
    }
  }, [subdivisionMapPreviewData, fitSubdivisionMapToData]);

  useEffect(() => {
    const map = subdivisionMapRef.current;
    if (!map || !subdivisionMapReadyRef.current) return;
    if (!map.getLayer("subdivision-road-segments-line")) return;
    const matchId = selectedRoadSegmentId ?? "";
    map.setPaintProperty("subdivision-road-segments-line", "line-color", [
      "case", ["==", ["get", "segmentId"], matchId], "#facc15", "#fb923c",
    ]);
    map.setPaintProperty("subdivision-road-segments-line", "line-width", [
      "case", ["==", ["get", "segmentId"], matchId], 5, 3.2,
    ]);
  }, [selectedRoadSegmentId, subdivisionMapPreviewData]);

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
      subdivisionMapboxRef.current = null;
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
    const validPoints = boundaryManualPoints.filter(
      (p) => (p.lng !== 0 || p.lat !== 0) && !isNaN(p.lng) && !isNaN(p.lat)
    );
    return validPoints.length >= 3;
  }, [boundaryManualPoints]);

  // Convert form coordinates to WGS84 for map display - boundary points only, so the interactive
  // draw polygon never gets distorted by mixed-in spot-height-only samples.
  const mapCoordinates = useMemo(() => {
    if (effectiveCoordinateSystem === "wgs84") {
      return boundaryManualPoints;
    }
    // Convert projected coordinates to WGS84 for map
    return boundaryManualPoints.map((p) => {
      if (p.lng === 0 && p.lat === 0) {
        return p;
      }
      const [lng, lat] = toWGS84(p.lng, p.lat, effectiveCoordinateSystem);
      return {
        station: p.station,
        lng,
        lat,
      };
    });
  }, [boundaryManualPoints, effectiveCoordinateSystem]);

  // Every uploaded point (boundary corners and spot-height-only samples alike, WGS84) for the
  // read-only "Spot Heights" map view - a boundary corner is also a spot height, so nothing is
  // excluded here the way it is for mapCoordinates above.
  const spotHeightMapCoordinates = useMemo(() => {
    if (effectiveCoordinateSystem === "wgs84") {
      return manualPoints;
    }
    return manualPoints.map((p) => {
      if (p.lng === 0 && p.lat === 0) {
        return p;
      }
      const [lng, lat] = toWGS84(p.lng, p.lat, effectiveCoordinateSystem);
      return {
        station: p.station,
        lng,
        lat,
        is_boundary: p.is_boundary !== false,
      };
    });
  }, [manualPoints, effectiveCoordinateSystem]);

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

  // Mirrors savePlotToStorage above, but for georeference sessions - claimSurveyGeorefSessions
  // (surveyAuth.ts) reads this list right after sign-in to attach any session id started here
  // anonymously to the now-known user account.
  const saveGeorefSessionToStorage = (id: string) => {
    const STORAGE_KEY = "landcheck_georef_sessions";
    const stored = localStorage.getItem(STORAGE_KEY);
    const sessions: { id: string }[] = stored ? JSON.parse(stored) : [];
    if (sessions.some((s) => s.id === id)) return;
    sessions.unshift({ id });
    if (sessions.length > 50) sessions.pop();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  };

  const fetchPlotFeatures = useCallback(async (id: number) => {
    const planGeneration = planGenerationRef.current;
    const featureRes = await api.get(`/plots/${id}/features`);
    if (planGeneration === planGenerationRef.current) {
      setFeatures(featureRes.data);
    }
  }, []);

  const markServerSynced = useCallback(() => {
    const now = new Date().toISOString();
    setLastServerSyncAt(now);
    setLastServerSyncSignature(serverSyncSignature);
    setHasUnsyncedServerChanges(false);
  }, [serverSyncSignature]);

  const ensureServerPlot = useCallback(
    async (_reason: string, options?: { fetchFeatures?: boolean }) => {
      const planGeneration = planGenerationRef.current;
      const assertCurrentPlan = () => {
        if (planGeneration !== planGenerationRef.current) {
          throw new DOMException("Survey plan was replaced", "AbortError");
        }
      };
      if (!finalCoords) {
        throw new Error("Enter at least 3 valid coordinate points");
      }
      if (!isOnline) {
        throw new Error("You are offline. Keep editing locally and reconnect before requesting official preview or export.");
      }

      setServerSyncing(true);

      try {
        let activePlotId = plotId;
        const serverDraftCurrent = Boolean(
          activePlotId &&
            lastServerSyncSignature &&
            lastServerSyncSignature === serverSyncSignature
        );
        if (!activePlotId) {
          // Reuse the same client_request_id across retries of creating THIS draft (so a lost
          // response doesn't create a duplicate plot server-side), but mint a new one once the
          // draft itself changes (a genuinely different logical attempt).
          const draftSignature = JSON.stringify({ coords: finalCoords, meta: plotMetaPayload });
          if (plotCreateRequestIdRef.current?.signature !== draftSignature) {
            plotCreateRequestIdRef.current = {
              signature: draftSignature,
              id:
                typeof window.crypto?.randomUUID === "function"
                  ? window.crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
            };
          }
          const res = await withRetry(() =>
            api.post("/plots", {
              coordinates: finalCoords,
              meta: plotMetaPayload,
              client_request_id: plotCreateRequestIdRef.current!.id,
            })
          );
          assertCurrentPlan();
          activePlotId = Number(res.data.plot_id ?? res.data.id);
          await withRetry(() => api.post(`/plots/${activePlotId}/meta`, plotMetaPayload));
          assertCurrentPlan();
          setPlotId(activePlotId);
          savePlotToStorage(activePlotId);
          setSubdivisionPreview(null);
          setSubdivisionBatches([]);
          setLatestSubdivisionBatchId(null);
          toast.success("Server plot created from local draft.");
        } else if (!serverDraftCurrent) {
          await withRetry(() =>
            api.post(`/plots/${activePlotId}/geometry`, {
              coordinates: finalCoords,
            })
          );
          await withRetry(() => api.post(`/plots/${activePlotId}/meta`, plotMetaPayload));
          assertCurrentPlan();
        }

        if (options?.fetchFeatures && !features) {
          await fetchPlotFeatures(activePlotId);
          assertCurrentPlan();
        }

        assertCurrentPlan();
        markServerSynced();
        return activePlotId;
      } finally {
        if (planGeneration === planGenerationRef.current) {
          setServerSyncing(false);
        }
      }
    },
    [
      fetchPlotFeatures,
      features,
      finalCoords,
      isOnline,
      lastServerSyncSignature,
      markServerSynced,
      plotId,
      plotMetaPayload,
      serverSyncSignature,
    ]
  );

  const continueWithLocalDraft = useCallback(() => {
    if (!hasValidCoords) {
      toast.error("Enter at least 3 valid coordinate points");
      return;
    }
    if (workflowMode === "subdivision") {
      setSubdivisionPreviewPanelTab("survey_plan");
    }
    startTransition(() => {
      setCurrentStep(2);
    });
    toast.success(
      "Draft saved locally. Click \"Preview Survey Plan\" below to generate and see your survey plan.",
      { duration: 5000 }
    );
  }, [hasValidCoords, workflowMode]);

  function buildPlotMetaPayload() {
    return plotMetaPayload;
  }

  // Load preview image
  const loadPreview = useCallback(async (acceptedRecommendation?: PreviewRenderSelection) => {
    const requestId = ++previewRequestId.current;
    const planGeneration = planGenerationRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setPreviewLoading(true);
    try {
      const activePlotId = await ensureServerPlot("Syncing draft for official survey preview...", {
        fetchFeatures: true,
      });
      if (requestId !== previewRequestId.current || planGeneration !== planGenerationRef.current) return;
      if (!acceptedRecommendation && !hasManualScaleOverride && isAutoScaleText(effectiveRenderScaleText)) {
        const recommendationResponse = await api.post<ScaleRecommendation>(
          `/plots/${activePlotId}/scale-recommendation`,
          {
            coordinate_system: effectiveCoordinateSystem,
            paper_size: meta.paper_size,
            template_name: meta.template_name,
            survey_input_coordinates: surveyInputCoordinatesPayload,
          },
          { timeout: SLOW_NETWORK_TIMEOUT_MS, signal: controller.signal },
        );
        if (requestId === previewRequestId.current && planGeneration === planGenerationRef.current) {
          setScaleRecommendation(recommendationResponse.data);
        }
        return;
      }
      const payload = {
        ...buildPlotMetaPayload(),
        scale_text: acceptedRecommendation?.scale_text || effectiveRenderScaleText,
        paper_size: acceptedRecommendation?.paper_size || meta.paper_size,
        station_names: stationNames,
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
        beacon_style: beaconStyle,
        road_width_m: Number(roadWidth),
        boundary_color: boundaryColor,
        grid_color: gridColor,
        text_color: textColor,
        road_color: roadColor,
        river_color: riverColor,
        building_color: buildingColor,
        building_hatch_type: buildingHatchType,
        road_style: roadStyle,
        ...textStylePayload,
      };

      const res = await withRetry(() =>
        api.post(`/plots/${activePlotId}/report/preview`, payload, {
          responseType: "blob",
          timeout: SLOW_NETWORK_TIMEOUT_MS,
          signal: controller.signal,
        })
      );

      if (requestId !== previewRequestId.current || planGeneration !== planGenerationRef.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      const resolvedScale = String(res.headers["x-landcheck-resolved-scale"] || "").trim();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      if (resolvedScale) {
        setMeta((prev) => (prev.scale_text === resolvedScale ? prev : { ...prev, scale_text: resolvedScale }));
      }
      markServerSynced();
    } catch (err) {
      if (controller.signal.aborted || planGeneration !== planGenerationRef.current) return;
      console.error("Preview error:", err);
      const message = await extractApiErrorMessage(err, "Failed to load preview");
      toast.error(message);
    } finally {
      if (requestId === previewRequestId.current && planGeneration === planGenerationRef.current) {
        setPreviewLoading(false);
      }
    }
  }, [
    stationNames,
    northArrowStyle,
    northArrowColor,
    beaconStyle,
    roadWidth,
    boundaryColor,
    gridColor,
    textColor,
    roadColor,
    riverColor,
    buildingColor,
    buildingHatchType,
    roadStyle,
    titleFont,
    titleSize,
    gridFont,
    gridSize,
    stationFont,
    stationSize,
    bearingFont,
    bearingSize,
    areaFont,
    areaSize,
    ensureServerPlot,
    hasManualScaleOverride,
    effectiveRenderScaleText,
    effectiveCoordinateSystem,
    meta.paper_size,
    meta.template_name,
    surveyInputCoordinatesPayload,
    markServerSynced,
  ]);

  // Load orthophoto preview (satellite imagery)
  const loadOrthophoto = useCallback(async () => {
    const requestId = ++orthophotoRequestId.current;
    const planGeneration = planGenerationRef.current;
    orthophotoAbortRef.current?.abort();
    const controller = new AbortController();
    orthophotoAbortRef.current = controller;
    setOrthophotoLoading(true);
    try {
      const activePlotId = await ensureServerPlot("Syncing draft for official orthophoto preview...");
      if (requestId !== orthophotoRequestId.current || planGeneration !== planGenerationRef.current) return;
      const res = await withRetry(() =>
        api.post(`/plots/${activePlotId}/orthophoto/preview`, {
          scale_text: effectiveRenderScaleText,
          station_names: stationNames,
          coordinate_system: effectiveCoordinateSystem,
          paper_size: meta.paper_size,
          use_topo_map: false, // Always satellite for orthophoto
          north_arrow_style: northArrowStyle,
          north_arrow_color: northArrowColor,
        }, {
          responseType: "blob",
          timeout: SLOW_NETWORK_TIMEOUT_MS,
          signal: controller.signal,
        })
      );

      if (requestId !== orthophotoRequestId.current || planGeneration !== planGenerationRef.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setOrthophotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      markServerSynced();
    } catch (err) {
      if (controller.signal.aborted || planGeneration !== planGenerationRef.current) return;
      console.error("Orthophoto preview error:", err);
      const message = await extractApiErrorMessage(err, "Failed to load orthophoto preview");
      toast.error(message);
    } finally {
      if (requestId === orthophotoRequestId.current && planGeneration === planGenerationRef.current) {
        setOrthophotoLoading(false);
      }
    }
  }, [
    effectiveRenderScaleText,
    stationNames,
    effectiveCoordinateSystem,
    meta.paper_size,
    northArrowStyle,
    northArrowColor,
    ensureServerPlot,
    markServerSynced,
  ]);

  // Load topo map preview (OpenTopoMap tiles or user height data)
  const loadTopoMap = useCallback(async (source: "opentopomap" | "userdata" = "opentopomap") => {
    const requestId = ++topoRequestId.current;
    const planGeneration = planGenerationRef.current;
    topoAbortRef.current?.abort();
    const controller = new AbortController();
    topoAbortRef.current = controller;
    setTopoMapLoading(true);

    try {
      const activePlotId = await ensureServerPlot("Syncing draft for official topo map preview...");
      if (requestId !== topoRequestId.current || planGeneration !== planGenerationRef.current) return;
      const res = await withRetry(() =>
        api.post(`/plots/${activePlotId}/orthophoto/preview`, {
          scale_text: effectiveRenderScaleText,
          station_names: stationNames,
          coordinate_system: effectiveCoordinateSystem,
          paper_size: meta.paper_size,
          use_topo_map: true, // Always topo for topo map
          topo_source: source, // "opentopomap" or "userdata"
          elevation_points: source === "userdata" ? elevationPointsPayload : [],
          contour_interval: contourInterval, // null = Auto
          building_hatch_type: topoBuildingHatch,
          north_arrow_style: northArrowStyle,
          north_arrow_color: northArrowColor,
        }, {
          responseType: "blob",
          timeout: SLOW_NETWORK_TIMEOUT_MS,
          signal: controller.signal,
        })
      );

      if (requestId !== topoRequestId.current || planGeneration !== planGenerationRef.current) {
        return;
      }

      const url = URL.createObjectURL(res.data);
      setTopoMapUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      markServerSynced();
    } catch (err) {
      if (controller.signal.aborted || planGeneration !== planGenerationRef.current) return;
      console.error("Topo map preview error:", err);
      const message = await extractApiErrorMessage(err, "Failed to load topo map preview");
      toast.error(message);
    } finally {
      if (requestId === topoRequestId.current && planGeneration === planGenerationRef.current) {
        setTopoMapLoading(false);
      }
    }
  }, [
    effectiveRenderScaleText,
    stationNames,
    effectiveCoordinateSystem,
    meta.paper_size,
    elevationPointsPayload,
    contourInterval,
    topoBuildingHatch,
    northArrowStyle,
    northArrowColor,
    ensureServerPlot,
    markServerSynced,
  ]);

  const refreshCurrentPreview = useCallback(async () => {
    if (scaleDraftDirty) {
      const resolved = resolveScaleDraftState();
      applyResolvedScaleState(resolved);
      if (resolved.manualOverride && previewType === "survey") {
        await loadPreview({
          scale_text: resolved.scaleText,
          paper_size: meta.paper_size as PreviewRenderSelection["paper_size"],
        });
        return;
      }
    }
    if (previewType === "orthophoto") {
      await loadOrthophoto();
      return;
    }
    if (previewType === "topomap") {
      await loadTopoMap(topoSource);
      return;
    }
    await loadPreview();
  }, [
    applyResolvedScaleState,
    loadOrthophoto,
    loadPreview,
    loadTopoMap,
    previewType,
    resolveScaleDraftState,
    scaleDraftDirty,
    meta.paper_size,
    topoSource,
  ]);

  const acceptScaleRecommendation = useCallback(() => {
    if (!scaleRecommendation) return;
    const recommendation = scaleRecommendation;
    applyResolvedScaleState({
      scaleText: recommendation.scale_text,
      nextDraft: String(recommendation.scale_denominator),
      manualOverride: true,
    });
    setMeta((current) =>
      current.paper_size === recommendation.paper_size
        ? current
        : { ...current, paper_size: recommendation.paper_size },
    );
    setScaleRecommendation(null);
    void loadPreview(recommendation);
  }, [applyResolvedScaleState, loadPreview, scaleRecommendation]);

  useEffect(() => {
    if (workflowMode === "subdivision" && currentStep === 2 && previewType !== "survey") {
      setPreviewType("survey");
    }
  }, [workflowMode, currentStep, previewType]);

  const goToStep = useCallback((step: number) => {
    startTransition(() => {
      setCurrentStep(step);
    });
  }, []);

  const handlePreviewTypeChange = useCallback((type: PreviewType) => {
    startTransition(() => {
      setPreviewType(type);
    });
  }, []);

  const handleTopoSourceChange = useCallback((source: TopoSource) => {
    setTopoSource(source);
  }, []);

  const handleContourIntervalChange = useCallback((interval: number | null) => {
    setContourInterval(interval);
  }, []);

  const handleTopoBuildingHatchChange = useCallback((value: string) => {
    setTopoBuildingHatch(value as BuildingHatchType);
  }, []);

  const handleNorthArrowStyleChange = useCallback((value: string) => {
    setNorthArrowStyle(value as NorthArrowStyle);
  }, []);

  const handleNorthArrowColorChange = useCallback((value: string) => {
    setNorthArrowColor(value as NorthArrowColor);
  }, []);

  const handleBeaconStyleChange = useCallback((value: string) => {
    setBeaconStyle(value as BeaconStyle);
  }, []);

  const handleRoadWidthChange = useCallback((value: string) => {
    setRoadWidth(value as RoadWidthOption);
  }, []);

  const handleBuildingHatchTypeChange = useCallback((value: string) => {
    setBuildingHatchType(value as BuildingHatchType);
  }, []);

  const handleRoadStyleChange = useCallback((value: string) => {
    setRoadStyle(value as RoadStyleOption);
  }, []);

  const handleCreateGeoreferenceSession = useCallback(
    async (file: File, titleText: string, targetCoordinateSystem: string) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title_text", String(titleText || "").trim() || file.name || "Scanned raster");
      formData.append("target_coordinate_system", targetCoordinateSystem);
      setGeorefUploading(true);
      try {
        const res = await api.post("/survey-georeference/sessions", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const session = res.data?.session as GeoreferenceSession;
        applyGeoreferenceSession(session);
        await loadGeoreferenceRaster(session.id);
        toast.success("Raster uploaded. Add matching control points to anchor it.");
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        toast.error(typeof detail === "string" ? detail : "Unable to upload this raster.");
      } finally {
        setGeorefUploading(false);
      }
    },
    [applyGeoreferenceSession, loadGeoreferenceRaster]
  );

  const invalidateGeoreferenceSolve = useCallback((nextPoints: GeoreferenceControlPoint[]) => {
    setGeorefSession((current) => {
      if (!current) return current;
      return {
        ...current,
        status: "draft",
        ground_control_points: nextPoints,
        transform: null,
        overlay: null,
        features: [],
      };
    });
    setGeorefFeatures([]);
  }, []);

  const handleAddGeoreferenceControlPoint = useCallback(() => {
    const nextId = `gcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const estimated = estimateNextGeoreferenceControlPoint(
      georefSession?.ground_control_points || [],
      georefSession?.source_width || 0,
      georefSession?.source_height || 0,
      georefTargetCoordinateSystem,
    );
    const nextPoint: GeoreferenceControlPoint = {
      id: nextId,
      label: `GCP ${((georefSession?.ground_control_points?.length || 0) + 1).toString()}`,
      image_x: estimated.image_x,
      image_y: estimated.image_y,
      ground_x: estimated.ground_x,
      ground_y: estimated.ground_y,
      lng: estimated.lng,
      lat: estimated.lat,
    };
    const nextPoints = [...(georefSession?.ground_control_points || []), nextPoint];
    invalidateGeoreferenceSolve(nextPoints);
    setGeorefSelectedControlPointId(nextId);
  }, [
    georefSession?.ground_control_points,
    georefSession?.source_height,
    georefSession?.source_width,
    georefTargetCoordinateSystem,
    invalidateGeoreferenceSolve,
  ]);

  const handleSelectGeoreferenceControlPoint = useCallback((controlPointId: string) => {
    setGeorefSelectedControlPointId(controlPointId);
  }, []);

  const handleRemoveGeoreferenceControlPoint = useCallback(
    (controlPointId: string) => {
      const nextPoints = (georefSession?.ground_control_points || []).filter((item) => item.id !== controlPointId);
      invalidateGeoreferenceSolve(nextPoints);
      setGeorefSelectedControlPointId(nextPoints[nextPoints.length - 1]?.id || null);
    },
    [georefSession?.ground_control_points, invalidateGeoreferenceSolve]
  );

  const handleUpdateGeoreferenceControlPoint = useCallback(
    (
      controlPointId: string,
      field: "label" | "ground_x" | "ground_y" | "image_x" | "image_y",
      value: string | number
    ) => {
      setGeorefSession((current) => {
        if (!current) return current;
        const nextPoints = (current.ground_control_points || []).map((item) => {
          if (item.id !== controlPointId) return item;
          if (field === "label") {
            return { ...item, label: String(value || "").trim() || item.label };
          }
          const nextValue = Number.parseFloat(String(value));
          const safeValue = Number.isFinite(nextValue) ? nextValue : 0;
          if (field === "ground_x") {
            return { ...item, ground_x: safeValue, lng: safeValue };
          }
          if (field === "ground_y") {
            return { ...item, ground_y: safeValue, lat: safeValue };
          }
          return { ...item, [field]: safeValue };
        });
        return {
          ...current,
          status: "draft",
          ground_control_points: nextPoints,
          transform: null,
          overlay: null,
          features: [],
        };
      });
      setGeorefFeatures([]);
    },
    []
  );

  const handleAssignGeoreferenceImagePoint = useCallback(
    (pixelX: number, pixelY: number) => {
      if (!georefSelectedControlPointId) {
        toast.error("Select a control point first.");
        return;
      }
      handleUpdateGeoreferenceControlPoint(georefSelectedControlPointId, "image_x", pixelX);
      handleUpdateGeoreferenceControlPoint(georefSelectedControlPointId, "image_y", pixelY);
    },
    [georefSelectedControlPointId, handleUpdateGeoreferenceControlPoint]
  );

  const handleAssignGeoreferenceMapPoint = useCallback(
    (lng: number, lat: number) => {
      if (!georefSelectedControlPointId) {
        toast.error("Select a control point first.");
        return;
      }
      const [groundX, groundY] = fromWGS84(lng, lat, georefTargetCoordinateSystem || "wgs84");
      handleUpdateGeoreferenceControlPoint(georefSelectedControlPointId, "ground_x", groundX);
      handleUpdateGeoreferenceControlPoint(georefSelectedControlPointId, "ground_y", groundY);
    },
    [georefSelectedControlPointId, georefTargetCoordinateSystem, handleUpdateGeoreferenceControlPoint]
  );

  const handleSolveGeoreference = useCallback(async (options?: { silent?: boolean }) => {
    if (!georefSession?.id) {
      if (!options?.silent) toast.error("Upload a raster first.");
      return;
    }
    const controlPoints = (georefSession.ground_control_points || []).map((item) => ({
      id: item.id,
      label: item.label,
      image_x: Number(item.image_x),
      image_y: Number(item.image_y),
      ground_x: Number(item.ground_x),
      ground_y: Number(item.ground_y),
      lng: Number(item.ground_x),
      lat: Number(item.ground_y),
    }));
    if (controlPoints.length < 3) {
      if (!options?.silent) toast.error("Add at least 3 control points.");
      return;
    }
    setGeorefSolving(true);
    try {
      const res = await api.post(`/survey-georeference/sessions/${encodeURIComponent(georefSession.id)}/solve`, {
        target_coordinate_system: georefTargetCoordinateSystem,
        ground_control_points: controlPoints,
      });
      const session = res.data?.session as GeoreferenceSession;
      applyGeoreferenceSession(session, georefSelectedControlPointId);
      if (!options?.silent) toast.success("Raster anchored. You can now digitize boundaries and points.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (!options?.silent) toast.error(typeof detail === "string" ? detail : "Unable to solve the georeference transform.");
    } finally {
      setGeorefSolving(false);
    }
  }, [applyGeoreferenceSession, georefSelectedControlPointId, georefSession, georefTargetCoordinateSystem]);

  // Editing/adding a control point clears the previous transform (it's now stale - see
  // invalidateGeoreferenceSolve) so the map overlay correctly stops showing an outdated raster
  // footprint. Left alone, the user would have to remember to click "Solve Georeference" after
  // every single point edit just to see where things actually stand. Auto re-solving (debounced,
  // and silent so it doesn't spam a toast per keystroke) keeps the ground-control map's raster
  // and GCP markers in sync with whatever points are currently on screen.
  const georefAutoSolveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (georefAutoSolveTimerRef.current !== null) {
      window.clearTimeout(georefAutoSolveTimerRef.current);
      georefAutoSolveTimerRef.current = null;
    }
    if (!georefSession?.id || georefSession.status !== "draft" || georefSolving) return;
    const completePoints = (georefSession.ground_control_points || []).filter(
      (item) =>
        Number.isFinite(item.image_x) &&
        Number.isFinite(item.image_y) &&
        Number.isFinite(item.ground_x) &&
        Number.isFinite(item.ground_y) &&
        (Math.abs(item.image_x) > 0.5 || Math.abs(item.image_y) > 0.5) &&
        (Math.abs(item.ground_x) > 1e-6 || Math.abs(item.ground_y) > 1e-6)
    );
    if (completePoints.length < 3) return;
    georefAutoSolveTimerRef.current = window.setTimeout(() => {
      georefAutoSolveTimerRef.current = null;
      void handleSolveGeoreference({ silent: true });
    }, 900);
    return () => {
      if (georefAutoSolveTimerRef.current !== null) {
        window.clearTimeout(georefAutoSolveTimerRef.current);
        georefAutoSolveTimerRef.current = null;
      }
    };
  }, [georefSession?.id, georefSession?.status, georefSession?.ground_control_points, georefSolving, handleSolveGeoreference]);

  const handleDeleteGeoreferenceSession = useCallback(async () => {
    if (!georefSession?.id) {
      clearGeorefLocalState();
      return;
    }
    try {
      await api.delete(`/survey-georeference/sessions/${encodeURIComponent(georefSession.id)}`);
      clearGeorefLocalState();
      toast.success("Georeference session removed.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Unable to delete this session.");
    }
  }, [clearGeorefLocalState, georefSession?.id]);

  const handleSaveGeoreferenceFeatures = useCallback(async () => {
    if (!georefSession?.id) {
      toast.error("Open a georeference session first.");
      return;
    }
    if (!georefFeatures.length) {
      toast.error("Digitize at least one feature before saving.");
      return;
    }
    setGeorefSavingFeatures(true);
    try {
      const res = await api.post(`/survey-georeference/sessions/${encodeURIComponent(georefSession.id)}/features`, {
        features: georefFeatures,
      });
      const session = res.data?.session as GeoreferenceSession;
      applyGeoreferenceSession(session, georefSelectedControlPointId);
      toast.success("Digitized features saved.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Unable to save digitized features.");
    } finally {
      setGeorefSavingFeatures(false);
    }
  }, [applyGeoreferenceSession, georefFeatures, georefSelectedControlPointId, georefSession?.id]);

  const handleDownloadGeoreferenceCsv = useCallback(async () => {
    if (!isSurveyAuthed()) {
      openSignupGate({ type: "georeference-csv" });
      return;
    }
    if (!georefSession?.id) {
      toast.error("Open a georeference session first.");
      return;
    }
    setGeorefDownloadingCsv(true);
    try {
      const res = await api.get(`/survey-georeference/sessions/${encodeURIComponent(georefSession.id)}/exports/staking.csv`, {
        responseType: "blob",
        timeout: SLOW_NETWORK_TIMEOUT_MS,
      });
      const georefIdentity =
        georefSession.title_text?.trim() ||
        (georefSession.source_file_name ? georefSession.source_file_name.replace(/\.[^./]+$/, "") : "") ||
        `Session_${georefSession.id.slice(0, 8)}`;
      triggerBlobDownload(
        res.data,
        res.headers["content-type"],
        buildExportFilename([georefIdentity], "DGPS_Staking", "csv")
      );
      toast.success("DGPS CSV downloaded.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Unable to download the DGPS CSV.");
    } finally {
      setGeorefDownloadingCsv(false);
    }
  }, [georefSession, openSignupGate, buildExportFilename]);

  const handleContinueGeoreferenceToSurvey = useCallback(async () => {
    const sourceFeatures = georefFeatures.length ? georefFeatures : georefSession?.features || [];
    const primaryPolygon =
      sourceFeatures.find((item) => item.feature_type === "polygon" && item.is_primary) ||
      sourceFeatures.find((item) => item.feature_type === "polygon") ||
      null;
    if (!primaryPolygon?.target_coordinates?.length) {
      toast.error("Set and save a primary polygon before continuing.");
      return;
    }
    const openCoordinates = [...primaryPolygon.target_coordinates];
    if (openCoordinates.length > 1) {
      const first = openCoordinates[0];
      const last = openCoordinates[openCoordinates.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        openCoordinates.pop();
      }
    }
    if (openCoordinates.length < 3) {
      toast.error("The primary polygon needs at least 3 vertices.");
      return;
    }
    const sessionId = georefSession?.id || null;
    const nextCoordinateSystem = georefSession?.target_coordinate_system || georefTargetCoordinateSystem || "wgs84";
    setGeorefContinuing(true);
    setManualPoints(
      openCoordinates.map((point, index) => ({
        station: getStationName(index),
        lng: Number(point[0]),
        lat: Number(point[1]),
      }))
    );
    setCoordinateSystem(nextCoordinateSystem);
    setPlotId(null);
    setFeatures(null);
    setPreviewUrl(null);
    setOrthophotoUrl(null);
    setTopoMapUrl(null);
    setHasHeightData(false);
    setLastServerSyncAt(null);
    setLastServerSyncSignature(null);
    setHasUnsyncedServerChanges(false);
    clearGeorefLocalState();
    setWorkflowMode("survey");
    setPreviewType("survey");
    startTransition(() => {
      setCurrentStep(1);
    });
    try {
      if (sessionId) {
        await api.delete(`/survey-georeference/sessions/${encodeURIComponent(sessionId)}`);
      }
      toast.success("Primary polygon moved into Survey Plan. Temporary raster released from storage.");
    } catch {
      toast.success("Primary polygon moved into Survey Plan. Temporary raster will still auto-expire.");
    } finally {
      setGeorefContinuing(false);
    }
  }, [
    clearGeorefLocalState,
    georefFeatures,
    georefSession?.id,
    georefSession?.features,
    georefSession?.target_coordinate_system,
    georefTargetCoordinateSystem,
  ]);

  useEffect(() => {
    if (!workflowMode) return undefined;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const prewarm = () => {
      if (cancelled) return;
      if (workflowMode === "georeference" && currentStep === 1) {
        void import("../components/survey-plan/SurveyPlanGeoreferenceSetupStep");
        return;
      }
      if ((workflowMode === "survey" || workflowMode === "subdivision") && currentStep === 1) {
        void import("../components/survey-plan/SurveyPlanStepOnePanel");
        return;
      }
      if (workflowMode === "survey" && currentStep === 2) {
        void import("../components/survey-plan/SurveyPlanSurveyPreviewStep");
      } else if (workflowMode === "subdivision" && currentStep === 2) {
        void import("../components/survey-plan/SurveyPlanSubdivisionPreviewStep");
      } else if (workflowMode === "georeference" && currentStep === 2) {
        void import("../components/survey-plan/SurveyPlanGeoreferenceWorkspaceStep");
      } else if (workflowMode === "georeference" && currentStep === 3) {
        void import("../components/survey-plan/SurveyPlanGeoreferenceExportStep");
      } else if (workflowMode === "subdivision" && currentStep === 3) {
        void import("../components/survey-plan/SurveyPlanSubdivisionExportStep");
      } else {
        void import("../components/SurveyPreview");
      }
      if (workflowMode === "survey" && !isLowBandwidth) {
        void import("../components/FeatureOverrideModal");
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(prewarm, { timeout: 1200 });
    } else {
      timeoutId = globalThis.setTimeout(prewarm, 500);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [currentStep, isLowBandwidth, workflowMode]);

  const previewActionLabel =
    previewType === "orthophoto"
      ? "Render Orthophoto"
      : previewType === "topomap"
        ? "Render Topo Map"
        : workflowMode === "subdivision"
          ? "Render Parcel Preview"
          : "Preview Survey Plan";

  // Whether the currently-selected preview tab (survey/orthophoto/topomap) has ever been
  // rendered at all - distinct from hasUnsyncedServerChanges, which only tracks a render going
  // stale after an edit. A brand-new local-only draft (never synced, plotId is null) has no
  // preview yet and hasUnsyncedServerChanges never fires for it (it requires a plotId), so this
  // covers that case too.
  const hasRenderedCurrentPreview = Boolean(
    previewType === "orthophoto" ? orthophotoUrl : previewType === "topomap" ? topoMapUrl : previewUrl
  );
  const previewNeedsRender = !hasRenderedCurrentPreview || hasUnsyncedServerChanges;

  // Reset everything
  const resetAll = () => {
    // Invalidate every outstanding asynchronous result before clearing UI state. A server render
    // may finish after cancellation, but it can no longer restore the old plan in this session.
    planGenerationRef.current += 1;
    previewRequestId.current += 1;
    orthophotoRequestId.current += 1;
    topoRequestId.current += 1;
    previewAbortRef.current?.abort();
    orthophotoAbortRef.current?.abort();
    topoAbortRef.current?.abort();
    previewAbortRef.current = null;
    orthophotoAbortRef.current = null;
    topoAbortRef.current = null;
    clearSurveyPlanDraft(ACTIVE_SURVEY_DRAFT_ID).catch(() => {});
    clearGeorefLocalState();
    restoreActionsAppliedRef.current = false;
    setRestoredDraftUpdatedAt(null);
    setShowDraftRecoveryBanner(false);
    setPendingFeatureEditorRestore(false);
    setShowFeatureEditor(false);
    setWorkflowMode(null);
    setManualPoints(buildDefaultManualPoints());
    setCoordinateSystem("wgs84");
    setPlotId(null);
    setFeatures(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setOrthophotoUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setTopoMapUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setPreviewLoading(false);
    setOrthophotoLoading(false);
    setTopoMapLoading(false);
    setDownloadLoadingKey(null);
    setDownloadProgress(null);
    setCurrentStep(1);
    setHasHeightData(false);
    setPreviewType("survey");
    setTopoSource("opentopomap");
    setContourInterval(null);
    setTopoBuildingHatch("solid");
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
    setSubdivisionCleanCopyBatchId(null);
    setSubdivisionCleanCopyTitle("");
    setSubdivisionCleanCopyItems([]);
    setSubdivisionCleanCopyAreaDrafts({});
    setSubdivisionCleanCopyLoadingBatchId(null);
    setSubdivisionCleanCopyDownloadBatchId(null);
    setMeta(buildDefaultPlotMeta());
    setHasManualScaleOverride(false);
    setLastServerSyncAt(null);
    setLastServerSyncSignature(null);
    setHasUnsyncedServerChanges(false);
    setServerSyncing(false);
    skipDirtyEffectRef.current = true;
    toast.success("Ready for a new survey plan.");
  };

  const handleStartNewPlan = useCallback(() => {
    const shouldReset = window.confirm(
      "Start a new survey plan? Your saved local draft for this browser will be cleared."
    );
    if (!shouldReset) return;
    resetAll();
  }, []);

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

  const subdivisionAreaDraftKey = useCallback((item: Pick<SubdivisionBatchItem, "child_plot_id" | "lot_no">) => {
    return `${Number(item.child_plot_id || 0)}::${String(item.lot_no || "").trim().toLowerCase()}`;
  }, []);

  const defaultSubdivisionAreaLabel = useCallback((areaM2: number) => {
    const safe = Number.isFinite(Number(areaM2)) ? Number(areaM2) : 0;
    return `${(safe / 10000).toFixed(4)} Hectares`;
  }, []);

  const getSubdivisionCleanCopyAreaDraftValue = useCallback(
    (item: Pick<SubdivisionBatchItem, "child_plot_id" | "lot_no" | "area_m2">) => {
      const key = subdivisionAreaDraftKey(item);
      if (Object.prototype.hasOwnProperty.call(subdivisionCleanCopyAreaDrafts, key)) {
        return subdivisionCleanCopyAreaDrafts[key];
      }
      return defaultSubdivisionAreaLabel(Number(item.area_m2 || 0));
    },
    [defaultSubdivisionAreaLabel, subdivisionAreaDraftKey, subdivisionCleanCopyAreaDrafts]
  );

  const updateSubdivisionCleanCopyAreaDraft = useCallback(
    (item: Pick<SubdivisionBatchItem, "child_plot_id" | "lot_no">, value: string) => {
      const key = subdivisionAreaDraftKey(item);
      setSubdivisionCleanCopyAreaDrafts((prev) => ({ ...prev, [key]: value }));
    },
    [subdivisionAreaDraftKey]
  );

  const resolvePlotResourcePath = useCallback((path: string, activePlotId: number) => {
    return path.replace(/\/plots\/[^/]+(?=\/)/, `/plots/${activePlotId}`);
  }, []);

  // Nigerian networks can leave a download's server-render phase (job queued/running, no bytes
  // moving yet) taking far longer than the actual file transfer - a bare spinner gives no sense
  // that anything is happening. This ramps a fake percentage up toward `target` (slowing down as
  // it approaches, never claiming completion) to cover that phase; real byte progress from
  // axios' onDownloadProgress takes over once the response actually starts streaming.
  const startDownloadProgressRamp = useCallback((target: number, stepMs = 350) => {
    const id = window.setInterval(() => {
      setDownloadProgress((prev) => {
        const base = prev ?? 0;
        if (base >= target) return base;
        const next = base + Math.max(0.4, (target - base) * 0.09);
        return Math.min(target, next);
      });
    }, stepMs);
    return () => window.clearInterval(id);
  }, []);

  const waitForPlotExportJob = useCallback(
    async (
      jobId: string,
      options?: number | { timeoutMs?: number; intervalMs?: number; strictStatus?: boolean }
    ) => {
      // Back-compat: earlier call sites pass a bare timeoutMs number.
      const opts = typeof options === "number" ? { timeoutMs: options } : options || {};
      const timeoutMs = opts.timeoutMs ?? 1000 * 60 * 20;
      const intervalMs = opts.intervalMs ?? 3000;
      const strictStatus = Boolean(opts.strictStatus);

      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => window.setTimeout(resolve, intervalMs));

        // A single dropped request over a flaky connection shouldn't throw away everything the
        // user has already waited for - retry the status check itself a few times before giving
        // up on it. The server-side render keeps going regardless of one missed check-in.
        let statusRes: any = null;
        for (let pollAttempt = 0; pollAttempt < 3; pollAttempt += 1) {
          try {
            statusRes = await api.get(`/plots/export-jobs/${encodeURIComponent(jobId)}`);
            break;
          } catch {
            if (pollAttempt < 2) {
              await new Promise((resolve) => window.setTimeout(resolve, 1000 * (pollAttempt + 1)));
            }
          }
        }
        if (!statusRes) {
          continue;
        }

        const job = statusRes?.data || {};
        const status = String(job.status || "").trim().toLowerCase();
        if (status === "completed") {
          return job;
        }
        if (status === "failed") {
          throw new Error(String(job.error_text || "Export job failed"));
        }
        if (strictStatus && status !== "queued" && status !== "running") {
          throw new Error("Export job returned an unexpected status.");
        }
      }
      throw new Error("Export job is still preparing. Try again in a moment.");
    },
    []
  );

  // Download function for PDF endpoints that need JSON body
  const downloadWithJson = async (
    url: string,
    filename: string,
    loadingKey: string,
    useTopoMap = false,
    customTitle?: string
  ) => {
    if (!isSurveyAuthed()) {
      openSignupGate({ type: "download-json", url, filename, loadingKey, useTopoMap, customTitle });
      return;
    }
    if (downloadLoadingKey) return;
    setDownloadLoadingKey(loadingKey);
    setDownloadProgress(0);
    const stopRamp = startDownloadProgressRamp(90);
    try {
      const activePlotId = await ensureServerPlot("Syncing draft before export...");
      // Use custom title if provided, otherwise use meta title
      const titleText = customTitle || meta.title_text;

      const payload = {
        title_text: titleText,
        location_text: meta.location_text,
        lga_text: meta.lga_text,
        state_text: meta.state_text,
        scale_text: effectiveRenderScaleText,
        surveyor_name: meta.surveyor_name,
        surveyor_rank: meta.surveyor_rank,
        certification_statement: meta.certification_statement,
        station_names: stationNames,
        coordinate_system: effectiveCoordinateSystem,
        paper_size: meta.paper_size,
        use_topo_map: useTopoMap,
        // The topo map's own data-source/contour-interval/building-style picks (set in the Topo
        // Map preview tab) are otherwise invisible to this shared PDF-export payload, which was
        // only ever modeled on the main plan's own render options - so the export silently fell
        // back to defaults (GEE DEM, Auto interval, the main plan's hatch style) regardless of
        // what was actually selected and shown in the preview.
        ...(useTopoMap
          ? {
              topo_source: topoSource,
              contour_interval: contourInterval,
              elevation_points: topoSource === "userdata" ? elevationPointsPayload : [],
            }
          : {}),
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
        beacon_style: beaconStyle,
        road_width_m: Number(roadWidth),
        boundary_color: boundaryColor,
        grid_color: gridColor,
        text_color: textColor,
        road_color: roadColor,
        river_color: riverColor,
        building_color: buildingColor,
        building_hatch_type: useTopoMap ? topoBuildingHatch : buildingHatchType,
        road_style: roadStyle,
        ...textStylePayload,
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
        cadastral_plan_no: meta.cadastral_plan_no,
        cadastral_area_name: meta.cadastral_area_name,
        cadastral_datum_text: meta.cadastral_datum_text,
        cadastral_firm_block_text: meta.cadastral_firm_block_text,
        fct_file_no: meta.fct_file_no,
        fct_district: meta.fct_district,
        fct_cadastral_zone: meta.fct_cadastral_zone,
        fct_origin_beacon_text: meta.fct_origin_beacon_text,
        fct_cadastral_map_ref: meta.fct_cadastral_map_ref,
      fct_title_prefix: meta.fct_title_prefix,
      };

      const resolvedUrl = resolvePlotResourcePath(url, activePlotId);
      const resolvedFilename = filename;
      const exportJobPath = resolvedUrl.endsWith("/report/pdf")
        ? resolvedUrl.replace("/report/pdf", "/export-jobs/survey-plan.pdf")
        : resolvedUrl.endsWith("/orthophoto/pdf")
          ? resolvedUrl.replace("/orthophoto/pdf", useTopoMap ? "/export-jobs/topomap.pdf" : "/export-jobs/orthophoto.pdf")
          : "";
      if (exportJobPath) {
        const created = await api.post(exportJobPath, payload, { timeout: SLOW_NETWORK_TIMEOUT_MS });
        const jobId = String(created?.data?.id || "");
        if (!jobId) {
          throw new Error("Export job was not created");
        }
        const job = await waitForPlotExportJob(jobId);
        stopRamp();
        setDownloadProgress(90);
        if (!job.download_url) {
          throw new Error("Export is ready but no download link was available");
        }
        const res = await api.get(String(job.download_url), {
          responseType: "blob",
          timeout: SLOW_NETWORK_TIMEOUT_MS,
          onDownloadProgress: (evt) => {
            if (evt.total) {
              setDownloadProgress(90 + (evt.loaded / evt.total) * 10);
            }
          },
        });
        triggerBlobDownload(res.data, res.headers["content-type"], resolvedFilename);
      } else {
        let rampStopped = false;
        const res = await api.post(resolvedUrl, payload, {
          responseType: "blob",
          timeout: SLOW_NETWORK_TIMEOUT_MS,
          onDownloadProgress: (evt) => {
            // Real bytes are now flowing - stop the ramp so it can't fight with (jump ahead of or
            // behind) the actual transfer percentage once it starts arriving.
            if (!rampStopped) {
              rampStopped = true;
              stopRamp();
            }
            if (evt.total) {
              setDownloadProgress((evt.loaded / evt.total) * 100);
            }
          },
        });
        stopRamp();
        triggerBlobDownload(res.data, res.headers["content-type"], resolvedFilename);
      }

      setDownloadProgress(100);
      markServerSynced();
      toast.success(`Downloaded ${resolvedFilename}`);
    } catch (err) {
      console.error("Download error:", err);
      const message = await extractApiErrorMessage(err, "Failed to download file");
      toast.error(message);
    } finally {
      stopRamp();
      setDownloadLoadingKey((prev) => (prev === loadingKey ? null : prev));
      setDownloadProgress(null);
    }
  };

  const downloadTechnicalReport = async (fields: TechnicalReportFields) => {
    if (!isSurveyAuthed()) {
      openSignupGate({ type: "technical-report", fields });
      return;
    }
    setGeneratingTechnicalReport(true);
    setDownloadProgress(0);
    const stopRamp = startDownloadProgressRamp(90);
    try {
      const activePlotId = await ensureServerPlot("Syncing draft before export...");
      const payload = {
        title_text: meta.title_text,
        location_text: meta.location_text,
        lga_text: meta.lga_text,
        state_text: meta.state_text,
        surveyor_name: meta.surveyor_name,
        surveyor_rank: meta.surveyor_rank,
        template_name: meta.template_name,
        adamawa_rof_no: meta.adamawa_rof_no,
        adamawa_owner_name: meta.adamawa_owner_name,
        adamawa_authority_title: meta.adamawa_authority_title,
        adamawa_authority_date_text: meta.adamawa_authority_date_text,
        adamawa_control_point_name: meta.adamawa_control_point_name,
        adamawa_northing: meta.adamawa_northing,
        adamawa_easting: meta.adamawa_easting,
        adamawa_elevation: meta.adamawa_elevation,
        adamawa_origin_text: meta.adamawa_origin_text,
        adamawa_topo_sheet_text: meta.adamawa_topo_sheet_text,
        adamawa_computation_no: meta.adamawa_computation_no,
        adamawa_cadastral_sheet_no: meta.adamawa_cadastral_sheet_no,
        adamawa_plan_no: meta.adamawa_plan_no,
        adamawa_surveyed_by_text: meta.adamawa_surveyed_by_text,
        adamawa_disclaimer_text: meta.adamawa_disclaimer_text,
        ...fields,
      };
      setMeta((prev) => ({ ...prev, ...fields }));

      const resolvedUrl = resolvePlotResourcePath(`/plots/${plotId}/export-jobs/technical-report.docx`, activePlotId);
      const resolvedFilename = buildExportFilename(surveyPlanIdentitySegments(), "Technical_Report", "docx");
      const created = await api.post(resolvedUrl, payload, { timeout: SLOW_NETWORK_TIMEOUT_MS });
      const jobId = String(created?.data?.id || "");
      if (!jobId) {
        throw new Error("Export job was not created");
      }
      const job = await waitForPlotExportJob(jobId);
      stopRamp();
      setDownloadProgress(90);
      if (!job.download_url) {
        throw new Error("Export is ready but no download link was available");
      }
      const res = await api.get(String(job.download_url), {
        responseType: "blob",
        timeout: SLOW_NETWORK_TIMEOUT_MS,
        onDownloadProgress: (evt) => {
          if (evt.total) {
            setDownloadProgress(90 + (evt.loaded / evt.total) * 10);
          }
        },
      });
      triggerBlobDownload(res.data, res.headers["content-type"], resolvedFilename);

      setDownloadProgress(100);
      markServerSynced();
      toast.success(`Downloaded ${resolvedFilename}`);
      setShowTechnicalReportModal(false);
    } catch (err) {
      console.error("Technical report download error:", err);
      const message = await extractApiErrorMessage(err, "Failed to generate technical report");
      toast.error(message);
    } finally {
      stopRamp();
      setGeneratingTechnicalReport(false);
      setDownloadProgress(null);
    }
  };

  const downloadWithGet = async (url: string, filename: string, loadingKey: string) => {
    if (!isSurveyAuthed()) {
      openSignupGate({ type: "download-get", url, filename, loadingKey });
      return;
    }
    if (downloadLoadingKey) return;
    setDownloadLoadingKey(loadingKey);
    setDownloadProgress(0);
    const stopRamp = startDownloadProgressRamp(90);
    try {
      const activePlotId = await ensureServerPlot("Syncing draft before export...");
      const resolvedUrl = resolvePlotResourcePath(url, activePlotId);
      const resolvedFilename = filename;
      const exportJobPath = resolvedUrl.endsWith("/survey-plan/dwg")
        ? resolvedUrl.replace("/survey-plan/dwg", "/export-jobs/survey-plan.dxf")
        : resolvedUrl.endsWith("/survey-plan/shapefile")
          ? resolvedUrl.replace("/survey-plan/shapefile", "/export-jobs/survey-plan.shapefile")
          : "";
      if (exportJobPath) {
        const created = await api.post(exportJobPath, {}, { timeout: SLOW_NETWORK_TIMEOUT_MS });
        const jobId = String(created?.data?.id || "");
        if (!jobId) {
          throw new Error("Export job was not created");
        }
        const job = await waitForPlotExportJob(jobId);
        stopRamp();
        setDownloadProgress(90);
        if (!job.download_url) {
          throw new Error("Export is ready but no download link was available");
        }
        const res = await api.get(String(job.download_url), {
          responseType: "blob",
          timeout: SLOW_NETWORK_TIMEOUT_MS,
          onDownloadProgress: (evt) => {
            if (evt.total) {
              setDownloadProgress(90 + (evt.loaded / evt.total) * 10);
            }
          },
        });
        triggerBlobDownload(res.data, res.headers["content-type"], resolvedFilename);
      } else {
        let rampStopped = false;
        const res = await api.get(resolvedUrl, {
          responseType: "blob",
          timeout: SLOW_NETWORK_TIMEOUT_MS,
          onDownloadProgress: (evt) => {
            if (!rampStopped) {
              rampStopped = true;
              stopRamp();
            }
            if (evt.total) {
              setDownloadProgress((evt.loaded / evt.total) * 100);
            }
          },
        });
        stopRamp();
        triggerBlobDownload(res.data, res.headers["content-type"], resolvedFilename);
      }
      setDownloadProgress(100);
      markServerSynced();
      toast.success(`Downloaded ${resolvedFilename}`);
    } catch (err) {
      console.error("Download error:", err);
      const message = await extractApiErrorMessage(err, "Failed to download file");
      toast.error(message);
    } finally {
      stopRamp();
      setDownloadLoadingKey((prev) => (prev === loadingKey ? null : prev));
      setDownloadProgress(null);
    }
  };

  // Shared button-content renderer for every export card: shows the idle icon+label normally,
  // and swaps to a live progress bar + percentage while that specific download is in flight -
  // Nigerian networks can leave a plain spinner looking stalled for a long time otherwise.
  const renderDownloadButtonState = (key: string, idleLabel: string, idleIcon: ReactNode) => {
    if (downloadLoadingKey === key) {
      const pct = Math.round(downloadProgress ?? 0);
      return (
        <span className="download-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="download-progress-track">
            <span className="download-progress-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="download-progress-pct">{pct}%</span>
        </span>
      );
    }
    return (
      <>
        {idleIcon}
        <span>{idleLabel}</span>
      </>
    );
  };

  const loadSubdivisionBatches = useCallback(async (targetPlotId?: number | null) => {
    const activePlotId = Number((targetPlotId ?? plotId) || 0) || null;
    if (!activePlotId) return;
    setSubdivisionBatchLoading(true);
    try {
      const res = await api.get(`/plots/${activePlotId}/subdivision/batches`);
      const rows = Array.isArray(res.data) ? (res.data as SubdivisionBatchRow[]) : [];
      setSubdivisionBatches(rows);
      setLatestSubdivisionBatchId((prev) => prev ?? (rows[0]?.id ?? null));
    } catch (err) {
      console.error("Failed to load subdivision batches:", err);
    } finally {
      setSubdivisionBatchLoading(false);
    }
  }, [plotId]);

  const loadSubdivisionCleanCopyBatchDetails = useCallback(
    async (batchId: number) => {
      if (!Number.isFinite(batchId) || batchId <= 0) return;
      setSubdivisionCleanCopyLoadingBatchId(batchId);
      try {
        const res = await api.get(`/plots/subdivision/batches/${batchId}`);
        const payload = (res?.data || {}) as SubdivisionBatchDetailResponse;
        const items = Array.isArray(payload.items) ? payload.items : [];
        setSubdivisionCleanCopyItems(items);
        setSubdivisionCleanCopyAreaDrafts((prev) => {
          const next: Record<string, string> = {};
          items.forEach((item) => {
            const key = subdivisionAreaDraftKey(item);
            const previous = String(prev[key] || "").trim();
            next[key] = previous || defaultSubdivisionAreaLabel(Number(item.area_m2 || 0));
          });
          return next;
        });
        setSubdivisionCleanCopyTitle((prev) => {
          if (String(prev || "").trim()) return prev;
          const estate = String(payload?.batch?.estate_name || "").trim();
          if (estate) return `${estate} CLEAN COPY PLAN`;
          return `${meta.title_text || "SURVEY PLAN"} CLEAN COPY PLAN`;
        });
      } catch (err) {
        console.error("Failed to load subdivision batch details:", err);
        setSubdivisionCleanCopyItems([]);
      } finally {
        setSubdivisionCleanCopyLoadingBatchId((prev) => (prev === batchId ? null : prev));
      }
    },
    [defaultSubdivisionAreaLabel, meta.title_text, subdivisionAreaDraftKey]
  );

  useEffect(() => {
    if (!plotId) {
      setSubdivisionBatches([]);
      setSubdivisionCleanCopyBatchId(null);
      setSubdivisionCleanCopyItems([]);
      setSubdivisionCleanCopyAreaDrafts({});
      return;
    }
    if (currentStep < 2) return;
    loadSubdivisionBatches();
  }, [plotId, currentStep, loadSubdivisionBatches]);

  useEffect(() => {
    if (workflowMode !== "subdivision" || currentStep !== 3) return;
    const fallbackBatchId = latestSubdivisionBatchId ?? subdivisionBatches[0]?.id ?? null;
    if (!fallbackBatchId) return;
    setSubdivisionCleanCopyBatchId((prev) => prev ?? fallbackBatchId);
  }, [workflowMode, currentStep, latestSubdivisionBatchId, subdivisionBatches]);

  useEffect(() => {
    if (workflowMode !== "subdivision" || currentStep !== 3) return;
    if (!subdivisionCleanCopyBatchId) return;
    loadSubdivisionCleanCopyBatchDetails(subdivisionCleanCopyBatchId);
  }, [workflowMode, currentStep, subdivisionCleanCopyBatchId, loadSubdivisionCleanCopyBatchDetails]);

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
      const lotWidth = parsePositiveFloat(subdivisionLotWidthDraft);
      const lotHeight = parsePositiveFloat(subdivisionLotHeightDraft);
      if (subdivisionMethod === "by_dimension" && (lotWidth === null || lotHeight === null)) {
        if (!silent) toast.error("Set a positive lot width and height.");
        return null;
      }
      const roadWidth = parsePositiveFloat(subdivisionRoadWidthDraft);
      if (subdivisionExcludeRoad && (roadWidth === null || roadWidth <= 0)) {
        if (!silent) toast.error("Set a positive access road width.");
        return null;
      }

      const payload: Record<string, any> = {
        method: subdivisionMethod,
        split_count: subdivisionMethod === "by_count" ? count : null,
        target_area_m2: subdivisionMethod === "by_area" ? targetArea : null,
        orientation_deg: Number.isFinite(orientationDeg) ? orientationDeg : 0,
        lot_prefix: lotPrefix,
        estate_name: subdivisionEstateName.trim(),
        exclude_road: subdivisionExcludeRoad,
        road_width_m: subdivisionExcludeRoad ? roadWidth : 10,
      };

      if (subdivisionMethod === "by_dimension") {
        payload.lot_width = lotWidth;
        payload.lot_height = lotHeight;
        payload.dimension_unit = subdivisionDimensionUnit;
      }

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
      subdivisionLotWidthDraft,
      subdivisionLotHeightDraft,
      subdivisionDimensionUnit,
      subdivisionExcludeRoad,
      subdivisionRoadWidthDraft,
    ]
  );

  const previewSubdivision = useCallback(
    async (silent = false) => {
      const payload = buildSubdivisionPayload(silent);
      if (!payload) return;

      setSubdivisionPreviewLoading(true);
      try {
        const activePlotId = await ensureServerPlot("Syncing draft for subdivision preview...");
        const res = await api.post(`/plots/${activePlotId}/subdivision/preview`, payload);
        const data = res.data as SubdivisionPreviewData;
        applySubdivisionPreviewResponse(data);
        markServerSynced();
        if (!silent) {
          toast.success("Subdivision preview ready.");
          if (data.lot_count_balanced) {
            toast(
              `Adjusted to ${data.resolved_count} lots (from ${data.requested_count ?? "your requested count"}) so every lot stays close in size across the road.`,
              { icon: "⚖️", duration: 6000 }
            );
          }
        }
      } catch (err: any) {
        if (!silent) {
          // Axios errors are also `instanceof Error`, so checking that first (as this used to)
          // always won and showed axios's generic "Request failed with status code 400" instead
          // of the backend's actual reason - check for a server-sent detail message first.
          const detail = err?.response?.data?.detail;
          if (typeof detail === "string" && detail) {
            toast.error(detail);
          } else if (err instanceof Error) {
            toast.error(err.message);
          } else {
            toast.error("Failed to preview subdivision.");
          }
        }
      } finally {
        setSubdivisionPreviewLoading(false);
      }
    },
    [buildSubdivisionPayload, applySubdivisionPreviewResponse, ensureServerPlot, markServerSynced]
  );

  const [subdivisionRoadSegmentDeletingId, setSubdivisionRoadSegmentDeletingId] = useState<string | null>(null);

  const deleteSubdivisionRoadSegment = useCallback(
    async (segment: SubdivisionRoadSegment) => {
      if (!plotId) {
        toast.error("Sync the draft to the server first.");
        return;
      }
      const shouldDelete = window.confirm("Remove this road from the plot? This also affects the survey plan and CAD editor.");
      if (!shouldDelete) return;

      setSubdivisionRoadSegmentDeletingId(segment.id);
      try {
        if (segment.override_id) {
          await api.delete(`/plots/${plotId}/feature-overrides/${segment.override_id}`);
        } else {
          // A detected/base road has no override row of its own - suppress it the same way the
          // Feature CAD Editor does, with a "delete" override matching its own geometry.
          await api.post(`/plots/${plotId}/feature-overrides`, {
            feature_type: "road",
            action: "delete",
            geojson: segment.geojson.geometry,
          });
        }
        featureEditsPendingRef.current = true;
        toast.success("Road removed.");
        setSelectedRoadSegmentId((prev) => (prev === segment.id ? null : prev));
        await previewSubdivision(true);
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        toast.error(typeof detail === "string" && detail ? detail : "Failed to remove road.");
      } finally {
        setSubdivisionRoadSegmentDeletingId(null);
      }
    },
    [plotId, previewSubdivision]
  );

  const scheduleSubdivisionLivePreview = useCallback(() => {
    if (subdivisionLivePreviewTimerRef.current !== null) {
      window.clearTimeout(subdivisionLivePreviewTimerRef.current);
      subdivisionLivePreviewTimerRef.current = null;
    }
  }, []);

  const applySubdivision = async () => {
    const payload = buildSubdivisionPayload(false);
    if (!payload) return;

    try {
      const activePlotId = await ensureServerPlot("Syncing draft before subdivision batch generation...");
      setSubdivisionApplyLoading(true);
      const res = await api.post(`/plots/${activePlotId}/subdivision/apply`, {
        ...payload,
        include_feature_detection: false,
      });
      const batchId = Number(res?.data?.batch_id || 0) || null;
      if (batchId) {
        setLatestSubdivisionBatchId(batchId);
      }
      await loadSubdivisionBatches(activePlotId);
      const generated = Number(res?.data?.generated_count || 0);
      markServerSynced();
      toast.success(`Subdivision generated (${generated} plots).`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === "string" && detail) {
        toast.error(detail);
      } else if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Failed to generate subdivision batch.");
      }
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
    if (!isSurveyAuthed()) {
      openSignupGate({ type: "subdivision-batch", batchId });
      return;
    }
    if (subdivisionDownloadBatchId !== null) return;
    setSubdivisionDownloadBatchId(batchId);
    try {
      const createJobRes = await withRetry(() =>
        api.post(`/plots/subdivision/batches/${batchId}/export-jobs/survey-plans`, undefined, {
          timeout: SLOW_NETWORK_TIMEOUT_MS,
        })
      );
      let job = createJobRes.data as PlotExportJob;
      if (String(job?.status || "").trim().toLowerCase() === "failed") {
        throw new Error(String(job?.error_text || "Failed to prepare subdivision batch export."));
      }
      if (String(job?.status || "").trim().toLowerCase() !== "completed") {
        job = await waitForPlotExportJob(String(job.id || ""), {
          timeoutMs: 1500 * 80,
          intervalMs: 1500,
          strictStatus: true,
        });
      }
      const downloadPath = normalizeApiDownloadPath(
        String(job?.download_url || `/plots/export-jobs/${encodeURIComponent(String(job.id || ""))}/download`)
      );
      const res = await api.get(downloadPath, { responseType: "blob", timeout: SLOW_NETWORK_TIMEOUT_MS });
      triggerBlobDownload(
        res.data,
        res.headers["content-type"],
        buildExportFilename([subdivisionEstateName, meta.location_text], "Subdivision_Plans", "zip")
      );
      toast.success("Batch survey plans ZIP downloaded.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to download subdivision batch.");
    } finally {
      setSubdivisionDownloadBatchId(null);
    }
  };

  const downloadSubdivisionCleanCopyPdf = async () => {
    if (!isSurveyAuthed()) {
      openSignupGate({ type: "subdivision-clean-copy" });
      return;
    }
    const batchId = Number(subdivisionCleanCopyBatchId || 0);
    if (!batchId) {
      toast.error("Select a subdivision batch first.");
      return;
    }
    if (subdivisionCleanCopyDownloadBatchId !== null) return;

    setSubdivisionCleanCopyDownloadBatchId(batchId);
    try {
      const payload = {
        title_text: String(subdivisionCleanCopyTitle || "").trim(),
        paper_size: meta.paper_size,
        scale_text: effectiveRenderScaleText,
        coordinate_system: effectiveCoordinateSystem,
        station_names: stationNames,
        north_arrow_style: northArrowStyle,
        north_arrow_color: northArrowColor,
        beacon_style: beaconStyle,
        road_width_m: Number(roadWidth),
        boundary_color: boundaryColor,
        grid_color: gridColor,
        text_color: textColor,
        road_color: roadColor,
        river_color: riverColor,
        building_color: buildingColor,
        building_hatch_type: buildingHatchType,
        road_style: roadStyle,
        ...textStylePayload,
        area_labels: subdivisionCleanCopyItems.map((item) => {
          const key = subdivisionAreaDraftKey(item);
          return {
            lot_no: item.lot_no,
            child_plot_id: item.child_plot_id,
            label: String(subdivisionCleanCopyAreaDrafts[key] || "").trim(),
          };
        }),
      };
      const createJobRes = await withRetry(() =>
        api.post(`/plots/subdivision/batches/${batchId}/export-jobs/clean-copy.pdf`, payload, {
          timeout: SLOW_NETWORK_TIMEOUT_MS,
        })
      );
      let job = createJobRes.data as PlotExportJob;
      if (String(job?.status || "").trim().toLowerCase() === "failed") {
        throw new Error(String(job?.error_text || "Failed to prepare clean copy PDF."));
      }
      if (String(job?.status || "").trim().toLowerCase() !== "completed") {
        job = await waitForPlotExportJob(String(job.id || ""), {
          timeoutMs: 1500 * 80,
          intervalMs: 1500,
          strictStatus: true,
        });
      }
      const downloadPath = normalizeApiDownloadPath(
        String(job?.download_url || `/plots/export-jobs/${encodeURIComponent(String(job.id || ""))}/download`)
      );
      const res = await api.get(downloadPath, { responseType: "blob", timeout: SLOW_NETWORK_TIMEOUT_MS });
      triggerBlobDownload(
        res.data,
        res.headers["content-type"],
        buildExportFilename(
          [subdivisionCleanCopyTitle || subdivisionEstateName, meta.location_text],
          "Clean_Copy",
          "pdf"
        )
      );
      toast.success("Clean copy PDF downloaded.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to download clean copy PDF.");
    } finally {
      setSubdivisionCleanCopyDownloadBatchId(null);
    }
  };

  // Landing back here after completing sign-in from the download gate - replays the exact
  // download that was interrupted (see openSignupGate / PendingSurveyDownload) using the real
  // arguments it was called with, so a newly-registered user actually gets their file instead of
  // having to find and re-click the same button. Declared after all six download handlers so the
  // dependency array below can reference them without a temporal-dead-zone error (the array is
  // evaluated eagerly on every render, unlike the effect body).
  const resumeDispatchedRef = useRef(false);
  useEffect(() => {
    if (!draftHydrated) return;
    if (!searchParams.get("resume")) return;
    if (resumeDispatchedRef.current) return;
    resumeDispatchedRef.current = true;

    const next = new URLSearchParams(searchParams);
    next.delete("resume");
    setSearchParams(next, { replace: true });

    const pending = consumePendingSurveyDownload();
    if (!pending) {
      toast.success("You're signed in.");
      navigate("/dashboard");
      return;
    }

    // Each handler already swallows its own errors internally (toast.error + finally, never a
    // rejected promise), so this always settles - the user lands on their dashboard with either
    // the file in hand or the failure toast still visible, never stuck waiting.
    const runResumedDownload = async () => {
      switch (pending.type) {
        case "georeference-csv":
          await handleDownloadGeoreferenceCsv();
          break;
        case "download-json":
          await downloadWithJson(pending.url, pending.filename, pending.loadingKey, pending.useTopoMap, pending.customTitle);
          break;
        case "download-get":
          await downloadWithGet(pending.url, pending.filename, pending.loadingKey);
          break;
        case "technical-report":
          await downloadTechnicalReport(pending.fields as unknown as TechnicalReportFields);
          break;
        case "subdivision-batch":
          await downloadSubdivisionBatch(pending.batchId);
          break;
        case "subdivision-clean-copy":
          await downloadSubdivisionCleanCopyPdf();
          break;
      }
      navigate("/dashboard");
    };
    void runResumedDownload();
  }, [
    draftHydrated,
    searchParams,
    setSearchParams,
    navigate,
    handleDownloadGeoreferenceCsv,
    downloadWithJson,
    downloadWithGet,
    downloadTechnicalReport,
    downloadSubdivisionBatch,
    downloadSubdivisionCleanCopyPdf,
  ]);

  // Get feature counts from nested response structure
  const getFeatureCount = (type: string) => {
    if (!features) return 0;
    const insideCount = features.inside?.[type] || 0;
    const bufferCount = features.buffer?.[type] || 0;
    return insideCount + bufferCount;
  };

  const featureCounts = useMemo(
    () =>
      features
        ? {
            building: getFeatureCount("building"),
            road: getFeatureCount("road"),
            river: getFeatureCount("river"),
          }
        : null,
    [features]
  );

  const prefetchFeatureEditor = useCallback(() => {
    void import("../components/FeatureOverrideModal");
  }, []);

  const openFeatureCadEditor = useCallback(async () => {
    prefetchFeatureEditor();

    if (plotId) {
      startTransition(() => {
        setShowFeatureEditor(true);
      });
      if (isOnline) {
        void ensureServerPlot("Refreshing draft in background for Feature CAD Editor...", {
          fetchFeatures: !features,
        })
          .then(() => {
            markServerSynced();
          })
          .catch(() => {});
      }
      return;
    }

    try {
      await ensureServerPlot("Syncing draft before opening Feature CAD Editor...", {
        fetchFeatures: true,
      });
      markServerSynced();
      startTransition(() => {
        setShowFeatureEditor(true);
      });
    } catch (err) {
      const message = await extractApiErrorMessage(err, "Could not open Feature CAD Editor.");
      toast.error(message);
    }
  }, [ensureServerPlot, features, isOnline, markServerSynced, plotId, prefetchFeatureEditor]);

  useEffect(() => {
    if (!draftHydrated || restoreActionsAppliedRef.current || !workflowMode) return;
    restoreActionsAppliedRef.current = true;

    if (
      (workflowMode === "survey" || workflowMode === "subdivision") &&
      currentStep >= 2 &&
      !showFeatureEditor &&
      isOnline &&
      hasValidCoords &&
      // A draft can be restored sitting on step 2+ without ever having had a template picked
      // (e.g. the tab was closed right after advancing) - don't auto-render against an unset
      // template; the preview step's own template selector will prompt for one instead.
      meta.template_name
    ) {
      void refreshCurrentPreview().catch(() => {});
    }

    if (
      pendingFeatureEditorRestore &&
      (workflowMode === "survey" || workflowMode === "subdivision")
    ) {
      window.setTimeout(() => {
        void openFeatureCadEditor();
        setPendingFeatureEditorRestore(false);
      }, 120);
    }
  }, [
    currentStep,
    draftHydrated,
    hasValidCoords,
    isOnline,
    meta.template_name,
    openFeatureCadEditor,
    pendingFeatureEditorRestore,
    refreshCurrentPreview,
    showFeatureEditor,
    workflowMode,
  ]);

  // Persists one feature edit and reports success/failure back to the CAD editor, which stays
  // open and updates its own canvas locally instead of the editor closing after every action.
  // The preview is only regenerated once, when the editor is actually closed (see
  // handleCloseFeatureEditor) - not per edit, which used to force a close+reopen cycle for every
  // single delete/add/update.
  const handleSaveOverride = async (payload: { feature_type: "road" | "building" | "river" | "fence"; action: "add" | "delete" | "update"; name?: string; width_m?: number; geojson: any }): Promise<boolean> => {
    if (!plotId) {
      toast.error("Sync the draft to the server before saving feature edits.");
      return false;
    }
    try {
      const client_request_id =
        typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : undefined;
      await api.post(`/plots/${plotId}/feature-overrides`, { ...payload, client_request_id });
      featureEditsPendingRef.current = true;
      return true;
    } catch (err) {
      console.error(err);
      toast.error("Failed to save feature");
      return false;
    }
  };

  const handleRoadNamesSaved = useCallback(() => {
    setPreviewUrl(null);
    setOrthophotoUrl(null);
    setTopoMapUrl(null);
    window.setTimeout(() => {
      void refreshCurrentPreview();
    }, 250);
  }, [refreshCurrentPreview]);

  const handleCloseFeatureEditor = useCallback(() => {
    setShowFeatureEditor(false);
    if (!featureEditsPendingRef.current) return;
    featureEditsPendingRef.current = false;
    setPreviewUrl(null);
    setOrthophotoUrl(null);
    setTopoMapUrl(null);
    window.setTimeout(() => {
      void refreshCurrentPreview();
    }, 250);
  }, [refreshCurrentPreview]);

  const renderSidebarStepsCard = () => (
    <div className="workflow-inline-card workflow-inline-card--sidebar">
      <div className="workflow-inline-title">
        {workflowMode === "survey"
          ? "Survey Plan Production"
          : workflowMode === "subdivision"
            ? "Plot Subdivision"
            : "Raster Georeferencing"}
      </div>
      <div className="workflow-inline-steps workflow-inline-steps--stack">
        {activeSteps.map((step) => {
          const completed = currentStep > step.id;
          const active = currentStep === step.id;
          return (
            <div
              key={`sidebar_step_${step.id}`}
              className={`workflow-inline-step${active ? " active" : ""}${completed ? " completed" : ""}`}
            >
              <span className="workflow-inline-step-no">
                {completed ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  step.id
                )}
              </span>
              <span className="workflow-inline-step-label">{step.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className={`survey-container${workflowMode ? " has-workflow" : ""}${
        workflowMode && currentStep === 2 ? " is-preview-step" : ""
      }${workflowMode === "subdivision" ? " is-subdivision-flow" : ""}${
        workflowMode === "survey" ? " is-survey-flow" : ""
      }${workflowMode === "georeference" ? " is-georeference-flow" : ""
      }`}
    >
      <Toaster position="top-right" />

      {/* Header */}
      <header className="survey-header">
        <SurveyNetworkMotif className="survey-header-motif" />
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        {isSurveyAuthed() ? (
          <button className="dashboard-link-btn" onClick={() => navigate("/dashboard")}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            My Dashboard
          </button>
        ) : (
          <button
            className="dashboard-link-btn"
            onClick={() => {
              setPendingGateDownload(null);
              setSignupGateOpen(true);
            }}
          >
            Sign in
          </button>
        )}
        <div className="survey-header-copy">
          <span className="survey-kicker survey-chip-solid">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="7" />
              <path d="M10 3v2M10 15v2M3 10h2M15 10h2" />
              <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
            </svg>
            LandCheck Survey Studio
          </span>
          <h1 className="survey-title">
            {workflowMode === "survey"
              ? "Survey Plan Production"
              : workflowMode === "subdivision"
                ? "Plot Subdivision"
                : workflowMode === "georeference"
                  ? "Raster Georeferencing"
                  : "Survey Plan"}
          </h1>
          <p className="survey-subtitle">
            {workflowMode === "survey"
              ? "Coordinate intake, preview, editing, and export in one controlled drafting workflow."
              : workflowMode === "subdivision"
                ? "Break a parent parcel into production-ready lots with live review before export."
                : workflowMode === "georeference"
                  ? "Anchor scanned sheets to real coordinates, digitize cleanly, and continue into Survey Plan."
                  : "Choose the workflow that matches the production job you want to run."}
          </p>
        </div>
        <button className="reset-btn" onClick={handleStartNewPlan}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Start New Plan
        </button>
      </header>

      {/* Main Content */}
        <div className="survey-content" ref={surveyContentRef}>
          {!draftHydrated ? (
            <div className="survey-restore-shell" role="status" aria-live="polite">
              <div className="survey-restore-card">
                <span className="survey-restore-kicker">Restoring local draft</span>
                <h2 className="survey-restore-title">Opening your last Survey Plan workspace</h2>
                <p className="survey-restore-copy">
                  Loading the saved drafting state for this browser so you can continue from the same step.
                </p>
              </div>
            </div>
          ) : (
            <>
          {showDraftRecoveryBanner && restoredDraftUpdatedAt && workflowMode && (
            <div className={`survey-sync-banner survey-draft-banner${!isOnline ? " offline" : ""}`}>
              <div className="survey-sync-banner-copy">
                <strong>Draft restored</strong>
                <span>
                  Continuing your {workflowMode === "survey" ? "survey plan" : workflowMode === "subdivision" ? "subdivision" : "georeference"} draft at
                  {" "}
                  {currentStepTitle}. Saved on this device {formatDraftUpdatedAt(restoredDraftUpdatedAt)}. Use
                  {" "}
                  <strong>Start New Plan</strong> only when you want to begin another job.
                </span>
              </div>
              <div className="survey-sync-banner-actions">
              <button type="button" className="draft-banner-btn draft-banner-btn--ghost" onClick={() => setShowDraftRecoveryBanner(false)}>
                Dismiss
              </button>
              <button type="button" className="draft-banner-btn draft-banner-btn--primary" onClick={handleStartNewPlan}>
                Start New Plan
              </button>
            </div>
          </div>
          )}
          {!workflowMode && (
            <div className="mode-select-shell">
              <SurveyNetworkMotif className="mode-select-motif" />
              <div className="mode-select-head">
                <span className="mode-select-kicker survey-chip-solid">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="10" cy="10" r="7" />
                    <path d="M10 3v2M10 15v2M3 10h2M15 10h2" />
                    <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
                  </svg>
                  Survey plan suite
                </span>
                <h2>Choose the route for this job</h2>
                <p>Three focused workflows cover direct drafting, subdivision, and scanned-plan recovery.</p>
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
                <div className="mode-card-top">
                  <span className="mode-card-route">Survey workflow</span>
                <div className="mode-card-icon-wrap" aria-hidden="true">
                  <div className="mode-card-icon-float">
                    <svg className="mode-svg survey" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="22" y="16" width="76" height="88" rx="10" strokeWidth="4" />
                      <path d="M80 16v22h18" strokeWidth="4" />
                      <path d="M36 56l14-8 11 6 16-9" strokeWidth="4" />
                      <path d="M36 70h48" strokeWidth="3.5" />
                      <path d="M36 82h36" strokeWidth="3.5" />
                      <circle cx="50" cy="48" r="3.6" fill="currentColor" stroke="none" />
                      <circle cx="61" cy="54" r="3.6" fill="currentColor" stroke="none" />
                      <circle cx="77" cy="45" r="3.6" fill="currentColor" stroke="none" />
                    </svg>
                  </div>
                </div>
                </div>
                  <h3>Survey Plan</h3>
                  <p>Draft one parcel, review the sheet, and export the final plan package.</p>
                  <div className="mode-card-meta">
                    <span className="mode-card-pill">Single parcel</span>
                    <span className="mode-card-pill">PDF + CAD</span>
                  </div>
                  <span className="mode-card-cta">Open route</span>
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
                <div className="mode-card-top">
                  <span className="mode-card-route">Subdivision workflow</span>
                <div className="mode-card-icon-wrap" aria-hidden="true">
                  <div className="mode-card-icon-float">
                    <svg className="mode-svg subdivision" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 30l24-14 44 8 14 30-12 38-42 16-30-20z" strokeWidth="4" />
                      <path d="M44 16v76" strokeWidth="3.5" />
                      <path d="M72 22v80" strokeWidth="3.5" />
                      <path d="M20 60h82" strokeWidth="3.5" />
                      <path d="M32 42h16M56 42h16M32 78h16M56 78h16" strokeWidth="3" />
                    </svg>
                  </div>
                </div>
                </div>
                  <h3>Plot Subdivision</h3>
                  <p>Split a mother parcel into ready-to-issue lots with review and export controls.</p>
                  <div className="mode-card-meta">
                    <span className="mode-card-pill">Lot layouts</span>
                    <span className="mode-card-pill">Batch exports</span>
                  </div>
                  <span className="mode-card-cta">Open route</span>
                </button>
              <button
                type="button"
                className="mode-card"
                onClick={() => {
                  setWorkflowMode("georeference");
                  setPreviewType("survey");
                  setCurrentStep(1);
                }}
              >
                <div className="mode-card-top">
                  <span className="mode-card-route">Georeference workflow</span>
                <div className="mode-card-icon-wrap" aria-hidden="true">
                  <div className="mode-card-icon-float">
                    <svg className="mode-svg georeference" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="18" y="20" width="84" height="64" rx="10" strokeWidth="4" />
                      <path d="M34 36h52M34 50h32M34 64h22" strokeWidth="3.5" />
                      <path d="M82 72l10 10" strokeWidth="4" />
                      <circle cx="76" cy="66" r="14" strokeWidth="4" />
                      <path d="M76 56v20M66 66h20" strokeWidth="3.5" />
                    </svg>
                  </div>
                </div>
                </div>
                  <h3>Raster Georeferencing</h3>
                  <p>Anchor a scanned plan to real coordinates, digitize it, and continue into drafting.</p>
                  <div className="mode-card-meta">
                    <span className="mode-card-pill">Control points</span>
                    <span className="mode-card-pill">DGPS CSV</span>
                  </div>
                  <span className="mode-card-cta">Open route</span>
                </button>
              </div>
            </div>
          )}

        {workflowMode && showFeatureEditor && (
          <Suspense fallback={null}>
            <FeatureOverrideModal
              isOpen={showFeatureEditor}
              onClose={handleCloseFeatureEditor}
              onSave={handleSaveOverride}
              plotCoords={finalCoords}
              featureType={featureType}
              setFeatureType={setFeatureType}
              action={featureAction}
              setAction={setFeatureAction}
              roadName={roadName}
              setRoadName={setRoadName}
              riverName={riverName}
              setRiverName={setRiverName}
              roadWidth={newRoadWidth}
              setRoadWidth={setNewRoadWidth}
              plotId={plotId}
              meta={meta}
              manualPoints={manualPoints}
              beaconStyle={beaconStyle}
              northArrowColor={northArrowColor}
              coordinateSystem={coordinateSystem}
              onBoundaryPointChange={handleBoundaryPointChange}
              />
            </Suspense>
          )}
            </>
          )}

        {showTechnicalReportModal && (
          <Suspense fallback={null}>
            <TechnicalReportModal
              isOpen={showTechnicalReportModal}
              onClose={() => setShowTechnicalReportModal(false)}
              initial={{
                technical_report_instruments: meta.technical_report_instruments,
                technical_report_dgps_type: meta.technical_report_dgps_type,
                technical_report_num_surveyors: meta.technical_report_num_surveyors,
                technical_report_num_technical_officers: meta.technical_report_num_technical_officers,
                technical_report_num_labourers: meta.technical_report_num_labourers,
                technical_report_recce_text: meta.technical_report_recce_text,
                technical_report_demarcation_text: meta.technical_report_demarcation_text,
                technical_report_computation_software_text: meta.technical_report_computation_software_text,
                technical_report_plotting_software_text: meta.technical_report_plotting_software_text,
                technical_report_general_observation_text: meta.technical_report_general_observation_text,
              }}
              controlPointName={meta.adamawa_control_point_name}
              generating={generatingTechnicalReport}
              progress={downloadProgress}
              onGenerate={downloadTechnicalReport}
            />
          </Suspense>
        )}
        {signupGateOpen && (
          <Suspense fallback={null}>
            <SignupGateModal
              isOpen={signupGateOpen}
              onClose={() => setSignupGateOpen(false)}
              pendingDownload={pendingGateDownload ?? undefined}
            />
          </Suspense>
        )}
        {/* Step 1: Coordinate Input */}
        {workflowMode && currentStep === 1 && (
          <Suspense fallback={<div className="preview-card">Loading survey draft workspace...</div>}>
            {workflowMode === "georeference" ? (
              <SurveyPlanGeoreferenceSetupStep
                sidebar={renderSidebarStepsCard()}
                session={georefSession}
                rasterObjectUrl={georefRasterObjectUrl}
                selectedControlPointId={georefSelectedControlPointId}
                targetCoordinateSystem={georefTargetCoordinateSystem}
                creatingSession={georefUploading || georefSessionLoading}
                solving={georefSolving}
                onCreateSession={handleCreateGeoreferenceSession}
                onTargetCoordinateSystemChange={setGeorefTargetCoordinateSystem}
                onSelectControlPoint={handleSelectGeoreferenceControlPoint}
                onAddControlPoint={handleAddGeoreferenceControlPoint}
                onRemoveControlPoint={handleRemoveGeoreferenceControlPoint}
                onUpdateControlPoint={handleUpdateGeoreferenceControlPoint}
                onAssignImagePoint={handleAssignGeoreferenceImagePoint}
                onAssignMapPoint={handleAssignGeoreferenceMapPoint}
                onSolve={handleSolveGeoreference}
                onContinue={() => {
                  if (!georefSession?.transform) {
                    toast.error("Solve the georeference first before digitizing.");
                    return;
                  }
                  goToStep(2);
                }}
                onDeleteSession={handleDeleteGeoreferenceSession}
              />
            ) : (
              <SurveyPlanStepOnePanel
                sidebar={renderSidebarStepsCard()}
                manualPoints={manualPoints}
                onUpdatePoint={updatePoint}
                onRemovePoint={removePoint}
                onAddPoint={addPoint}
                onBulkUpload={handleBulkUpload}
                loading={loading}
                coordinateSystem={coordinateSystem}
                onCoordinateSystemChange={setCoordinateSystem}
                onImportedMetadata={(fields) => setMeta((m) => ({ ...m, ...fields }))}
                hasValidCoords={hasValidCoords}
                onContinue={continueWithLocalDraft}
                workflowMode={workflowMode}
                showDraftMap={showDraftMap}
                onLoadMapNow={() => setForceShowDraftMap(true)}
                mapCoordinates={mapCoordinates}
                spotHeightMapCoordinates={spotHeightMapCoordinates}
                onCoordinatesDrawn={handleCoordinatesFromMap}
                isLowBandwidth={isLowBandwidth}
                manualLowBandwidth={manualLowBandwidth}
                onManualLowBandwidthChange={setManualLowBandwidth}
              />
            )}
          </Suspense>
        )}

        {/* Step 2: Preview & Details (Survey Plan Production) */}
        {workflowMode === "survey" && currentStep === 2 && (
          <Suspense fallback={<div className="preview-card">Loading survey preview workspace...</div>}>
            <SurveyPlanSurveyPreviewStep
              sidebar={renderSidebarStepsCard()}
              featureCounts={featureCounts}
              meta={meta}
              setMeta={setMeta}
              defaultCertificationStatement={DEFAULT_CERTIFICATION_STATEMENT}
              defaultAdamawaAuthorityTitle={DEFAULT_ADAMAWA_AUTHORITY_TITLE}
              defaultAdamawaAuthorityDate={DEFAULT_ADAMAWA_AUTHORITY_DATE}
              defaultAdamawaTopoSheetText={DEFAULT_ADAMAWA_TOPO_SHEET_TEXT}
              defaultAdamawaDisclaimerText={DEFAULT_ADAMAWA_DISCLAIMER_TEXT}
              scaleDraft={scaleDraft}
              setScaleDraft={handleScaleDraftChange}
              commitScaleDraft={commitScaleDraft}
              applyScalePreset={applyScalePreset}
              currentScaleText={effectiveRenderScaleText}
              scalePresets={SCALE_PRESETS}
              parseScaleDenominator={parseScaleDenominator}
              isAutoScaleText={isAutoScaleText}
              previewActionLabel={previewActionLabel}
              refreshCurrentPreview={refreshCurrentPreview}
              previewLoading={previewLoading}
              orthophotoLoading={orthophotoLoading}
              topoMapLoading={topoMapLoading}
              serverSyncing={serverSyncing}
              previewNeedsRender={previewNeedsRender}
              hasRenderedCurrentPreview={hasRenderedCurrentPreview}
              onOpenFeatureCadEditor={openFeatureCadEditor}
              onPrefetchFeatureEditor={prefetchFeatureEditor}
              plotId={plotId}
              onSaveFeatureOverride={handleSaveOverride}
              onRoadNamesSaved={handleRoadNamesSaved}
              isOnline={isOnline}
              onBack={() => goToStep(1)}
              onContinue={() => goToStep(3)}
              previewType={previewType}
              onPreviewTypeChange={handlePreviewTypeChange}
              topoSource={topoSource}
              contourInterval={contourInterval}
              topoBuildingHatch={topoBuildingHatch}
              onTopoSourceChange={handleTopoSourceChange}
              onContourIntervalChange={handleContourIntervalChange}
              onTopoBuildingHatchChange={handleTopoBuildingHatchChange}
              northArrowStyle={northArrowStyle}
              northArrowColor={northArrowColor}
              beaconStyle={beaconStyle}
              roadWidth={roadWidth}
              boundaryColor={boundaryColor}
              gridColor={gridColor}
              textColor={textColor}
              roadColor={roadColor}
              riverColor={riverColor}
              buildingColor={buildingColor}
              buildingHatchType={buildingHatchType}
              roadStyle={roadStyle}
              onNorthArrowStyleChange={handleNorthArrowStyleChange}
              onNorthArrowColorChange={handleNorthArrowColorChange}
              onBeaconStyleChange={handleBeaconStyleChange}
              onRoadWidthChange={handleRoadWidthChange}
              onBoundaryColorChange={setBoundaryColor}
              onGridColorChange={setGridColor}
              onTextColorChange={setTextColor}
              onRoadColorChange={setRoadColor}
              onRiverColorChange={setRiverColor}
              onBuildingColorChange={setBuildingColor}
              onBuildingHatchTypeChange={handleBuildingHatchTypeChange}
              onRoadStyleChange={handleRoadStyleChange}
              titleFont={titleFont}
              titleSize={titleSize}
              gridFont={gridFont}
              gridSize={gridSize}
              stationFont={stationFont}
              stationSize={stationSize}
              bearingFont={bearingFont}
              bearingSize={bearingSize}
              areaFont={areaFont}
              areaSize={areaSize}
              onTitleFontChange={setTitleFont}
              onTitleSizeChange={setTitleSize}
              onGridFontChange={setGridFont}
              onGridSizeChange={setGridSize}
              onStationFontChange={setStationFont}
              onStationSizeChange={setStationSize}
              onBearingFontChange={setBearingFont}
              onBearingSizeChange={setBearingSize}
              onAreaFontChange={setAreaFont}
              onAreaSizeChange={setAreaSize}
              surveyPreviewUrl={previewUrl}
              orthophotoPreviewUrl={orthophotoUrl}
              topoMapPreviewUrl={topoMapUrl}
              hasHeightData={elevationPointsPayload.length >= 3}
            />
          </Suspense>
        )}

        {workflowMode === "georeference" && currentStep === 2 && georefSession?.transform && (
          <Suspense fallback={<div className="preview-card">Loading georeference digitizing workspace...</div>}>
            <SurveyPlanGeoreferenceWorkspaceStep
              sidebar={renderSidebarStepsCard()}
              session={georefSession}
              rasterObjectUrl={georefRasterObjectUrl}
              features={georefFeatures}
              saving={georefSavingFeatures}
              onFeaturesChange={setGeorefFeatures}
              onSaveFeatures={handleSaveGeoreferenceFeatures}
              onBack={() => goToStep(1)}
              onContinue={() => {
                if (!georefFeatures.length) {
                  toast.error("Save at least one digitized feature first.");
                  return;
                }
                goToStep(3);
              }}
            />
          </Suspense>
        )}

        {workflowMode === "georeference" && currentStep === 2 && !georefSession?.transform && (
          <div className="preview-card">
            <h3>Digitizing workspace not ready yet</h3>
            <p>
              Solve the georeference transform first, or wait for the saved session to finish loading before
              moving into digitizing.
            </p>
            <div className="preview-actions">
              <button className="btn-outline" onClick={() => goToStep(1)}>
                Back to Control Points
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Subdivision Preview */}
        {workflowMode === "subdivision" && currentStep === 2 && (
          <Suspense fallback={<div className="preview-card">Loading subdivision workspace...</div>}>
            <SurveyPlanSubdivisionPreviewStep
              sidebar={renderSidebarStepsCard()}
              meta={meta}
              setMeta={setMeta}
              scaleDraft={scaleDraft}
              setScaleDraft={handleScaleDraftChange}
              commitScaleDraft={commitScaleDraft}
              applyScalePreset={applyScalePreset}
              currentScaleText={effectiveRenderScaleText}
              parseScaleDenominator={parseScaleDenominator}
              isAutoScaleText={isAutoScaleText}
              scalePresets={SCALE_PRESETS}
              previewActionLabel={previewActionLabel}
              refreshCurrentPreview={refreshCurrentPreview}
              previewLoading={previewLoading}
              orthophotoLoading={orthophotoLoading}
              topoMapLoading={topoMapLoading}
              serverSyncing={serverSyncing}
              previewNeedsRender={previewNeedsRender}
              hasRenderedCurrentPreview={hasRenderedCurrentPreview}
              onOpenFeatureCadEditor={openFeatureCadEditor}
              isOnline={isOnline}
              plotId={plotId}
              onSaveFeatureOverride={handleSaveOverride}
              onRoadNamesSaved={handleRoadNamesSaved}
              defaultCertificationStatement={DEFAULT_CERTIFICATION_STATEMENT}
              defaultAdamawaAuthorityTitle={DEFAULT_ADAMAWA_AUTHORITY_TITLE}
              defaultAdamawaAuthorityDate={DEFAULT_ADAMAWA_AUTHORITY_DATE}
              defaultAdamawaTopoSheetText={DEFAULT_ADAMAWA_TOPO_SHEET_TEXT}
              defaultAdamawaDisclaimerText={DEFAULT_ADAMAWA_DISCLAIMER_TEXT}
              subdivisionMethod={subdivisionMethod}
              setSubdivisionMethod={setSubdivisionMethod}
              subdivisionFractionWeightsEffective={subdivisionFractionWeightsEffective}
              subdivisionPreview={subdivisionPreview}
              setSubdivisionFractionBreaks={setSubdivisionFractionBreaks}
              setSubdivisionFractionDraft={setSubdivisionFractionDraft}
              weightsToBreaks={weightsToBreaks}
              formatWeightsDraft={formatWeightsDraft}
              parsePositiveInt={parsePositiveInt}
              subdivisionCountDraft={subdivisionCountDraft}
              setSubdivisionCountDraft={setSubdivisionCountDraft}
              subdivisionTargetAreaDraft={subdivisionTargetAreaDraft}
              setSubdivisionTargetAreaDraft={setSubdivisionTargetAreaDraft}
              subdivisionFractionDraft={subdivisionFractionDraft}
              commitSubdivisionFractionDraft={commitSubdivisionFractionDraft}
              subdivisionParentAreaLoading={subdivisionParentAreaLoading}
              subdivisionParentAreaM2={subdivisionParentAreaM2}
              subdivisionOrientationDraft={subdivisionOrientationDraft}
              setSubdivisionOrientationDraft={setSubdivisionOrientationDraft}
              subdivisionLotWidthDraft={subdivisionLotWidthDraft}
              setSubdivisionLotWidthDraft={setSubdivisionLotWidthDraft}
              subdivisionLotHeightDraft={subdivisionLotHeightDraft}
              setSubdivisionLotHeightDraft={setSubdivisionLotHeightDraft}
              subdivisionDimensionUnit={subdivisionDimensionUnit}
              setSubdivisionDimensionUnit={setSubdivisionDimensionUnit}
              subdivisionExcludeRoad={subdivisionExcludeRoad}
              setSubdivisionExcludeRoad={setSubdivisionExcludeRoad}
              subdivisionRoadWidthDraft={subdivisionRoadWidthDraft}
              setSubdivisionRoadWidthDraft={setSubdivisionRoadWidthDraft}
              onDeleteRoadSegment={deleteSubdivisionRoadSegment}
              subdivisionRoadSegmentDeletingId={subdivisionRoadSegmentDeletingId}
              selectedRoadSegmentId={selectedRoadSegmentId}
              onSelectRoadSegment={setSelectedRoadSegmentId}
              subdivisionLotPrefix={subdivisionLotPrefix}
              setSubdivisionLotPrefix={setSubdivisionLotPrefix}
              subdivisionEstateName={subdivisionEstateName}
              setSubdivisionEstateName={setSubdivisionEstateName}
              subdivisionCustomLotCount={subdivisionCustomLotCount}
              subdivisionCustomAllocatedM2={subdivisionCustomAllocatedM2}
              subdivisionCustomRemainingM2={subdivisionCustomRemainingM2}
              subdivisionLotNamesDraft={subdivisionLotNamesDraft}
              updateSubdivisionLotName={updateSubdivisionLotName}
              subdivisionCustomAreaDrafts={subdivisionCustomAreaDrafts}
              updateSubdivisionCustomAreaDraft={updateSubdivisionCustomAreaDraft}
              setSubdivisionPreviewPanelTab={setSubdivisionPreviewPanelTab}
              previewSubdivision={previewSubdivision}
              subdivisionPreviewLoading={subdivisionPreviewLoading}
              subdivisionApplyLoading={subdivisionApplyLoading}
              parsePositiveFloat={parsePositiveFloat}
              loadSubdivisionBatches={loadSubdivisionBatches}
              subdivisionBatchLoading={subdivisionBatchLoading}
              subdivisionBatches={subdivisionBatches}
              subdivisionDownloadBatchId={subdivisionDownloadBatchId}
              downloadSubdivisionBatch={downloadSubdivisionBatch}
              applySubdivision={applySubdivision}
              onBack={() => goToStep(1)}
              onContinue={() => goToStep(3)}
              subdivisionPreviewPanelTab={subdivisionPreviewPanelTab}
              previewType={previewType}
              onPreviewTypeChange={handlePreviewTypeChange}
              topoSource={topoSource}
              contourInterval={contourInterval}
              topoBuildingHatch={topoBuildingHatch}
              onTopoSourceChange={handleTopoSourceChange}
              onContourIntervalChange={handleContourIntervalChange}
              onTopoBuildingHatchChange={handleTopoBuildingHatchChange}
              northArrowStyle={northArrowStyle}
              northArrowColor={northArrowColor}
              beaconStyle={beaconStyle}
              roadWidth={roadWidth}
              boundaryColor={boundaryColor}
              gridColor={gridColor}
              textColor={textColor}
              roadColor={roadColor}
              riverColor={riverColor}
              buildingColor={buildingColor}
              buildingHatchType={buildingHatchType}
              roadStyle={roadStyle}
              onNorthArrowStyleChange={handleNorthArrowStyleChange}
              onNorthArrowColorChange={handleNorthArrowColorChange}
              onBeaconStyleChange={handleBeaconStyleChange}
              onRoadWidthChange={handleRoadWidthChange}
              onBoundaryColorChange={setBoundaryColor}
              onGridColorChange={setGridColor}
              onTextColorChange={setTextColor}
              onRoadColorChange={setRoadColor}
              onRiverColorChange={setRiverColor}
              onBuildingColorChange={setBuildingColor}
              onBuildingHatchTypeChange={handleBuildingHatchTypeChange}
              onRoadStyleChange={handleRoadStyleChange}
              titleFont={titleFont}
              titleSize={titleSize}
              gridFont={gridFont}
              gridSize={gridSize}
              stationFont={stationFont}
              stationSize={stationSize}
              bearingFont={bearingFont}
              bearingSize={bearingSize}
              areaFont={areaFont}
              areaSize={areaSize}
              onTitleFontChange={setTitleFont}
              onTitleSizeChange={setTitleSize}
              onGridFontChange={setGridFont}
              onGridSizeChange={setGridSize}
              onStationFontChange={setStationFont}
              onStationSizeChange={setStationSize}
              onBearingFontChange={setBearingFont}
              onBearingSizeChange={setBearingSize}
              onAreaFontChange={setAreaFont}
              onAreaSizeChange={setAreaSize}
              surveyPreviewUrl={previewUrl}
              orthophotoPreviewUrl={orthophotoUrl}
              topoMapPreviewUrl={topoMapUrl}
              hasHeightData={elevationPointsPayload.length >= 3}
              subdivisionMapPreviewData={subdivisionMapPreviewData}
              subdivisionSvgPreview={subdivisionSvgPreview}
              onSubdivisionLineCanvasRef={(node) => {
                subdivisionLineCanvasRef.current = node as HTMLElement | null;
              }}
              onSubdivisionMapContainerRef={(node) => {
                subdivisionMapContainerRef.current = node;
              }}
              stopSubdivisionBreakDrag={stopSubdivisionBreakDrag}
              hasMapboxToken={Boolean(MAPBOX_TOKEN)}
              subdivisionFractionBreaksEffective={subdivisionFractionBreaksEffective}
              subdivisionDraggingBreakIndex={subdivisionDraggingBreakIndex}
              startSubdivisionBreakDrag={startSubdivisionBreakDrag}
              subdivisionTargetDisplayM2={subdivisionTargetDisplayM2}
              subdivisionOrientationDisplayDeg={subdivisionOrientationDisplayDeg}
            />
          </Suspense>
        )}

        {/* Step 3: Export (Survey Plan Production) */}
        {workflowMode === "survey" && currentStep === 3 && (
          <div className="step-panel export-panel">
            <div className="panel-left">
              {renderSidebarStepsCard()}
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
                          buildExportFilename(surveyPlanIdentitySegments(), "Survey_Plan", "pdf"),
                          "survey_pdf",
                          false,
                          "SURVEY PLAN"
                        )
                      }
                    >
                      {renderDownloadButtonState(
                        "survey_pdf",
                        "Download PDF",
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      )}
                    </button>
                  </div>

                  {/* Orthophoto PDF - Site Plan already embeds its own orthophoto inset, so this
                      separate export doesn't apply to it */}
                  {meta.template_name !== "site_plan" && (
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
                            buildExportFilename(surveyPlanIdentitySegments(), "Orthophoto", "pdf"),
                            "orthophoto_pdf",
                            false,
                            "ORTHOPHOTO"
                          )
                        }
                      >
                        {renderDownloadButtonState(
                          "orthophoto_pdf",
                          "Download PDF",
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        )}
                      </button>
                    </div>
                  )}

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
                          buildExportFilename(surveyPlanIdentitySegments(), "Survey_Plan", "dxf"),
                          "dwg"
                        )
                      }
                    >
                      {renderDownloadButtonState(
                        "dwg",
                        "Download DWG",
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
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
                          buildExportFilename(surveyPlanIdentitySegments(), "Survey_Plan_Shapefile", "zip"),
                          "shapefile_zip"
                        )
                      }
                    >
                      {renderDownloadButtonState(
                        "shapefile_zip",
                        "Download ZIP",
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      )}
                    </button>
                  </div>

                  {/* Topo Map PDF - not applicable to the Site Plan template */}
                  {meta.template_name !== "site_plan" && (
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
                            buildExportFilename(surveyPlanIdentitySegments(), "Topo_Map", "pdf"),
                            "topomap_pdf",
                            true,
                            "TOPO MAP"
                          )
                        }
                      >
                        {renderDownloadButtonState(
                          "topomap_pdf",
                          "Download PDF",
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        )}
                      </button>
                    </div>
                  )}

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
                          buildExportFilename(surveyPlanIdentitySegments(), "Back_Computation", "pdf"),
                          "back_computation_pdf"
                        )
                      }
                    >
                      {renderDownloadButtonState(
                        "back_computation_pdf",
                        "Download PDF",
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      )}
                    </button>
                  </div>

                  {/* Technical Report (Word) — Adamawa OSG template only */}
                  {meta.template_name === "adamawa_osg" && (
                    <div className="export-card">
                      <div className="export-icon calc">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M7 21h10a2 2 0 002-2V9l-5-5H7a2 2 0 00-2 2v13a2 2 0 002 2z" />
                          <path d="M14 4v5h5" />
                          <path d="M9 13h6M9 17h4" />
                        </svg>
                      </div>
                      <div className="export-info">
                        <h4>Technical Report</h4>
                        <p>Survey demarcation narrative report (Word)</p>
                      </div>
                      <button
                        className="download-btn"
                        disabled={Boolean(downloadLoadingKey) || generatingTechnicalReport}
                        onClick={() => setShowTechnicalReportModal(true)}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        <span>Download DOCX</span>
                      </button>
                    </div>
                  )}
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
                contourInterval={contourInterval}
                topoBuildingHatch={topoBuildingHatch}
                onTopoSourceChange={setTopoSource}
                onContourIntervalChange={setContourInterval}
                onTopoBuildingHatchChange={handleTopoBuildingHatchChange}
                northArrowStyle={northArrowStyle}
                northArrowColor={northArrowColor}
                beaconStyle={beaconStyle}
                roadWidth={roadWidth}
                boundaryColor={boundaryColor}
                gridColor={gridColor}
                textColor={textColor}
                roadColor={roadColor}
                riverColor={riverColor}
                buildingColor={buildingColor}
                buildingHatchType={buildingHatchType}
                roadStyle={roadStyle}
                onNorthArrowStyleChange={(value) => setNorthArrowStyle(value as NorthArrowStyle)}
                onNorthArrowColorChange={(value) => setNorthArrowColor(value as NorthArrowColor)}
                onBeaconStyleChange={(value) => setBeaconStyle(value as BeaconStyle)}
                onRoadWidthChange={(value) => setRoadWidth(value as RoadWidthOption)}
                onBoundaryColorChange={setBoundaryColor}
                onGridColorChange={setGridColor}
                onTextColorChange={setTextColor}
                onRoadColorChange={setRoadColor}
                onRiverColorChange={setRiverColor}
                onBuildingColorChange={setBuildingColor}
                onBuildingHatchTypeChange={(value) => setBuildingHatchType(value as BuildingHatchType)}
                onRoadStyleChange={(value) => setRoadStyle(value as RoadStyleOption)}
                titleFont={titleFont}
                titleSize={titleSize}
                gridFont={gridFont}
                gridSize={gridSize}
                stationFont={stationFont}
                stationSize={stationSize}
                bearingFont={bearingFont}
                bearingSize={bearingSize}
                areaFont={areaFont}
                areaSize={areaSize}
                onTitleFontChange={setTitleFont}
                onTitleSizeChange={setTitleSize}
                onGridFontChange={setGridFont}
                onGridSizeChange={setGridSize}
                onStationFontChange={setStationFont}
                onStationSizeChange={setStationSize}
                onBearingFontChange={setBearingFont}
                onBearingSizeChange={setBearingSize}
                onAreaFontChange={setAreaFont}
                onAreaSizeChange={setAreaSize}
                paperSize={meta.paper_size}
                surveyPreviewUrl={previewUrl}
                orthophotoPreviewUrl={orthophotoUrl}
                topoMapPreviewUrl={topoMapUrl}
                loading={false}
                orthophotoLoading={orthophotoLoading}
                topoMapLoading={topoMapLoading}
                hasHeightData={elevationPointsPayload.length >= 3}
                plotId={plotId}
                onSaveFeatureOverride={handleSaveOverride}
                onRoadNamesSaved={handleRoadNamesSaved}
                scaleText={meta.scale_text}
                templateName={meta.template_name}
              />
            </div>
          </div>
        )}

        {workflowMode === "georeference" && currentStep === 3 && georefSession && (
          <Suspense fallback={<div className="preview-card">Loading georeference exports...</div>}>
            <SurveyPlanGeoreferenceExportStep
              sidebar={renderSidebarStepsCard()}
              session={georefSession}
              features={georefFeatures.length ? georefFeatures : georefSession.features}
              downloadingCsv={georefDownloadingCsv}
              continuing={georefContinuing}
              onBack={() => goToStep(2)}
              onDownloadCsv={handleDownloadGeoreferenceCsv}
              onContinueToSurvey={handleContinueGeoreferenceToSurvey}
            />
          </Suspense>
        )}

        {workflowMode === "georeference" && currentStep === 3 && !georefSession && (
          <div className="preview-card">
            <h3>Georeference export session not available</h3>
            <p>Reload the raster workspace first, then save the digitized output again before exporting.</p>
            <div className="preview-actions">
              <button className="btn-outline" onClick={() => goToStep(1)}>
                Return to Setup
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Batch Export (Subdivision) */}
        {workflowMode === "subdivision" && currentStep === 3 && (
          <Suspense fallback={<div className="preview-card">Loading subdivision export workspace...</div>}>
            <SurveyPlanSubdivisionExportStep
              sidebar={renderSidebarStepsCard()}
              meta={meta}
              latestSubdivisionBatchId={latestSubdivisionBatchId}
              subdivisionBatches={subdivisionBatches}
              subdivisionDownloadBatchId={subdivisionDownloadBatchId}
              downloadSubdivisionBatch={downloadSubdivisionBatch}
              subdivisionCleanCopyBatchId={subdivisionCleanCopyBatchId}
              setSubdivisionCleanCopyBatchId={setSubdivisionCleanCopyBatchId}
              loadSubdivisionCleanCopyBatchDetails={loadSubdivisionCleanCopyBatchDetails}
              setSubdivisionCleanCopyItems={setSubdivisionCleanCopyItems}
              subdivisionCleanCopyTitle={subdivisionCleanCopyTitle}
              setSubdivisionCleanCopyTitle={setSubdivisionCleanCopyTitle}
              subdivisionCleanCopyItems={subdivisionCleanCopyItems}
              subdivisionCleanCopyLoadingBatchId={subdivisionCleanCopyLoadingBatchId}
              getSubdivisionCleanCopyAreaDraftValue={getSubdivisionCleanCopyAreaDraftValue}
              updateSubdivisionCleanCopyAreaDraft={updateSubdivisionCleanCopyAreaDraft}
              subdivisionCleanCopyDownloadBatchId={subdivisionCleanCopyDownloadBatchId}
              downloadSubdivisionCleanCopyPdf={downloadSubdivisionCleanCopyPdf}
              plotId={plotId}
              subdivisionBatchLoading={subdivisionBatchLoading}
              loadSubdivisionBatches={loadSubdivisionBatches}
              onBack={() => {
                setSubdivisionPreviewPanelTab("subdivision_lines");
                setCurrentStep(2);
              }}
              onComplete={() => navigate("/")}
              subdivisionPreview={subdivisionPreview}
            />
          </Suspense>
        )}
      </div>
      {scaleRecommendation && (
        <div className="scale-recommendation-backdrop" role="dialog" aria-modal="true" aria-labelledby="scale-recommendation-title">
          <section className="scale-recommendation-modal">
            <span className="scale-recommendation-eyebrow">First plan preview</span>
            <h2 id="scale-recommendation-title">Recommended survey layout</h2>
            <p>
              This parcel fits cleanly on <strong>{scaleRecommendation.paper_size}</strong> at the standard scale
              <strong> {scaleRecommendation.scale_text}</strong>.
            </p>
            <p className="scale-recommendation-detail">
              The calculated fit is 1:{scaleRecommendation.fitted_scale_denominator.toLocaleString()}; it includes clearance for bearing and distance labels before rounding upward to the standard scale.
            </p>
            {scaleRecommendation.deferred_dimension_count > 0 && (
              <p className="scale-recommendation-detail">
                {scaleRecommendation.deferred_dimension_count} exceptionally close boundary {scaleRecommendation.deferred_dimension_count === 1 ? "segment will" : "segments will"} be shown in the boundary schedule/detail sheet to keep the main plan readable.
              </p>
            )}
            <div className="scale-recommendation-actions">
              <button type="button" className="btn-outline" onClick={() => setScaleRecommendation(null)}>
                Cancel and choose manually
              </button>
              <button type="button" className="btn-primary" onClick={acceptScaleRecommendation}>
                Yes, render this plan
              </button>
            </div>
            <p className="scale-recommendation-footnote">You can change the paper size and scale at any time after rendering.</p>
          </section>
        </div>
      )}
      {showScrollHint && (
        <div className="survey-scroll-hint" aria-hidden="true">
          <span>Scroll for more</span>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
}
