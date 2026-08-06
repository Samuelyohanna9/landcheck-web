import { memo, type ReactNode } from "react";
import type { GeoreferenceFeature, GeoreferenceSession } from "../../types/surveyGeoreference";

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

  return (
    <div className="step-panel georef-step-panel export-panel">
      <div className="panel-left georef-sidebar-column">
        {sidebar}
        <section className="georef-control-card">
          <div className="georef-control-head">
            <div>
              <span className="georef-kicker">Export & Continue</span>
              <h3>Use the georeferenced work in Survey Plan and DGPS workflows</h3>
              <p>
                Download the DGPS CSV if needed, then continue straight into Survey Plan. Once you continue,
                the temporary raster session is released from storage, with timed cleanup still running as a
                fallback.
              </p>
            </div>
            <div className="georef-quality-pill">{session.transform?.target_coordinate_system?.toUpperCase()} ready</div>
          </div>

          <div className="georef-stat-grid">
            <article className="georef-stat-card">
              <span className="georef-stat-label">Primary parcel</span>
              <strong>{primaryPolygon ? `${primaryPolygon.pixels.length} vertices` : "Not set"}</strong>
              <small>{primaryPolygon?.label || "Choose a primary polygon in the workspace"}</small>
            </article>
            <article className="georef-stat-card">
              <span className="georef-stat-label">Stake points</span>
              <strong>{pointCount}</strong>
              <small>CSV export will include these or the primary polygon vertices</small>
            </article>
            <article className="georef-stat-card">
              <span className="georef-stat-label">Saved session</span>
              <strong>{session.status}</strong>
              <small>{session.delete_after_at ? `Auto cleanup: ${new Date(session.delete_after_at).toLocaleDateString()}` : "Retention not set"}</small>
            </article>
          </div>

          <div className="georef-export-checklist">
            <article>
              <strong>{polygonCount}</strong>
              <span>polygon layer(s)</span>
            </article>
            <article>
              <strong>{lineCount}</strong>
              <span>line layer(s)</span>
            </article>
            <article>
              <strong>{pointCount}</strong>
              <span>point layer(s)</span>
            </article>
          </div>

          <div className="georef-actions-row">
            <button type="button" className="btn-outline" onClick={onBack}>
              Back to Workspace
            </button>
            <button type="button" className="btn-primary" disabled={downloadingCsv || features.length === 0} onClick={onDownloadCsv}>
              {downloadingCsv ? "Preparing CSV..." : "Download DGPS CSV"}
            </button>
            <button type="button" className="btn-secondary" disabled={!primaryPolygon || continuing} onClick={onContinueToSurvey}>
              {continuing ? "Continuing..." : "Continue as Survey Plan"}
            </button>
          </div>
        </section>
      </div>

      <div className="panel-right georef-export-summary">
        <section className="georef-export-card">
          <h4>What happens next</h4>
          <ul className="georef-export-list">
            <li>The primary polygon becomes the parcel boundary in Survey Plan.</li>
            <li>Station names are generated from the digitized polygon vertices.</li>
            <li>Stake points stay available in the CSV for DGPS setting out.</li>
            <li>The uploaded raster is released from R2 when you continue, with retention cleanup still protecting storage.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export default memo(SurveyPlanGeoreferenceExportStep);
