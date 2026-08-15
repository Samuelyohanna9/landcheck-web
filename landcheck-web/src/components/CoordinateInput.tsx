import { memo, useMemo, useRef, useState } from "react";
import "../styles/coordinate-input.css";
import CSVPreviewModal from "./CSVPreviewModal";
import {
  getCoordinateSystemEpsgLabel,
  isProjectedCoordinateSystem,
  WGS84_NIGERIA_METERS,
} from "../utils/coordinateConverter";

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
};

const COORDINATE_SYSTEMS: CoordinateSystem[] = [
  { key: "wgs84", name: "WGS84 (Lat/Lon)", epsgLabel: "EPSG:4326", description: "Global GPS coordinates" },
  {
    key: WGS84_NIGERIA_METERS,
    name: "WGS84 Nigeria Metres",
    epsgLabel: "EPSG:32631/32632/32633",
    description: "Auto-UTM metres for Nigeria. Best for map-picked or georeferenced jobs.",
  },
  { key: "utm_31n", name: "UTM Zone 31N", epsgLabel: "EPSG:32631", description: "Western Nigeria" },
  { key: "utm_32n", name: "UTM Zone 32N", epsgLabel: "EPSG:32632", description: "Central Nigeria" },
  { key: "utm_33n", name: "UTM Zone 33N", epsgLabel: "EPSG:32633", description: "Eastern Nigeria" },
  { key: "minna_31", name: "Minna Datum Zone 31", epsgLabel: "EPSG:26331", description: "Nigerian Grid - West" },
  { key: "minna_32", name: "Minna Datum Zone 32", epsgLabel: "EPSG:26332", description: "Nigerian Grid - Central" },
  { key: "minna_33", name: "Minna Datum Zone 33", epsgLabel: "EPSG:26333", description: "Nigerian Grid - East" },
];

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
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [rawFileData, setRawFileData] = useState<(string | number)[][]>([]);
  const [uploadParsing, setUploadParsing] = useState(false);
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

  return (
    <div className="coord-input-container">
      <div className="coord-header">
        <h3 className="coord-title">Boundary Coordinates</h3>
        <p className="coord-subtitle">Add parcel points directly or import a prepared sheet.</p>
      </div>

      <div className="coord-system-selector">
        <label className="coord-system-label" htmlFor="coord-system-select">
          Coordinate System
        </label>
        <div className="coord-system-field">
          <select
            id="coord-system-select"
            className="coord-system-select"
            value={coordinateSystem}
            onChange={(event) => onCoordinateSystemChange(event.target.value)}
            disabled={disabled}
            aria-describedby="coord-system-help"
          >
            {COORDINATE_SYSTEMS.map((sys) => (
              <option key={sys.key} value={sys.key}>
                {sys.name}
              </option>
            ))}
          </select>
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
    </div>
  );
}

export default memo(CoordinateInput);
