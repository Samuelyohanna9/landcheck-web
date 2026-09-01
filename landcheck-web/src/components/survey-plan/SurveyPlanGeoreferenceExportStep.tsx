import { memo, type ReactNode } from "react";
import type { GeoreferenceFeature, GeoreferenceSession } from "../../types/surveyGeoreference";
import { getCoordinateSystemLabel } from "../../utils/coordinateConverter";

type StakingPreviewRow = {
  station: string;
  feature: string;
  coordinateSystem: string;
  easting: number;
  northing: number;
  longitude: number;
  latitude: number;
};

const alphaStation = (index: number) => {
  let base = "";
  let value = Number(index);
  while (true) {
    base = String.fromCharCode(65 + (value % 26)) + base;
    value = Math.floor(value / 26) - 1;
    if (value < 0) break;
  }
  return base;
};

const formatCoordinateValue = (value: number, decimals: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "--";

type Props = {
  sidebar: ReactNode;
  session: GeoreferenceSession;
  features: GeoreferenceFeature[];
  downloadingCsv: boolean;
  continuing: boolean;
  onBack: () => void;
  onDownloadCsv: () => void | Promise<void>;
  onContinueToSurvey: () => void;
};

function SurveyPlanGeoreferenceExportStep({
  sidebar,
  session,
  features,
  downloadingCsv,
  continuing,
  onBack,
  onDownloadCsv,
  onContinueToSurvey,
}: Props) {
  const polygonCount = features.filter((feature) => feature.feature_type === "polygon").length;
  const pointCount = features.filter((feature) => feature.feature_type === "point").length;
  const lineCount = features.filter((feature) => feature.feature_type === "line").length;
  const primaryPolygon = features.find((feature) => feature.feature_type === "polygon" && feature.is_primary) || features.find((feature) => feature.feature_type === "polygon") || null;
  const readyCoordinateSystemKey =
    session.transform?.resolved_coordinate_system ||
    session.transform?.target_coordinate_system ||
    session.target_coordinate_system ||
    "wgs84";
  const readyCoordinateSystem = getCoordinateSystemLabel(readyCoordinateSystemKey);
  const stakingPreviewRows: StakingPreviewRow[] = (() => {
    if (primaryPolygon) {
      return primaryPolygon.target_coordinates
        .slice(0, primaryPolygon.pixels.length)
        .map((target, index) => {
          const wgs84 = primaryPolygon.wgs84_coordinates[index] || [0, 0];
          return {
            station: alphaStation(index),
            feature: primaryPolygon.label || "Primary parcel",
            coordinateSystem: readyCoordinateSystem,
            easting: Number(target[0]),
            northing: Number(target[1]),
            longitude: Number(wgs84[0]),
            latitude: Number(wgs84[1]),
          };
        });
    }
    return features
      .filter((feature) => feature.feature_type === "point")
      .map((feature, index) => {
        const target = feature.target_coordinates[0] || [0, 0];
        const wgs84 = feature.wgs84_coordinates[0] || [0, 0];
        return {
          station: `P${index + 1}`,
          feature: feature.label || `Stake point ${index + 1}`,
          coordinateSystem: readyCoordinateSystem,
          easting: Number(target[0]),
          northing: Number(target[1]),
          longitude: Number(wgs84[0]),
          latitude: Number(wgs84[1]),
        };
      });
  })();

  const savedFeatureCount = polygonCount + lineCount + pointCount;
  const hasExportableFeature = savedFeatureCount > 0;

  return (
    <div className="step-panel georef-step-panel georef-workspace-redesign export-panel">
      <div className="georef-workspace-grid">
        <aside className="geo-panel geo-panel-left">
          <div className="geo-left-scroll">
            {sidebar}
            <div className="geo-panel-heading">
              <h2>Review and export</h2>
              <p>Check the digitized coordinates, then download the staking file or continue to survey-plan production.</p>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Export summary</h3>
              <div className="geo-status-bar geo-status-bar--stacked">
                <span className="geo-status-item">
                  <em>Primary parcel</em>
                  <span>{primaryPolygon ? `${primaryPolygon.pixels.length} vertices` : "Not set"}</span>
                </span>
                <span className="geo-status-item">
                  <em>Stake points</em>
                  <span>{pointCount}</span>
                </span>
                <span className="geo-status-item">
                  <em>Alignments</em>
                  <span>{lineCount}</span>
                </span>
                <span className="geo-status-item">
                  <em>Coordinate system</em>
                  <span>{readyCoordinateSystem}</span>
                </span>
                <span className="geo-status-item">
                  <em>Saved features</em>
                  <span>{savedFeatureCount}</span>
                </span>
              </div>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Coordinate system</h3>
              <p className="geo-section-hint">
                {readyCoordinateSystem} - fixed by the solved transform from Control Points, ready for field
                setting-out.
              </p>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Validation</h3>
              <div className="georef-control-list">
                <div className="georef-point-row is-compact georef-validation-row">
                  <div className="georef-point-row-line1">
                    <strong>Primary parcel selected</strong>
                    <span className={`georef-point-status georef-point-status--${primaryPolygon ? "ready" : "pending"}`}>
                      {primaryPolygon ? "Ready" : "Needs input"}
                    </span>
                  </div>
                </div>
                <div className="georef-point-row is-compact georef-validation-row">
                  <div className="georef-point-row-line1">
                    <strong>At least one exportable feature</strong>
                    <span className={`georef-point-status georef-point-status--${hasExportableFeature ? "ready" : "pending"}`}>
                      {hasExportableFeature ? "Ready" : "Needs input"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="geo-section">
              <h3 className="geo-section-title">Export options</h3>
              <button
                type="button"
                className="geo-btn geo-btn-primary geo-btn-block"
                disabled={downloadingCsv || features.length === 0}
                onClick={onDownloadCsv}
              >
                {downloadingCsv ? "Preparing DGPS CSV..." : "Download DGPS CSV"}
              </button>
              <p className="geo-section-hint">CSV columns are ready for DGPS field use and office review.</p>

              <button
                type="button"
                className="geo-btn geo-btn-outline geo-btn-block"
                disabled={!primaryPolygon || continuing}
                onClick={onContinueToSurvey}
              >
                {continuing ? "Continuing..." : "Continue as Survey Plan"}
              </button>
              <p className="geo-section-hint">
                The primary parcel carries forward into the Survey Plan editor, already coordinate-drafted.
              </p>
            </div>
          </div>

          <div className="geo-left-footer">
            <button type="button" className="geo-btn geo-btn-outline" onClick={onBack} title="Back to Workspace">
              Back
            </button>
            <button
              type="button"
              className="geo-btn geo-btn-primary"
              disabled={!primaryPolygon || continuing}
              onClick={onContinueToSurvey}
              title={!primaryPolygon ? "Select a primary parcel before continuing." : undefined}
            >
              {continuing ? "Continuing..." : "Continue as Survey Plan"}
            </button>
          </div>
        </aside>

        <section className="geo-panel geo-panel-canvas">
          <div className="geo-panel-heading">
            <h2>DGPS sheet preview</h2>
            <p>Preview the first exported rows before download.</p>
          </div>
          <div className="geo-canvas-wrap geo-canvas-wrap--scroll">
            {stakingPreviewRows.length ? (
              <div className="georef-coordinate-table-wrap">
                <table className="georef-coordinate-table georef-export-table">
                  <thead>
                    <tr>
                      <th>Station</th>
                      <th>Feature</th>
                      <th>Easting</th>
                      <th>Northing</th>
                      <th>Longitude</th>
                      <th>Latitude</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stakingPreviewRows.slice(0, 8).map((row) => (
                      <tr key={`${row.station}-${row.feature}`}>
                        <td>{row.station}</td>
                        <td>{row.feature}</td>
                        <td>{formatCoordinateValue(row.easting, 4)}</td>
                        <td>{formatCoordinateValue(row.northing, 4)}</td>
                        <td>{formatCoordinateValue(row.longitude, 6)}</td>
                        <td>{formatCoordinateValue(row.latitude, 6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="georef-empty-stage">
                <strong>No staking rows available yet</strong>
                <span>Save at least one point or one parcel boundary before exporting the sheet.</span>
              </div>
            )}
          </div>
          <div className="geo-status-bar">
            <span className="geo-status-item">
              <em>Preview rows</em>
              <span>{stakingPreviewRows.length}</span>
            </span>
          </div>

          <div className="geo-section geo-section--handoff">
            <h3 className="geo-section-title">Survey handoff</h3>
            <ul className="georef-export-list">
              <li>The primary parcel becomes the working parcel boundary in Survey Plan.</li>
              <li>Each parcel vertex is already named and ready for coordinate-based drafting.</li>
              <li>Stake points remain available in the staking sheet for DGPS field setting out.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

export default memo(SurveyPlanGeoreferenceExportStep);
