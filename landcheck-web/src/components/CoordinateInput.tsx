import { useRef } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import "../styles/coordinate-input.css";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
};

type CoordinateSystem = {
  key: string;
  name: string;
  epsg: number;
  description: string;
};

type Props = {
  points: ManualPoint[];
  onUpdatePoint: (index: number, key: keyof ManualPoint, value: string | number) => void;
  onRemovePoint: (index: number) => void;
  onAddPoint: () => void;
  onBulkUpload: (points: ManualPoint[]) => void;
  disabled?: boolean;
  coordinateSystem: string;
  onCoordinateSystemChange: (system: string) => void;
};

const COORDINATE_SYSTEMS: CoordinateSystem[] = [
  { key: "wgs84", name: "WGS84 (Lat/Lon)", epsg: 4326, description: "Global GPS coordinates" },
  { key: "utm_31n", name: "UTM Zone 31N", epsg: 32631, description: "Western Nigeria" },
  { key: "utm_32n", name: "UTM Zone 32N", epsg: 32632, description: "Central Nigeria" },
  { key: "utm_33n", name: "UTM Zone 33N", epsg: 32633, description: "Eastern Nigeria" },
  { key: "minna_31", name: "Minna Datum Zone 31", epsg: 26331, description: "Nigerian Grid - West" },
  { key: "minna_32", name: "Minna Datum Zone 32", epsg: 26332, description: "Nigerian Grid - Central" },
  { key: "minna_33", name: "Minna Datum Zone 33", epsg: 26333, description: "Nigerian Grid - East" },
];

// Get example coordinates based on coordinate system (Nigerian examples)
const getPlaceholders = (system: string): { x: string; y: string } => {
  switch (system) {
    case "utm_31n":
      return { x: "e.g. 340250.45", y: "e.g. 998450.32" }; // Lagos area
    case "utm_32n":
      return { x: "e.g. 538120.78", y: "e.g. 1012340.56" }; // Abuja area
    case "utm_33n":
      return { x: "e.g. 285670.23", y: "e.g. 1245890.45" }; // Maiduguri area
    case "minna_31":
      return { x: "e.g. 340250.45", y: "e.g. 998450.32" }; // Lagos area (Minna)
    case "minna_32":
      return { x: "e.g. 538120.78", y: "e.g. 1012340.56" }; // Abuja area (Minna)
    case "minna_33":
      return { x: "e.g. 285670.23", y: "e.g. 1245890.45" }; // Maiduguri area (Minna)
    default:
      return { x: "e.g. 7.4951", y: "e.g. 9.0579" }; // WGS84
  }
};

// Generate station name: A, B, C, ... Z, AA, AB, ...
const getStationName = (index: number): string => {
  let name = "";
  let num = index;
  do {
    name = String.fromCharCode(65 + (num % 26)) + name;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);
  return name;
};

