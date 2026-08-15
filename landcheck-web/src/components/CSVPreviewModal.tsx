import { useState, useEffect } from "react";
import { getCoordinateSystemLabel, isProjectedCoordinateSystem } from "../utils/coordinateConverter";
import "../styles/csv-preview-modal.css";

type ManualPoint = {
  station: string;
  lng: number;
  lat: number;
  height?: number;
  is_boundary?: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  rawData: (string | number)[][];
  onConfirm: (points: ManualPoint[]) => void;
  coordinateSystem: string;
};

// Coordinate system ranges for validation
const COORDINATE_RANGES: Record<string, { x: [number, number]; y: [number, number] }> = {
  wgs84: { x: [-180, 180], y: [-90, 90] },
  wgs84_nigeria_meters: { x: [100000, 900000], y: [0, 10000000] },
  utm_31n: { x: [100000, 900000], y: [0, 10000000] },
  utm_32n: { x: [100000, 900000], y: [0, 10000000] },
  utm_33n: { x: [100000, 900000], y: [0, 10000000] },
  minna_31: { x: [100000, 900000], y: [0, 10000000] },
  minna_32: { x: [100000, 900000], y: [0, 10000000] },
  minna_33: { x: [100000, 900000], y: [0, 10000000] },
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

export default function CSVPreviewModal({
  isOpen,
  onClose,
  rawData,
  onConfirm,
  coordinateSystem,
}: Props) {
  const [stationCol, setStationCol] = useState<number | null>(null);
  const [eastingCol, setEastingCol] = useState<number | null>(null);
  const [northingCol, setNorthingCol] = useState<number | null>(null);
  const [heightCol, setHeightCol] = useState<number | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "mapping" = choose which columns are station/easting/northing/height (as before).
  // "boundary" = a second step, only needed when there's more than one point set worth marking:
  // every uploaded point counts as a spot-height sample either way, but only the ones checked
  // here become the plan's boundary ring - lets a surveyor upload one combined job file (boundary
  // corners + interior spot heights) instead of losing the extra elevation points to get a clean
  // boundary, or re-uploading the same file twice.
  const [step, setStep] = useState<"mapping" | "boundary">("mapping");
  const [parsedPoints, setParsedPoints] = useState<ManualPoint[]>([]);

  // Auto-detect columns when data changes
  useEffect(() => {
    if (!rawData || rawData.length === 0) return;

    const firstRow = rawData[0]?.map((cell) => String(cell).toLowerCase().trim()) || [];
    let detectedStation = -1;
    let detectedEasting = -1;
    let detectedNorthing = -1;
    let detectedHeight = -1;
    let headerDetected = false;

    // Try to detect headers
    for (let i = 0; i < firstRow.length; i++) {
      const header = firstRow[i];
      if (
        header.includes("station") ||
        header.includes("point") ||
        header.includes("name") ||
        header.includes("beacon")
      ) {
        detectedStation = i;
        headerDetected = true;
      } else if (
        header.includes("easting") ||
        header.includes("lng") ||
        header.includes("longitude") ||
        header === "x" ||
        header === "e"
      ) {
        detectedEasting = i;
        headerDetected = true;
      } else if (
        header.includes("northing") ||
        header.includes("lat") ||
        header.includes("latitude") ||
        header === "y" ||
        header === "n"
      ) {
        detectedNorthing = i;
        headerDetected = true;
      } else if (
        header.includes("height") ||
        header.includes("elevation") ||
        header.includes("altitude") ||
        header.includes("elev") ||
        header === "z" ||
        header === "h" ||
        header.includes("rl") ||
        header.includes("level")
      ) {
        detectedHeight = i;
        headerDetected = true;
      }
    }

    // If no headers detected, try to guess from data
    if (!headerDetected && rawData.length > 0) {
      const numCols = rawData[0]?.length || 0;
      if (numCols === 2) {
        // Assume Easting, Northing
        detectedEasting = 0;
        detectedNorthing = 1;
      } else if (numCols >= 3) {
        // Check if first column is numeric
        const firstVal = parseFloat(String(rawData[0][0]));
        if (isNaN(firstVal)) {
          // First column is text (station name)
          detectedStation = 0;
          detectedEasting = 1;
          detectedNorthing = 2;
        } else {
          // All numeric, assume Easting, Northing
          detectedEasting = 0;
          detectedNorthing = 1;
        }
      }
    }

    setHasHeader(headerDetected);
    setStationCol(detectedStation >= 0 ? detectedStation : null);
    setEastingCol(detectedEasting >= 0 ? detectedEasting : null);
    setNorthingCol(detectedNorthing >= 0 ? detectedNorthing : null);
    setHeightCol(detectedHeight >= 0 ? detectedHeight : null);
    setError(null);
    setStep("mapping");
    setParsedPoints([]);
  }, [rawData]);

  if (!isOpen || !rawData || rawData.length === 0) return null;

  const columns = rawData[0]?.length || 0;
  const previewRows = rawData.slice(0, Math.min(6, rawData.length));

  // Once points are parsed and validated, either hand off straight to the parent (no height
  // column selected - nothing to distinguish, every row stays a boundary point exactly as
  // before) or show the boundary-marking step so the user can flag which rows are boundary
  // corners vs. spot-height-only samples, since every row counts as a spot height either way.
  const proceedWithPoints = (pts: ManualPoint[]) => {
    const withDefaults = pts.map((p) => ({ ...p, is_boundary: true }));
    if (heightCol !== null) {
      setParsedPoints(withDefaults);
      setStep("boundary");
    } else {
      onConfirm(withDefaults);
      onClose();
    }
  };

  // Validate and parse data
  const handleConfirm = () => {
    if (eastingCol === null || northingCol === null) {
      setError("Please select Easting and Northing columns");
      return;
    }

    const startRow = hasHeader ? 1 : 0;
    const points: ManualPoint[] = [];
    const ranges = COORDINATE_RANGES[coordinateSystem] || COORDINATE_RANGES.wgs84;

    let invalidCount = 0;
    let outOfRangeCount = 0;

    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length < 2) continue;

      const easting = parseFloat(String(row[eastingCol]));
      const northing = parseFloat(String(row[northingCol]));

      if (isNaN(easting) || isNaN(northing)) {
        invalidCount++;
        continue;
      }

      // Check if coordinates are within expected range
      if (
        easting < ranges.x[0] ||
        easting > ranges.x[1] ||
        northing < ranges.y[0] ||
        northing > ranges.y[1]
      ) {
        outOfRangeCount++;
      }

      let station = "";
      if (stationCol !== null && row[stationCol]) {
        station = String(row[stationCol]).trim();
      } else {
        station = getStationName(points.length);
      }

      // Parse height if column is selected
      let height: number | undefined = undefined;
      if (heightCol !== null && row[heightCol] !== undefined) {
        const parsedHeight = parseFloat(String(row[heightCol]));
        if (!isNaN(parsedHeight)) {
          height = parsedHeight;
        }
      }

      points.push({
        station,
        lng: easting,
        lat: northing,
        height,
      });
    }

    if (points.length < 3) {
      setError("Need at least 3 valid coordinate points");
      return;
    }

    // Warn about out of range coordinates
    if (outOfRangeCount > points.length / 2) {
      const systemName = getCoordinateSystemLabel(coordinateSystem);
      setError(
        `Warning: ${outOfRangeCount} of ${points.length} coordinates appear to be outside the expected range for ${systemName}. Please verify you selected the correct coordinate system.`
      );
      // Still allow confirmation after warning
      setTimeout(() => {
        proceedWithPoints(points);
      }, 3000);
      return;
    }

    proceedWithPoints(points);
  };

  const handleBoundaryToggle = (index: number, checked: boolean) => {
    setParsedPoints((prev) => prev.map((p, i) => (i === index ? { ...p, is_boundary: checked } : p)));
  };

  const boundarySelectAll = () => setParsedPoints((prev) => prev.map((p) => ({ ...p, is_boundary: true })));
  const boundaryClearAll = () => setParsedPoints((prev) => prev.map((p) => ({ ...p, is_boundary: false })));

  const handleBoundaryConfirm = () => {
    const boundaryCount = parsedPoints.filter((p) => p.is_boundary).length;
    if (boundaryCount < 3) {
      setError("Select at least 3 boundary points to form the plot boundary.");
      return;
    }
    onConfirm(parsedPoints);
    onClose();
  };

  const getColumnOptions = () => {
    const options = [];
    for (let i = 0; i < columns; i++) {
      const headerName = hasHeader ? String(rawData[0][i]) : `Column ${i + 1}`;
      options.push(
        <option key={i} value={i}>
          {headerName}
        </option>
      );
    }
    return options;
  };

  const isProjected = isProjectedCoordinateSystem(coordinateSystem);
  const boundaryMarkedCount = parsedPoints.filter((p) => p.is_boundary).length;

  return (
    <div className="csv-modal-overlay" onClick={onClose}>
      <div className="csv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="csv-modal-header">
          <h3>{step === "mapping" ? "CSV Preview - Map Columns" : "Mark Boundary Points"}</h3>
          <button className="csv-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {step === "boundary" ? (
          <>
            <div className="csv-modal-body">
              <p className="csv-boundary-intro">
                Every point below is used as a spot-height sample for the topo map. Check which ones also
                form your plot boundary - leave everything checked if every row is a boundary corner.
              </p>
              <div className="csv-boundary-actions">
                <button type="button" className="csv-boundary-action-btn" onClick={boundarySelectAll}>
                  Select all
                </button>
                <button type="button" className="csv-boundary-action-btn" onClick={boundaryClearAll}>
                  Clear all
                </button>
                <span className="csv-boundary-count">
                  {boundaryMarkedCount} of {parsedPoints.length} marked as boundary
                </span>
              </div>

              <div className="csv-preview-table-wrapper csv-boundary-table-wrapper">
                <table className="csv-preview-table">
                  <thead>
                    <tr>
                      <th className="row-num">#</th>
                      <th>Station</th>
                      <th>{isProjected ? "Easting (m)" : "Longitude"}</th>
                      <th>{isProjected ? "Northing (m)" : "Latitude"}</th>
                      <th>Height</th>
                      <th>Boundary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedPoints.map((p, idx) => (
                      <tr key={idx} className={p.is_boundary ? "" : "spot-only-row"}>
                        <td className="row-num">{idx + 1}</td>
                        <td>{p.station}</td>
                        <td>{p.lng}</td>
                        <td>{p.lat}</td>
                        <td>{p.height ?? "—"}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!p.is_boundary}
                            onChange={(e) => handleBoundaryToggle(idx, e.target.checked)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && <div className="csv-error">{error}</div>}
            </div>

            <div className="csv-modal-footer">
              <button className="csv-btn-cancel" onClick={() => setStep("mapping")}>
                Back
              </button>
              <button className="csv-btn-confirm" onClick={handleBoundaryConfirm}>
                Use These {parsedPoints.length} Points
              </button>
            </div>
          </>
        ) : (
        <>
        <div className="csv-modal-body">
          {/* Column Mapping */}
          <div className="column-mapping">
            <div className="mapping-row">
              <label>
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                />
                First row is header
              </label>
            </div>

            <div className="mapping-selectors">
              <div className="mapping-select">
                <label>Station Name (optional)</label>
                <select
                  value={stationCol ?? ""}
                  onChange={(e) =>
                    setStationCol(e.target.value === "" ? null : parseInt(e.target.value))
                  }
                >
                  <option value="">-- Auto Generate --</option>
                  {getColumnOptions()}
                </select>
              </div>

              <div className="mapping-select">
                <label>
                  Easting / Longitude <span className="required">*</span>
                </label>
                <select
                  value={eastingCol ?? ""}
                  onChange={(e) =>
                    setEastingCol(e.target.value === "" ? null : parseInt(e.target.value))
                  }
                  className={eastingCol === null ? "error" : ""}
                >
                  <option value="">-- Select Column --</option>
                  {getColumnOptions()}
                </select>
              </div>

              <div className="mapping-select">
                <label>
                  Northing / Latitude <span className="required">*</span>
                </label>
                <select
                  value={northingCol ?? ""}
                  onChange={(e) =>
                    setNorthingCol(e.target.value === "" ? null : parseInt(e.target.value))
                  }
                  className={northingCol === null ? "error" : ""}
                >
                  <option value="">-- Select Column --</option>
                  {getColumnOptions()}
                </select>
              </div>

              <div className="mapping-select">
                <label>
                  Height / Elevation (optional)
                  {heightCol !== null && <span className="height-badge">🗺️ Topo</span>}
                </label>
                <select
                  value={heightCol ?? ""}
                  onChange={(e) =>
                    setHeightCol(e.target.value === "" ? null : parseInt(e.target.value))
                  }
                >
                  <option value="">-- None --</option>
                  {getColumnOptions()}
                </select>
              </div>
            </div>
          </div>

          {/* Height data info message */}
          {heightCol !== null && (
            <div className="csv-info height-info">
              <span className="info-icon">🗺️</span>
              Height/elevation data detected! Topo map visualization will be available.
            </div>
          )}

          {/* Data Preview Table */}
          <div className="csv-preview-table-wrapper">
            <table className="csv-preview-table">
              <thead>
                <tr>
                  <th className="row-num">#</th>
                  {Array.from({ length: columns }).map((_, i) => (
                    <th
                      key={i}
                      className={
                        i === stationCol
                          ? "col-station"
                          : i === eastingCol
                          ? "col-easting"
                          : i === northingCol
                          ? "col-northing"
                          : i === heightCol
                          ? "col-height"
                          : ""
                      }
                    >
                      {hasHeader ? String(rawData[0][i]) : `Col ${i + 1}`}
                      {i === stationCol && <span className="col-tag station">Station</span>}
                      {i === eastingCol && <span className="col-tag easting">Easting</span>}
                      {i === northingCol && <span className="col-tag northing">Northing</span>}
                      {i === heightCol && <span className="col-tag height">Height</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(hasHeader ? 1 : 0).map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="row-num">{rowIdx + 1}</td>
                    {row.map((cell, colIdx) => (
                      <td
                        key={colIdx}
                        className={
                          colIdx === stationCol
                            ? "col-station"
                            : colIdx === eastingCol
                            ? "col-easting"
                            : colIdx === northingCol
                            ? "col-northing"
                            : colIdx === heightCol
                            ? "col-height"
                            : ""
                        }
                      >
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rawData.length > 6 && (
            <p className="csv-more-rows">
              ... and {rawData.length - (hasHeader ? 6 : 5)} more rows
            </p>
          )}

          {error && <div className="csv-error">{error}</div>}
        </div>

        <div className="csv-modal-footer">
          <button className="csv-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="csv-btn-confirm"
            onClick={handleConfirm}
            disabled={eastingCol === null || northingCol === null}
          >
            Import {rawData.length - (hasHeader ? 1 : 0)} Points
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
