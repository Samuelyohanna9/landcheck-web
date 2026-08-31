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
type PlanReaderExtracted = {
  plan_number?: string | null;
  title_text?: string | null;
  location_text?: string | null;
  lga_text?: string | null;
  state_text?: string | null;
  scale_text?: string | null;
  surveyor_name?: string | null;
  coordinate_system_guess?: string;
  beacons?: { station: string; x: number; y: number; confidence: number }[];
};

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
  is_boundary?: boolean;
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

      const isProjectedGuess = ["minna_31", "minna_32", "minna_33", "utm_31n", "utm_32n", "utm_33n"].includes(
        extracted.coordinate_system_guess || "",
      );
      if (extracted.coordinate_system_guess && extracted.coordinate_system_guess !== "unknown") {
        onCoordinateSystemChange(extracted.coordinate_system_guess);
      }

      const header = isProjectedGuess ? ["Station", "Easting", "Northing"] : ["Station", "Longitude", "Latitude"];
      const rows: (string | number)[][] = beacons.map((b) => [b.station, b.x, b.y]);
      setRawFileData([header, ...rows]);
      setShowPreviewModal(true);

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
      if (problems.length > 0) {
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
          </>
        )}
      </div>

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
        onClose={() => setShowPreviewModal(false)}
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
    </div>
  );
}

export default memo(CoordinateInput);
