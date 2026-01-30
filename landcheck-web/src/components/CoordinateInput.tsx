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

export default function CoordinateInput({
  points,
  onUpdatePoint,
  onRemovePoint,
  onAddPoint,
  disabled = false,
  coordinateSystem,
  onCoordinateSystemChange,
}: Props) {
  const isProjected = coordinateSystem !== "wgs84";
  const xLabel = isProjected ? "Easting (m)" : "Longitude";
  const yLabel = isProjected ? "Northing (m)" : "Latitude";
  const placeholders = getPlaceholders(coordinateSystem);
  const xPlaceholder = placeholders.x;
  const yPlaceholder = placeholders.y;

  return (
    <div className="coord-input-container">
      <div className="coord-header">
        <h3 className="coord-title">Plot Coordinates</h3>
        <p className="coord-subtitle">Enter at least 3 boundary points</p>
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