export default function CoordinateInput({
  points,
  onUpdatePoint,
  onRemovePoint,
  onAddPoint,
  onBulkUpload,
  disabled = false,
  coordinateSystem,
  onCoordinateSystemChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProjected = coordinateSystem !== "wgs84";
  const xLabel = isProjected ? "Easting (m)" : "Longitude";
  const yLabel = isProjected ? "Northing (m)" : "Latitude";
  const placeholders = getPlaceholders(coordinateSystem);
  const xPlaceholder = placeholders.x;
  const yPlaceholder = placeholders.y;

  // Parse uploaded file (CSV or Excel)
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
      // Parse CSV
      Papa.parse(file, {
        complete: (results) => {
          const parsedPoints = parseCoordinateData(results.data as string[][]);
          if (parsedPoints.length > 0) {
            onBulkUpload(parsedPoints);
          } else {
            alert("No valid coordinates found in file. Please check the format.");
          }
        },
        error: (error) => {
          alert(`Error parsing CSV: ${error.message}`);
        },
      });
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      // Parse Excel
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];

          const parsedPoints = parseCoordinateData(jsonData);
          if (parsedPoints.length > 0) {
            onBulkUpload(parsedPoints);
          } else {
            alert("No valid coordinates found in file. Please check the format.");
          }
        } catch (error) {
          alert(`Error parsing Excel file: ${error}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert("Please upload a CSV (.csv) or Excel (.xlsx, .xls) file");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Parse coordinate data from rows
  const parseCoordinateData = (rows: (string | number)[][]): ManualPoint[] => {
    const points: ManualPoint[] = [];

    // Try to detect column headers
    let stationCol = -1;
    let xCol = -1; // Easting or Longitude
    let yCol = -1; // Northing or Latitude

    // Check first row for headers
    const firstRow = rows[0]?.map(cell => String(cell).toLowerCase().trim()) || [];

    for (let i = 0; i < firstRow.length; i++) {
      const header = firstRow[i];
      if (header.includes("station") || header.includes("point") || header.includes("name") || header.includes("beacon")) {
        stationCol = i;
      } else if (header.includes("easting") || header.includes("lng") || header.includes("longitude") || header.includes("x") || header === "e") {
        xCol = i;
      } else if (header.includes("northing") || header.includes("lat") || header.includes("latitude") || header.includes("y") || header === "n") {
        yCol = i;
      }
    }

    // If no headers found, assume columns: Station, X/Easting, Y/Northing (or just X, Y)
    const startRow = (xCol >= 0 || yCol >= 0) ? 1 : 0;
    if (xCol < 0 && yCol < 0) {
      // Try to detect based on data
      const dataRow = rows[0];
      if (dataRow && dataRow.length >= 2) {
        if (dataRow.length === 2) {
          // Assume X, Y
          xCol = 0;
          yCol = 1;
        } else if (dataRow.length >= 3) {
          // Assume Station, X, Y
          const firstVal = parseFloat(String(dataRow[0]));
          if (isNaN(firstVal)) {
            // First column is text (station name)
            stationCol = 0;
            xCol = 1;
            yCol = 2;
          } else {
            // All numeric, assume X, Y, ...
            xCol = 0;
            yCol = 1;
          }
        }
      }
    }

    // Parse data rows
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const x = parseFloat(String(row[xCol >= 0 ? xCol : 0]));
      const y = parseFloat(String(row[yCol >= 0 ? yCol : 1]));

      if (isNaN(x) || isNaN(y)) continue;

      let station = "";
      if (stationCol >= 0 && row[stationCol]) {
        station = String(row[stationCol]).trim();
      } else {
        station = getStationName(points.length);
      }

      points.push({
        station,
        lng: x,
        lat: y,
      });
    }

    return points;
  };

  return (
    <div className="coord-input-container">
      <div className="coord-header">
        <h3 className="coord-title">Plot Coordinates</h3>
        <p className="coord-subtitle">Enter at least 3 boundary points or upload a file</p>
      </div>

      {/* Coordinate System Selector */}
      <div className="coord-system-selector">
        <label className="coord-system-label">Coordinate System:</label>
        <select
          value={coordinateSystem}
          onChange={(e) => onCoordinateSystemChange(e.target.value)}
          disabled={disabled}
          className="coord-system-select"
        >
          {COORDINATE_SYSTEMS.map((sys) => (
            <option key={sys.key} value={sys.key}>
              {sys.name}
            </option>
          ))}
        </select>
        <span className="coord-system-desc">
          {COORDINATE_SYSTEMS.find(s => s.key === coordinateSystem)?.description}
        </span>
      </div>

      {/* File Upload Section */}
      <div className="coord-upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={handleFileUpload}
          disabled={disabled}
          className="file-input-hidden"
          id="coord-file-upload"
        />
        <label htmlFor="coord-file-upload" className={`upload-btn ${disabled ? 'disabled' : ''}`}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          Upload CSV/Excel
        </label>
        <span className="upload-hint">
          Format: Station, Easting, Northing (or just Easting, Northing)
        </span>
      </div>

      <div className="coord-table-wrapper">
        <table className="coord-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-station">Station</th>
              <th className="col-coord">{xLabel}</th>
              <th className="col-coord">{yLabel}</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={index} className={disabled ? "disabled" : ""}>
                <td className="col-num">
                  <span className="row-number">{index + 1}</span>
                </td>
                <td className="col-station">
                  <input
                    type="text"
                    value={point.station}
                    onChange={(e) => onUpdatePoint(index, "station", e.target.value)}
                    placeholder="A"
                    disabled={disabled}
                    className="station-input"
                  />
                </td>
                <td className="col-coord">
                  <input
                    type="number"
                    step="any"
                    value={point.lng || ""}
                    onChange={(e) => onUpdatePoint(index, "lng", parseFloat(e.target.value) || 0)}
                    placeholder={xPlaceholder}
                    disabled={disabled}
                    className="coord-input"
                  />
                </td>
                <td className="col-coord">
                  <input
                    type="number"
                    step="any"
                    value={point.lat || ""}
                    onChange={(e) => onUpdatePoint(index, "lat", parseFloat(e.target.value) || 0)}
                    placeholder={yPlaceholder}
                    disabled={disabled}
                    className="coord-input"
                  />
                </td>
                <td className="col-action">
                  <button
                    type="button"
                    onClick={() => onRemovePoint(index)}
                    disabled={disabled || points.length <= 3}
                    className="remove-btn"
                    title="Remove point"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="coord-footer">
        <button
          type="button"
          onClick={onAddPoint}
          disabled={disabled}
          className="add-point-btn"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Point
        </button>
        <span className="coord-tip">
          {isProjected
            ? "Coordinates will be converted to WGS84 for processing"
            : "Ring will auto-close on creation"
          }
        </span>
      </div>
    </div>
  );
}
