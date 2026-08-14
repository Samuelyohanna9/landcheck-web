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

  return (
    <div className="step-panel georef-step-panel export-panel">
      <div className="panel-left georef-sidebar-column">
        {sidebar}
        <section className="georef-control-card">
          <div className="georef-control-head">
              <div>
                <span className="georef-kicker">Export & Continue</span>
                <h3>Finish the staking sheet and continue into Survey Plan</h3>
                <p>Review the parcel package, download the DGPS-ready sheet, then continue drafting.</p>
              </div>
            <div className="georef-quality-pill">{readyCoordinateSystem} ready</div>
          </div>

          <div className="georef-stat-grid">
            <article className="georef-stat-card">
              <span className="georef-stat-label">Primary parcel</span>
              <strong>{primaryPolygon ? `${primaryPolygon.pixels.length} vertices` : "Not set"}</strong>
              <small>{primaryPolygon?.label || "Select one boundary as the parcel to continue"}</small>
            </article>
            <article className="georef-stat-card">
              <span className="georef-stat-label">Stake points</span>
              <strong>{pointCount}</strong>
              <small>The staking sheet will export these or the parcel vertices automatically</small>
            </article>
              <article className="georef-stat-card">
                <span className="georef-stat-label">Working grid</span>
                <strong>{readyCoordinateSystem}</strong>
                <small>Coordinate values are ready for field setting-out and editor continuation</small>
              </article>
              <article className="georef-stat-card">
                <span className="georef-stat-label">Saved features</span>
                <strong>{polygonCount + lineCount + pointCount}</strong>
                <small>{polygonCount} boundary, {lineCount} line, {pointCount} point layer(s)</small>
              </article>
          </div>

          <div className="georef-export-checklist">
              <article>
                <strong>Excel-ready</strong>
                <span>CSV columns open cleanly for DGPS use and office review.</span>
              </article>
              <article>
                <strong>Editor ready</strong>
                <span>The primary parcel continues directly into the Survey Plan editor.</span>
              </article>
              <article>
                <strong>Field ready</strong>
                <span>Coordinate rows are already structured for staking and checking on site.</span>
              </article>
          </div>

          <div className="georef-actions-row">
            <button type="button" className="btn-outline" onClick={onBack}>
              Back to Workspace
            </button>
              <button type="button" className="btn-primary" disabled={downloadingCsv || features.length === 0} onClick={onDownloadCsv}>
                {downloadingCsv ? "Preparing DGPS CSV..." : "Download DGPS CSV"}
              </button>
              <button type="button" className="btn-secondary" disabled={!primaryPolygon || continuing} onClick={onContinueToSurvey}>
                {continuing ? "Continuing..." : "Continue as Survey Plan"}
            </button>
          </div>
        </section>
      </div>

      <div className="panel-right georef-export-summary">
        <section className="georef-export-card">
          <div className="georef-card-head">
              <div>
                <h4>DGPS sheet preview</h4>
                <span>Preview the first exported rows before download.</span>
              </div>
              <span className="georef-quality-pill">{stakingPreviewRows.length} row(s)</span>
            </div>
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
            <div className="georef-empty-list">
              <strong>No staking rows available yet</strong>
              <span>Save at least one point or one parcel boundary before exporting the sheet.</span>
            </div>
          )}
        </section>
        <section className="georef-export-card">
          <div className="georef-card-head">
              <div>
                <h4>Survey handoff</h4>
                <span>What moves forward into the drafting stage.</span>
              </div>
            </div>
            <ul className="georef-export-list">
              <li>The primary parcel becomes the working parcel boundary in Survey Plan.</li>
              <li>Each parcel vertex is already named and ready for coordinate-based drafting.</li>
              <li>Stake points remain available in the staking sheet for DGPS field setting out.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export default memo(SurveyPlanGeoreferenceExportStep);
