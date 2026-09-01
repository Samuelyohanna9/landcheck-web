import { memo, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api/client";
import "../styles/coordinate-input.css";
import CSVPreviewModal from "./CSVPreviewModal";
import CoordinateSystemSelect from "./CoordinateSystemSelect";
import SurveyLoadingAnimation from "./SurveyLoadingAnimation";
import {
  COORDINATE_SYSTEM_GROUPS,
  getCoordinateSystemEpsgLabel,
  isProjectedCoordinateSystem,
  WGS84_NIGERIA_METERS,
} from "../utils/coordinateConverter";

const AI_QUOTA_EXHAUSTED_KEY = "plan-reader-quota-exhausted-date";

type PlanReaderCheck = { severity: "ok" | "warning" | "error"; code: string; message: string };
type PlanReaderBeacon = { station: string; x: number; y: number; confidence: number };
type PlanReaderPlot = { plot_number?: string | null; beacons: PlanReaderBeacon[] };
type PlanReaderRoad = { name?: string | null; width_m?: number | null; points: { x: number; y: number }[] };
type PlanReaderExtracted = {
  plan_number?: string | null;
  title_text?: string | null;
  location_text?: string | null;
  lga_text?: string | null;
  state_text?: string | null;
  scale_text?: string | null;
  surveyor_name?: string | null;
  coordinate_system_guess?: string;
  beacons?: PlanReaderBeacon[];
  layout_type?: "single_plot" | "estate_layout";
  plots?: PlanReaderPlot[];
  roads?: PlanReaderRoad[];
};

const PROJECTED_SYSTEM_KEYS = ["minna_31", "minna_32", "minna_33", "utm_31n", "utm_32n", "utm_33n"];

const FIELD_IMPORT_QUOTA_EXHAUSTED_KEY = "field-to-finish-quota-exhausted-date";

type FieldImportCategory =
  | "boundary"
  | "spot_height"
  | "tree"
  | "electric_pole"
  | "drain"
  | "building_corner"
  | "fence"
  | "road_edge"
  | "other";
const FIELD_IMPORT_CATEGORY_LABELS: Record<FieldImportCategory, string> = {
  boundary: "Boundary corner",
  spot_height: "Spot height",
  tree: "Tree",
  electric_pole: "Electric pole",
  drain: "Drain",
  building_corner: "Building corner",
  fence: "Fence",
  road_edge: "Road edge",
  other: "Other",
};
type FieldImportPoint = {
  point_number?: string | null;
  x: number;
  y: number;
  elevation_m?: number | null;
  feature_code_raw?: string | null;
  category: FieldImportCategory;
  description?: string | null;
  confidence: number;
};
type FieldImportParsed = {
  points: FieldImportPoint[];
  column_mapping_summary?: string;
  coordinate_system_guess?: string;
  coordinate_system_evidence?: string | null;
  extraction_notes?: string[];
};

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
  is_boundary?: boolean;
  // AI Field-to-Finish classification (see field_to_finish.py's POINT_CATEGORIES) - optional and
  // purely additive, only ever set by confirmFieldImport below. Rides along through
  // elevationPointsPayload/surveyInputCoordinatesPayload in SurveyPlan.tsx so the topo renderer can
  // draw a distinct symbol for it; every other point-creation path in this app simply never sets
  // it, so nothing about the existing coordinate-entry/CSV-import/Plan-Reader flows changes.
  category?: string;
  feature_code?: string | null;
};

type CoordinateSystem = {
  key: string;
  name: string;
  epsgLabel: string;
  description: string;
};

type Props = {
  points: ManualPoint[];
  onUpdatePoint: (index: number, key: keyof ManualPoint, value: string | number | boolean) => void;
  onRemovePoint: (index: number) => void;
  onAddPoint: () => void;
  onBulkUpload: (points: ManualPoint[]) => void;
  disabled?: boolean;
  coordinateSystem: string;
  onCoordinateSystemChange: (system: string) => void;
  // Opt-in: shows the "Boundary point" checkbox/"Spot height only" badge per row, and relaxes the
  // minimum-3-points delete guard to only protect boundary points. This component is shared with
  // other coordinate-entry flows (e.g. hazard analysis) that have no such distinction, so it stays
  // off unless the caller explicitly wants it.
  showPointRoles?: boolean;
  // Opt-in: shows "Import from Plan (AI)" next to the existing CSV/Excel import, letting a
  // surveyor upload a photo/scan of an EXISTING plan instead of retyping its coordinate table.
  // Only Survey Plan passes this (it owns plan metadata to fill in); Hazard Analysis's plain
  // coordinate entry has no such metadata, so it simply doesn't pass the prop and this stays off.
  onImportedMetadata?: (fields: Record<string, string>) => void;
};

// Flattened view of COORDINATE_SYSTEM_GROUPS - kept for the "currently selected" lookup below;
// CoordinateSystemSelect renders the grouped form itself.
const COORDINATE_SYSTEMS: CoordinateSystem[] = COORDINATE_SYSTEM_GROUPS.flatMap((group) => group.systems);

const getPlaceholders = (system: string): { x: string; y: string } => {
  switch (system) {
    case WGS84_NIGERIA_METERS:
      return { x: "e.g. 538120.78", y: "e.g. 1012340.56" };
    case "utm_31n":
      return { x: "e.g. 340250.45", y: "e.g. 998450.32" };
    case "utm_32n":
      return { x: "e.g. 538120.78", y: "e.g. 1012340.56" };
    case "utm_33n":
      return { x: "e.g. 285670.23", y: "e.g. 1245890.45" };
    case "minna_31":
      return { x: "e.g. 340250.45", y: "e.g. 998450.32" };
    case "minna_32":
      return { x: "e.g. 538120.78", y: "e.g. 1012340.56" };
    case "minna_33":
      return { x: "e.g. 285670.23", y: "e.g. 1245890.45" };
    case "ghana_utm_30n":
      return { x: "e.g. 811654.21", y: "e.g. 620144.52" };
    case "ghana_leigon_grid":
      return { x: "e.g. 364346.58", y: "e.g. 103339.97" };
    case "uganda_utm_35n":
      return { x: "e.g. 832785.45", y: "e.g. -138352.33" };
    case "uganda_utm_36n":
      return { x: "e.g. 453543.14", y: "e.g. 38421.28" };
    case "uganda_arc1960_35n":
      return { x: "e.g. 832716.80", y: "e.g. -138049.41" };
    case "uganda_arc1960_36n":
      return { x: "e.g. 453461.26", y: "e.g. 38723.00" };
    default:
      return { x: "e.g. 7.4951", y: "e.g. 9.0579" };
  }
};

function CoordinateInput({
  points,
  onUpdatePoint,
  onRemovePoint,
  onAddPoint,
  onBulkUpload,
  disabled = false,
  coordinateSystem,
  onCoordinateSystemChange,
  showPointRoles = false,
  onImportedMetadata,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [rawFileData, setRawFileData] = useState<(string | number)[][]>([]);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [aiReading, setAiReading] = useState(false);
  // Populated only when the AI Plan Reader detects an estate layout with more than one plot - a
  // single-plot read never touches this, so the existing import flow below is completely
  // unaffected. The surveyor picks which plot's beacons to load before the normal CSV-preview/
  // confirm step (unchanged) takes over.
  const [aiLayoutPlots, setAiLayoutPlots] = useState<PlanReaderPlot[]>([]);
  const [aiLayoutRoads, setAiLayoutRoads] = useState<PlanReaderRoad[]>([]);
  const [aiLayoutCoordSystem, setAiLayoutCoordSystem] = useState("");
  // Persisted (not just a toast) so a page refresh doesn't make the button look available again
  // and let the surveyor waste another attempt on a request that's just going to 429 anyway - a
  // soft, client-side echo of the server's real daily quota, keyed to today's date.
  const [aiQuotaExhausted, setAiQuotaExhausted] = useState(() => {
    try {
      return window.localStorage.getItem(AI_QUOTA_EXHAUSTED_KEY) === new Date().toDateString();
    } catch {
      return false;
    }
  });
  const fieldImportFileInputRef = useRef<HTMLInputElement>(null);
  const [fieldImportReading, setFieldImportReading] = useState(false);
  const [fieldImportResult, setFieldImportResult] = useState<FieldImportParsed | null>(null);
  const [fieldImportCategories, setFieldImportCategories] = useState<FieldImportCategory[]>([]);
  const [fieldImportMode, setFieldImportMode] = useState<"upload" | "paste">("upload");
  const [fieldImportPasteText, setFieldImportPasteText] = useState("");
  // Set right before opening CSVPreviewModal for a field-import confirm, keyed by the same station
  // name each row was given - handlePreviewConfirm re-attaches category/feature_code by that key
  // once the modal's own (unmodified) boundary-selection step confirms, then clears this.
  const [pendingFieldImportCategoryByStation, setPendingFieldImportCategoryByStation] = useState<Record<
    string,
    { category: FieldImportCategory; feature_code: string | null }
  > | null>(null);
  const [fieldImportQuotaExhausted, setFieldImportQuotaExhausted] = useState(() => {
    try {
      return window.localStorage.getItem(FIELD_IMPORT_QUOTA_EXHAUSTED_KEY) === new Date().toDateString();
    } catch {
      return false;
    }
  });
  const isProjected = isProjectedCoordinateSystem(coordinateSystem);
  const xLabel = isProjected ? "Easting (m)" : "Longitude";
  const yLabel = isProjected ? "Northing (m)" : "Latitude";
  const placeholders = getPlaceholders(coordinateSystem);
  const selectedCoordinateSystem = useMemo(
    () => COORDINATE_SYSTEMS.find((sys) => sys.key === coordinateSystem) ?? COORDINATE_SYSTEMS[0],
    [coordinateSystem]
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const resetFileInput = () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
      setUploadParsing(true);
      try {
        const { default: Papa } = await import("papaparse");
        Papa.parse(file, {
          complete: (results) => {
            const data = results.data as (string | number)[][];
            if (data.length > 0) {
              setRawFileData(data);
              setShowPreviewModal(true);
            } else {
              alert("No data found in file. Please check the format.");
            }
            setUploadParsing(false);
            resetFileInput();
          },
          error: (error) => {
            alert(`Error parsing CSV: ${error.message}`);
            setUploadParsing(false);
            resetFileInput();
          },
        });
      } catch (error) {
        alert(`Error loading CSV parser: ${error}`);
        setUploadParsing(false);
        resetFileInput();
      }
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      setUploadParsing(true);
      try {
        const XLSX = await import("xlsx");
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          try {
            const data = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as (string | number)[][];

            if (jsonData.length > 0) {
              setRawFileData(jsonData);
              setShowPreviewModal(true);
            } else {
              alert("No data found in file. Please check the format.");
            }
          } catch (error) {
            alert(`Error parsing Excel file: ${error}`);
          } finally {
            setUploadParsing(false);
            resetFileInput();
          }
        };
        reader.onerror = () => {
          alert("Could not read the Excel file. Please try again.");
          setUploadParsing(false);
          resetFileInput();
        };
        reader.readAsArrayBuffer(file);
      } catch (error) {
        alert(`Error loading Excel parser: ${error}`);
        setUploadParsing(false);
        resetFileInput();
      }
    } else {
      alert("Please upload a CSV (.csv) or Excel (.xlsx, .xls) file");
      resetFileInput();
    }
  };

  const handlePreviewConfirm = (parsedPoints: ManualPoint[]) => {
    if (pendingFieldImportCategoryByStation) {
      const categoryByStation = pendingFieldImportCategoryByStation;
      const enrichedPoints = parsedPoints.map((point) => {
        const match = categoryByStation[point.station];
        return match ? { ...point, category: match.category, feature_code: match.feature_code } : point;
      });
      setPendingFieldImportCategoryByStation(null);
      onBulkUpload(enrichedPoints);
      return;
    }
    onBulkUpload(parsedPoints);
  };

  // Reuses the exact same review flow as a CSV import (CSVPreviewModal, driven by the same
  // rawFileData/showPreviewModal state below) instead of a second, separate review UI - the AI's
  // job is only to produce the same [header, ...rows] shape a parsed spreadsheet would, so the
  // surveyor always corrects/confirms coordinates through one already-tested screen either way.
  const markQuotaExhausted = () => {
    setAiQuotaExhausted(true);
    try {
      window.localStorage.setItem(AI_QUOTA_EXHAUSTED_KEY, new Date().toDateString());
    } catch {
      // Best-effort only - a private/incognito window or blocked storage just means this specific
      // reminder won't survive a refresh; the server's own quota still enforces the real limit.
    }
  };

  const handleAiPlanUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const resetInput = () => {
      if (aiFileInputRef.current) aiFileInputRef.current.value = "";
    };
    if (!file) return;

    setAiReading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/plan-reader/extract", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90000,
      });
      const extracted = (res.data?.extracted || {}) as PlanReaderExtracted;
      const checks = (res.data?.checks || []) as PlanReaderCheck[];
      const beacons = extracted.beacons || [];

      if (beacons.length < 3) {
        toast.error("The AI couldn't read at least 3 beacon coordinates from this file.");
        return;
      }

      const isProjectedGuess = PROJECTED_SYSTEM_KEYS.includes(extracted.coordinate_system_guess || "");
      if (extracted.coordinate_system_guess && extracted.coordinate_system_guess !== "unknown") {
        onCoordinateSystemChange(extracted.coordinate_system_guess);
      }

      const plots = extracted.plots && extracted.plots.length > 0 ? extracted.plots : [{ plot_number: null, beacons }];
      const isEstateLayout = extracted.layout_type === "estate_layout" && plots.length > 1;

      if (isEstateLayout) {
        // Defer opening the CSV-preview/confirm modal until the surveyor picks a plot - keeps the
        // existing single-plot import path (below) completely untouched for the common case.
        setAiLayoutPlots(plots);
        setAiLayoutRoads(extracted.roads || []);
        setAiLayoutCoordSystem(extracted.coordinate_system_guess || "");
      } else {
        const header = isProjectedGuess ? ["Station", "Easting", "Northing"] : ["Station", "Longitude", "Latitude"];
        const rows: (string | number)[][] = beacons.map((b) => [b.station, b.x, b.y]);
        setRawFileData([header, ...rows]);
        setShowPreviewModal(true);
      }

      const metadataFields: Record<string, string> = {};
      if (extracted.plan_number) metadataFields.plan_number = extracted.plan_number;
      if (extracted.title_text) metadataFields.title_text = extracted.title_text;
      if (extracted.location_text) metadataFields.location_text = extracted.location_text;
      if (extracted.lga_text) metadataFields.lga_text = extracted.lga_text;
      if (extracted.state_text) metadataFields.state_text = extracted.state_text;
      if (extracted.scale_text) metadataFields.scale_text = extracted.scale_text;
      if (extracted.surveyor_name) metadataFields.surveyor_name = extracted.surveyor_name;
      if (Object.keys(metadataFields).length > 0) onImportedMetadata?.(metadataFields);

      const remaining = res.data?.readings_remaining_today;
      const remainingSuffix = typeof remaining === "number" ? ` (${remaining} reading${remaining === 1 ? "" : "s"} left today)` : "";
      // Lock the button proactively the moment the 3rd read lands, rather than waiting for a
      // pointless 4th attempt to discover it - same "tell them clearly, don't make them find out
      // the hard way" goal as the 429 handling below.
      if (remaining === 0) markQuotaExhausted();

      const problems = checks.filter((c) => c.severity !== "ok");
      if (isEstateLayout) {
        const roadCount = extracted.roads?.length || 0;
        const roadNote = roadCount > 0 ? ` and ${roadCount} road${roadCount === 1 ? "" : "s"}` : "";
        toast.success(
          `AI detected an estate layout with ${plots.length} plot(s)${roadNote} - pick a plot below to import.${remainingSuffix}`,
          { duration: 8000 },
        );
        if (roadCount > 0) {
          toast("Road import isn't automated yet - add road geometry manually on the map after importing your plot.", {
            icon: "🛣️",
            duration: 8000,
          });
        }
      } else if (problems.length > 0) {
        toast.error(
          `AI read ${beacons.length} beacon(s) with ${problems.length} thing${problems.length === 1 ? "" : "s"} to review: ${problems[0].message}${remainingSuffix}`,
          { duration: 7000 },
        );
        problems.slice(1, 4).forEach((c) => toast(c.message, { icon: "⚠️", duration: 7000 }));
      } else {
        toast.success(`AI read ${beacons.length} beacon(s) - review and confirm below.${remainingSuffix}`);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 429) {
        markQuotaExhausted();
        toast.error(
          typeof detail === "string" ? detail : "You've used all your AI plan readings for today - please try again tomorrow.",
          { duration: 10000, icon: "⏳" },
        );
      } else {
        toast.error(typeof detail === "string" ? detail : "Couldn't read this plan. Try a clearer photo or scan.");
      }
    } finally {
      setAiReading(false);
      resetInput();
    }
  };

  const selectAiLayoutPlot = (plot: PlanReaderPlot) => {
    const isProjectedGuess = PROJECTED_SYSTEM_KEYS.includes(aiLayoutCoordSystem);
    const header = isProjectedGuess ? ["Station", "Easting", "Northing"] : ["Station", "Longitude", "Latitude"];
    const rows: (string | number)[][] = plot.beacons.map((b) => [b.station, b.x, b.y]);
    setRawFileData([header, ...rows]);
    setShowPreviewModal(true);
    setAiLayoutPlots([]);
  };

  const markFieldImportQuotaExhausted = () => {
    setFieldImportQuotaExhausted(true);
    try {
      window.localStorage.setItem(FIELD_IMPORT_QUOTA_EXHAUSTED_KEY, new Date().toDateString());
    } catch {
      // Best-effort only, same as the Plan Reader's quota flag.
    }
  };

  const submitFieldImportContent = async (file: File) => {
    setFieldImportReading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/field-to-finish/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      const parsed = (res.data?.parsed || { points: [] }) as FieldImportParsed;
      if (!parsed.points || parsed.points.length === 0) {
        toast.error("The AI couldn't read any coordinate rows from this data.");
        return;
      }
      setFieldImportResult(parsed);
      setFieldImportCategories(parsed.points.map((p) => p.category));
      if (parsed.coordinate_system_guess && parsed.coordinate_system_guess !== "unknown") {
        onCoordinateSystemChange(parsed.coordinate_system_guess);
      }

      const remaining = res.data?.imports_remaining_today;
      const remainingSuffix = typeof remaining === "number" ? ` (${remaining} import${remaining === 1 ? "" : "s"} left today)` : "";
      if (remaining === 0) markFieldImportQuotaExhausted();
      toast.success(`AI read ${parsed.points.length} point(s) - review the categories below and confirm.${remainingSuffix}`, {
        duration: 6000,
      });
      setFieldImportPasteText("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 429) {
        markFieldImportQuotaExhausted();
        toast.error(
          typeof detail === "string" ? detail : "You've used all your AI field data imports for today - please try again tomorrow.",
          { duration: 10000, icon: "⏳" },
        );
      } else {
        toast.error(typeof detail === "string" ? detail : "Couldn't read this data. Check it's a plain-text coordinate export.");
      }
    } finally {
      setFieldImportReading(false);
    }
  };

  const handleFieldDataUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fieldImportFileInputRef.current) fieldImportFileInputRef.current.value = "";
    if (!file) return;
    await submitFieldImportContent(file);
  };

  const handleFieldDataPasteSubmit = async () => {
    const text = fieldImportPasteText.trim();
    if (!text) return;
    // Wrapped as a File so it reuses the exact same endpoint/validation/quota path as a real
    // upload - the backend only ever reads this as plain text either way (see field_to_finish.py's
    // router, which decodes the upload as UTF-8 text regardless of how it arrived).
    const file = new File([text], "pasted-data.txt", { type: "text/plain" });
    await submitFieldImportContent(file);
  };

  const updateFieldImportCategory = (index: number, category: FieldImportCategory) => {
    setFieldImportCategories((prev) => prev.map((c, i) => (i === index ? category : c)));
  };

  const confirmFieldImport = () => {
    if (!fieldImportResult) return;
    const categoryByStation: Record<string, { category: FieldImportCategory; feature_code: string | null }> = {};
    const header = isProjected ? ["Station", "Easting", "Northing", "Height"] : ["Station", "Longitude", "Latitude", "Height"];
    const rows: (string | number)[][] = fieldImportResult.points.map((point, index) => {
      const station = String(point.point_number || String.fromCharCode(65 + index)).trim();
      categoryByStation[station] = { category: fieldImportCategories[index], feature_code: point.feature_code_raw ?? null };
      return [
        station,
        point.x,
        point.y,
        point.elevation_m !== undefined && point.elevation_m !== null && Number.isFinite(Number(point.elevation_m))
          ? Number(point.elevation_m)
          : "",
      ];
    });
    // Hands off to the exact same CSV-preview/boundary-selection modal a spreadsheet or Plan
    // Reader import uses - the surveyor picks which points are boundary corners there, same as any
    // other import path, rather than the AI's category guess silently deciding that for them.
    // handlePreviewConfirm re-attaches category/feature_code by station once that modal confirms.
    setPendingFieldImportCategoryByStation(categoryByStation);
    setRawFileData([header, ...rows]);
    setShowPreviewModal(true);
    setFieldImportResult(null);
    setFieldImportCategories([]);
  };

  const cancelFieldImport = () => {
    setFieldImportResult(null);
    setFieldImportCategories([]);
  };

  return (
    <div className="coord-input-container">
      <div className="coord-header">
        <h3 className="coord-title">
          {showPointRoles && (
            <svg className="coord-title-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="7" />
              <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
              <path d="M10 1.6v2.4M10 16v2.4M1.6 10h2.4M16 10h2.4" />
            </svg>
          )}
          Boundary Coordinates
        </h3>
        <p className="coord-subtitle">Add parcel points directly or import a prepared sheet.</p>
      </div>

      <div className="coord-system-selector">
        <label className="coord-system-label" htmlFor="coord-system-select">
          Coordinate System
        </label>
        <div className="coord-system-field">
          <CoordinateSystemSelect
            id="coord-system-select"
            value={coordinateSystem}
            onChange={onCoordinateSystemChange}
            disabled={disabled}
          />
          <div className="coord-system-meta" id="coord-system-help" aria-live="polite">
            <strong>{selectedCoordinateSystem.name}</strong>
            <span>{selectedCoordinateSystem.description}</span>
            <em>{selectedCoordinateSystem.epsgLabel || getCoordinateSystemEpsgLabel(selectedCoordinateSystem.key)}</em>
          </div>
        </div>
      </div>

      <div className="coord-upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={handleFileUpload}
          disabled={disabled || uploadParsing}
          className="file-input-hidden"
          id="coord-file-upload"
        />
        <label htmlFor="coord-file-upload" className={`upload-btn ${disabled || uploadParsing ? "disabled" : ""}`}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          {uploadParsing ? "Processing file..." : "Import Sheet"}
        </label>
        <span className="upload-hint">CSV or Excel · station, easting, northing</span>

        {onImportedMetadata && (
          <>
            <input
              ref={aiFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleAiPlanUpload}
              disabled={disabled || aiReading || aiQuotaExhausted}
              className="file-input-hidden"
              id="coord-ai-plan-upload"
            />
            <label
              htmlFor="coord-ai-plan-upload"
              className={`upload-btn upload-btn--ai ${disabled || aiReading || aiQuotaExhausted ? "disabled" : ""}`}
              title={aiQuotaExhausted ? "Resets tomorrow" : undefined}
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M11 2a1 1 0 10-2 0v1.05A6.002 6.002 0 004.05 9H3a1 1 0 100 2h1.05A6.002 6.002 0 009 15.95V17a1 1 0 102 0v-1.05A6.002 6.002 0 0016.95 11H18a1 1 0 100-2h-1.05A6.002 6.002 0 0011 3.05V2zm-1 4a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
              {aiReading ? "Reading plan..." : aiQuotaExhausted ? "AI readings used up for today" : "Import from Plan (AI)"}
            </label>
            <span className="upload-hint">
              {aiQuotaExhausted
                ? "You've used all your AI plan readings for today - resets tomorrow."
                : "Photo, scan, PDF of an existing survey plan or handwritten coordinate table. AI extracts beacons and coordinates automatically."}
            </span>

            <div className="coord-field-import-mode-toggle">
              <button
                type="button"
                className={`coord-field-import-mode-btn ${fieldImportMode === "upload" ? "active" : ""}`}
                onClick={() => setFieldImportMode("upload")}
              >
                Upload File
              </button>
              <button
                type="button"
                className={`coord-field-import-mode-btn ${fieldImportMode === "paste" ? "active" : ""}`}
                onClick={() => setFieldImportMode("paste")}
              >
                Paste / Type Data
              </button>
            </div>

            {fieldImportMode === "upload" ? (
              <>
                <input
                  ref={fieldImportFileInputRef}
                  type="file"
                  accept=".txt,.csv,.dat,.asc,.tsv"
                  onChange={handleFieldDataUpload}
                  disabled={disabled || fieldImportReading || fieldImportQuotaExhausted}
                  className="file-input-hidden"
                  id="coord-field-import-upload"
                />
                <label
                  htmlFor="coord-field-import-upload"
                  className={`upload-btn upload-btn--ai ${disabled || fieldImportReading || fieldImportQuotaExhausted ? "disabled" : ""}`}
                  title={fieldImportQuotaExhausted ? "Resets tomorrow" : undefined}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 2a1 1 0 10-2 0v1.05A6.002 6.002 0 004.05 9H3a1 1 0 100 2h1.05A6.002 6.002 0 009 15.95V17a1 1 0 102 0v-1.05A6.002 6.002 0 0016.95 11H18a1 1 0 100-2h-1.05A6.002 6.002 0 0011 3.05V2zm-1 4a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                  {fieldImportReading
                    ? "Reading field data..."
                    : fieldImportQuotaExhausted
                      ? "AI imports used up for today"
                      : "Smart Field Import (AI)"}
                </label>
                <span className="upload-hint">
                  {fieldImportQuotaExhausted
                    ? "You've used all your AI field data imports for today - resets tomorrow."
                    : "Raw GNSS/total station export (.txt/.csv), even with messy or unlabeled columns and feature codes. AI sniffs the columns and classifies each point."}
                </span>
              </>
            ) : (
              <div className="coord-field-import-paste">
                <textarea
                  className="coord-field-import-paste-textarea"
                  rows={5}
                  placeholder={
                    "Paste or type raw coordinate data here, e.g.\nP001 329110.22 1028183.41 212.3 EP\nP002 329119.61 1028191.32 211.8 TR"
                  }
                  value={fieldImportPasteText}
                  onChange={(e) => setFieldImportPasteText(e.target.value)}
                  disabled={disabled || fieldImportReading || fieldImportQuotaExhausted}
                />
                <button
                  type="button"
                  className="upload-btn upload-btn--ai coord-field-import-paste-submit"
                  onClick={() => void handleFieldDataPasteSubmit()}
                  disabled={disabled || fieldImportReading || fieldImportQuotaExhausted || !fieldImportPasteText.trim()}
                  title={fieldImportQuotaExhausted ? "Resets tomorrow" : undefined}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 2a1 1 0 10-2 0v1.05A6.002 6.002 0 004.05 9H3a1 1 0 100 2h1.05A6.002 6.002 0 009 15.95V17a1 1 0 102 0v-1.05A6.002 6.002 0 0016.95 11H18a1 1 0 100-2h-1.05A6.002 6.002 0 0011 3.05V2zm-1 4a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                  {fieldImportReading
                    ? "Reading field data..."
                    : fieldImportQuotaExhausted
                      ? "AI imports used up for today"
                      : "Parse with AI"}
                </button>
                <span className="upload-hint">
                  {fieldImportQuotaExhausted
                    ? "You've used all your AI field data imports for today - resets tomorrow."
                    : "Type or paste messy coordinate rows directly - no need to save a file first. AI sniffs the columns and classifies each point."}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {aiLayoutPlots.length > 1 && (
        <div className="coord-ai-layout-panel">
          <p className="coord-ai-layout-title">Estate layout detected - choose a plot to import:</p>
          <div className="coord-ai-layout-plots">
            {aiLayoutPlots.map((plot, index) => (
              <button
                type="button"
                key={`${plot.plot_number || "plot"}-${index}`}
                className="coord-ai-layout-plot-btn"
                onClick={() => selectAiLayoutPlot(plot)}
              >
                {plot.plot_number || `Plot ${index + 1}`}
                <span>{plot.beacons.length} beacon(s)</span>
              </button>
            ))}
          </div>
          {aiLayoutRoads.length > 0 && (
            <p className="upload-hint">
              Also detected {aiLayoutRoads.length} road{aiLayoutRoads.length === 1 ? "" : "s"}
              {aiLayoutRoads.some((r) => r.name) ? ` (${aiLayoutRoads.filter((r) => r.name).map((r) => r.name).join(", ")})` : ""} -
              road import isn't automated yet; add them manually on the map after importing your plot.
            </p>
          )}
        </div>
      )}

      {fieldImportResult && (
        <div className="coord-field-import-panel">
          <div className="coord-field-import-header">
            <p className="coord-ai-layout-title">Review {fieldImportResult.points.length} imported point(s)</p>
            <button type="button" className="coord-field-import-cancel" onClick={cancelFieldImport}>
              Cancel
            </button>
          </div>
          {fieldImportResult.column_mapping_summary && (
            <p className="upload-hint">{fieldImportResult.column_mapping_summary}</p>
          )}
          {fieldImportResult.coordinate_system_guess && fieldImportResult.coordinate_system_guess !== "unknown" && (
            <p className="upload-hint">
              Detected coordinate system: <strong>{fieldImportResult.coordinate_system_guess}</strong>
              {fieldImportResult.coordinate_system_evidence ? ` - ${fieldImportResult.coordinate_system_evidence}` : ""} (applied above).
            </p>
          )}
          <div className="coord-field-import-table-wrap">
            <table className="coord-field-import-table">
              <thead>
                <tr>
                  <th>Point</th>
                  <th>X</th>
                  <th>Y</th>
                  <th>Elev.</th>
                  <th>Code</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {fieldImportResult.points.map((point, index) => (
                  <tr key={index}>
                    <td>{point.point_number || `P${index + 1}`}</td>
                    <td>{point.x}</td>
                    <td>{point.y}</td>
                    <td>{point.elevation_m ?? "-"}</td>
                    <td>{point.feature_code_raw || "-"}</td>
                    <td>
                      <select
                        value={fieldImportCategories[index] || point.category}
                        onChange={(e) => updateFieldImportCategory(index, e.target.value as FieldImportCategory)}
                      >
                        {Object.entries(FIELD_IMPORT_CATEGORY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fieldImportResult.extraction_notes && fieldImportResult.extraction_notes.length > 0 && (
            <ul className="coord-field-import-notes">
              {fieldImportResult.extraction_notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          )}
          <p className="upload-hint">
            Next you'll pick which points are boundary corners, same as any other import - feature categories carry
            through and show as map symbols (tree, pole, drain, etc.) once your plot renders.
          </p>
          <button type="button" className="coord-field-import-confirm" onClick={confirmFieldImport}>
            Continue to Boundary Selection ({fieldImportResult.points.length} point{fieldImportResult.points.length === 1 ? "" : "s"})
          </button>
        </div>
      )}

      <div className="coord-list-wrapper">
        {(() => {
          // Without point roles enabled, every point counts toward the minimum - matches this
          // component's original (pre-role) behavior exactly for callers that don't opt in.
          const boundaryCount = showPointRoles
            ? points.filter((p) => p.is_boundary !== false).length
            : points.length;
          return points.map((point, index) => {
            const isBoundary = !showPointRoles || point.is_boundary !== false;
            return (
              <div
                key={index}
                className={`coord-point-card ${disabled ? "disabled" : ""} ${isBoundary ? "" : "spot-height"}`}
              >
                <div className="coord-point-header">
                  <span className="row-number">{index + 1}</span>
                  <input
                    type="text"
                    value={point.station}
                    onChange={(event) => onUpdatePoint(index, "station", event.target.value)}
                    placeholder="A"
                    disabled={disabled}
                    className="station-input"
                    aria-label={`Station name for point ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onRemovePoint(index)}
                    disabled={disabled || (isBoundary && boundaryCount <= 3)}
                    className="remove-btn"
                    title={isBoundary && boundaryCount <= 3 ? "Minimum 3 boundary points required" : "Remove point"}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
                <div className="coord-point-fields">
                  <label className="coord-field">
                    <span className="coord-field-label">{xLabel}</span>
                    <input
                      type="number"
                      step="any"
                      value={point.lng || ""}
                      onChange={(event) => onUpdatePoint(index, "lng", parseFloat(event.target.value) || 0)}
                      onBlur={(event) => {
                        // Easting/northing entry is normalized to 3 decimal places (millimetre
                        // precision, standard for projected survey coordinates) once the surveyor
                        // finishes typing - rounding on every keystroke instead would make it
                        // impossible to type past the 3rd decimal at all. Left alone for WGS84
                        // lat/lon, where 3 decimal degrees (~111m) would be a huge precision loss.
                        if (!isProjected) return;
                        const parsed = parseFloat(event.target.value);
                        if (Number.isFinite(parsed)) onUpdatePoint(index, "lng", Math.round(parsed * 1000) / 1000);
                      }}
                      placeholder={placeholders.x}
                      disabled={disabled}
                      className="coord-input"
                    />
                  </label>
                  <label className="coord-field">
                    <span className="coord-field-label">{yLabel}</span>
                    <input
                      type="number"
                      step="any"
                      value={point.lat || ""}
                      onChange={(event) => onUpdatePoint(index, "lat", parseFloat(event.target.value) || 0)}
                      onBlur={(event) => {
                        if (!isProjected) return;
                        const parsed = parseFloat(event.target.value);
                        if (Number.isFinite(parsed)) onUpdatePoint(index, "lat", Math.round(parsed * 1000) / 1000);
                      }}
                      placeholder={placeholders.y}
                      disabled={disabled}
                      className="coord-input"
                    />
                  </label>
                </div>
                {showPointRoles && (
                  <div className="coord-point-role">
                    <label className="coord-role-toggle">
                      <input
                        type="checkbox"
                        checked={isBoundary}
                        onChange={(event) => onUpdatePoint(index, "is_boundary", event.target.checked)}
                        disabled={disabled}
                      />
                      Boundary point
                    </label>
                    {!isBoundary && <span className="spot-height-badge">Spot height only</span>}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      <div className="coord-footer">
        <button type="button" onClick={onAddPoint} disabled={disabled} className="add-point-btn">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Add Point
        </button>
        <span className="coord-tip">
          {coordinateSystem === WGS84_NIGERIA_METERS
            ? "Auto-UTM resolves the Nigeria metre zone from map-picked or georeferenced locations. For direct imported metre sheets, use the exact UTM zone."
            : isProjected
              ? "Projected coordinates convert to WGS84 automatically for processing."
              : "Ring will auto-close on creation."}
        </span>
      </div>

      <CSVPreviewModal
        isOpen={showPreviewModal}
        onClose={() => {
          setShowPreviewModal(false);
          setPendingFieldImportCategoryByStation(null);
        }}
        rawData={rawFileData}
        onConfirm={handlePreviewConfirm}
        coordinateSystem={coordinateSystem}
      />

      {uploadParsing && (
        <div className="coord-upload-overlay" role="status" aria-live="polite">
          <div className="coord-upload-overlay-card">
            <span className="coord-upload-spinner" />
            <p className="coord-upload-overlay-title">Uploading data&hellip;</p>
            <p className="coord-upload-overlay-subtitle">Reading your file and parsing coordinates</p>
          </div>
        </div>
      )}

      {aiReading && (
        <div className="coord-ai-fullscreen-overlay" role="status" aria-live="polite">
          <div className="coord-ai-fullscreen-card">
            <SurveyLoadingAnimation size="medium" />
            <p className="coord-ai-fullscreen-title">AI is reading your document&hellip;</p>
            <p className="coord-ai-fullscreen-subtitle">
              Extracting beacons, coordinates, and plan details. This usually takes a few seconds.
            </p>
          </div>
        </div>
      )}

      {fieldImportReading && (
        <div className="coord-ai-fullscreen-overlay" role="status" aria-live="polite">
          <div className="coord-ai-fullscreen-card">
            <SurveyLoadingAnimation size="medium" />
            <p className="coord-ai-fullscreen-title">AI is reading your field data&hellip;</p>
            <p className="coord-ai-fullscreen-subtitle">
              Sniffing columns, classifying points, and detecting the coordinate system. This usually takes a few seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CoordinateInput);
