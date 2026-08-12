import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import SocialLinks from "../components/SocialLinks";
import {
  prefetchSurveyPlanPreviewStep,
  prefetchSurveyPlanRoute,
  scheduleSurveyPlanIdlePrefetch,
} from "../utils/surveyPlanPrefetch";
import "../styles/survey-plan-landing.css";

type PreviewMode = {
  id: "survey" | "georeference" | "subdivision";
  title: string;
  summary: string;
  strap: string;
  metrics: Array<{ label: string; value: string }>;
};

const heroTerms = ["Survey plan", "Georeference", "Plot subdivision"];

const previewModes: PreviewMode[] = [
  {
    id: "survey",
    title: "Survey plan",
    summary: "Coordinate to sheet.",
    strap: "Parcel preview",
    metrics: [
      { label: "Paper", value: "A1 / A3" },
      { label: "Boundary", value: "Ready" },
      { label: "Export", value: "PDF" },
    ],
  },
  {
    id: "georeference",
    title: "Georeference",
    summary: "Control to raster.",
    strap: "Anchored image",
    metrics: [
      { label: "GCPs", value: "3+" },
      { label: "Output", value: "CSV" },
      { label: "Stage", value: "Digitize" },
    ],
  },
  {
    id: "subdivision",
    title: "Plot subdivision",
    summary: "Parent to lots.",
    strap: "Lot allocation",
    metrics: [
      { label: "Split", value: "Count / Area" },
      { label: "Balance", value: "Checked" },
      { label: "Export", value: "Batch" },
    ],
  },
];

const coreCapabilities = [
  { title: "Coordinate intake", detail: "Manual or sheet import." },
  { title: "CAD editor", detail: "Roads, buildings, fences." },
  { title: "Georeference", detail: "Raster control and digitize." },
  { title: "Subdivision", detail: "Count, area, fraction." },
  { title: "Exports", detail: "PDF, CSV, DXF, DWG." },
];

const productionRoutes = [
  {
    title: "Survey Plan",
    detail: "Formal parcel drafting.",
    action: "Open drafting workspace",
  },
  {
    title: "Georeference",
    detail: "Scanned plan recovery.",
    action: "Open raster workspace",
  },
  {
    title: "Subdivision",
    detail: "Batch lot production.",
    action: "Open subdivision workspace",
  },
];

const exportOutputs = ["Plan PDF", "Orthophoto PDF", "Computation sheet", "Stakeout CSV", "DXF", "DWG"];

const computationPreviewRows = [
  { station: "A-B", bearing: "46°18'20\"", distance: "43.82 m" },
  { station: "B-C", bearing: "153°47'31\"", distance: "52.67 m" },
  { station: "C-D", bearing: "262°11'08\"", distance: "48.09 m" },
  { station: "D-A", bearing: "332°05'42\"", distance: "39.41 m" },
];

const subdivisionPreviewRows = [
  { lot: "Lot A", area: "701 sqm", status: "Issued" },
  { lot: "Lot B", area: "684 sqm", status: "Reviewed" },
  { lot: "Lot C", area: "712 sqm", status: "Issued" },
  { lot: "Lot D", area: "689 sqm", status: "Ready" },
];

function SurveyPreviewScene({ mode }: { mode: PreviewMode }) {
  if (mode.id === "survey") {
    return (
      <div className="spl-scene spl-scene--survey">
        <div className="spl-scene-top">
          <span>Plan sheet preview</span>
          <span>Back computation sheet</span>
        </div>
        <div className="spl-deliverable-grid spl-deliverable-grid--survey">
          <figure className="spl-output-preview spl-output-preview--plan">
            <img src="/survey-preview-plan.png" alt="Preview of plotted survey plan output" loading="lazy" />
            <figcaption>Plotted plan preview</figcaption>
          </figure>
          <div className="spl-output-stack">
            <article className="spl-document-sheet">
              <header>
                <span>Back computation</span>
                <strong>Traverse ready</strong>
              </header>
              <div className="spl-computation-table">
                {computationPreviewRows.map((row) => (
                  <div key={row.station} className="spl-computation-row">
                    <span>{row.station}</span>
                    <span>{row.bearing}</span>
                    <strong>{row.distance}</strong>
                  </div>
                ))}
              </div>
            </article>
            <div className="spl-scene-sidebar">
              {mode.metrics.map((metric) => (
                <div key={metric.label} className="spl-scene-metric">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode.id === "georeference") {
    return (
      <div className="spl-scene spl-scene--georeference">
        <div className="spl-scene-top">
          <span>Anchored image</span>
          <span>Ground map pairing</span>
        </div>
        <div className="spl-scene-split spl-scene-split--imagery">
          <figure className="spl-output-preview spl-output-preview--raster">
            <img src="/survey-preview-plan.png" alt="Anchored raster control image preview" loading="lazy" />
            <figcaption>Raster control</figcaption>
          </figure>
          <figure className="spl-output-preview spl-output-preview--orthophoto">
            <img src="/survey-preview-orthophoto.png" alt="Orthophoto and parcel proof preview" loading="lazy" />
            <figcaption>Georeferenced map proof</figcaption>
          </figure>
        </div>
        <div className="spl-scene-foot-metrics">
          {mode.metrics.map((metric) => (
            <div key={metric.label} className="spl-foot-metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="spl-scene spl-scene--subdivision">
      <div className="spl-scene-top">
        <span>Subdivision preview</span>
        <span>Allocation schedule</span>
      </div>
      <div className="spl-deliverable-grid spl-deliverable-grid--subdivision">
        <figure className="spl-output-preview spl-output-preview--plan">
          <img src="/survey-preview-plan.png" alt="Subdivision and plan-sheet preview" loading="lazy" />
          <figcaption>Subdivision plan sheet</figcaption>
        </figure>
        <div className="spl-output-stack">
          <article className="spl-document-sheet spl-document-sheet--lots">
            <header>
              <span>Lot schedule</span>
              <strong>Balanced</strong>
            </header>
            <div className="spl-lot-table">
              {subdivisionPreviewRows.map((row) => (
                <div key={row.lot} className="spl-lot-row">
                  <span>{row.lot}</span>
                  <span>{row.area}</span>
                  <strong>{row.status}</strong>
                </div>
              ))}
            </div>
          </article>
          <div className="spl-scene-sidebar">
            {mode.metrics.map((metric) => (
              <div key={metric.label} className="spl-scene-metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="spl-scene-foot-metrics">
        <div className="spl-foot-metric">
          <span>Primary parcel</span>
          <strong>4 sides</strong>
        </div>
        <div className="spl-foot-metric">
          <span>Split basis</span>
          <strong>Area / count</strong>
        </div>
        <div className="spl-foot-metric">
          <span>Deliverable</span>
          <strong>Batch export</strong>
        </div>
      </div>
    </div>
  );
}

export default function SurveyPlanLanding() {
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState(0);

  useEffect(() => {
    scheduleSurveyPlanIdlePrefetch();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePanel((current) => (current + 1) % previewModes.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  const warmSurveyEntry = () => {
    void prefetchSurveyPlanRoute();
    void prefetchSurveyPlanPreviewStep();
  };

  const openSurvey = () => {
    warmSurveyEntry();
    navigate("/survey-plan");
  };

  const activePreview = previewModes[activePanel];

  return (
    <div className="spl-page">
      <NavBar fixed overlay activeRoute="/survey" ctaLabel="Open Survey Plan" ctaRoute="/survey-plan" />

      <main>
        <section className="spl-hero">
          <div className="spl-hero-overlay" />
          <div className="spl-shell spl-hero-shell">
            <div className="spl-hero-copy">
              <span className="spl-kicker">LandCheck Survey Studio</span>
              <h1>Survey plan. Georeference. Plot subdivision.</h1>
              <p>One browser workspace for parcel production.</p>
              <div className="spl-hero-actions">
                <button
                  type="button"
                  className="spl-btn-primary"
                  onMouseEnter={warmSurveyEntry}
                  onFocus={warmSurveyEntry}
                  onClick={openSurvey}
                >
                  Open Survey Plan
                </button>
                <a className="spl-btn-secondary" href="#survey-capabilities">
                  View Features
                </a>
              </div>
              <div className="spl-hero-terms" aria-label="Survey capabilities">
                {heroTerms.map((term) => (
                  <span key={term} className="spl-hero-term">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="spl-device-band">
          <div className="spl-shell">
            <div className="spl-device-shell">
              <div className="spl-device-copy">
                <span className="spl-section-kicker">Live preview</span>
                <h2>{activePreview.title}</h2>
                <p>{activePreview.summary}</p>
                <div className="spl-device-labels" aria-hidden="true">
                  {previewModes.map((mode, index) => (
                    <span
                      key={mode.id}
                      className={`spl-device-label${index === activePanel ? " is-active" : ""}`}
                    >
                      {mode.title}
                    </span>
                  ))}
                </div>
              </div>

              <div className="spl-computer" aria-live="polite">
                <div className="spl-computer-screen">
                  <div className="spl-computer-bar">
                    <span>{activePreview.strap}</span>
                    <strong>{activePreview.title}</strong>
                  </div>
                  <SurveyPreviewScene mode={activePreview} />
                </div>
                <div className="spl-computer-stand" />
                <div className="spl-computer-base" />
              </div>
            </div>
          </div>
        </section>

        <section id="survey-capabilities" className="spl-section spl-section--light">
          <div className="spl-shell spl-section-shell">
            <div className="spl-section-intro">
              <span className="spl-section-kicker">What it covers</span>
              <h2>Built for survey production.</h2>
            </div>

            <div className="spl-capability-list">
              {coreCapabilities.map((item) => (
                <article key={item.title} className="spl-capability-row">
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="spl-section spl-section--paper">
          <div className="spl-shell spl-section-shell">
            <div className="spl-section-intro spl-section-intro--narrow">
              <span className="spl-section-kicker">Routes</span>
              <h2>Choose the job.</h2>
            </div>

            <div className="spl-routes-grid">
              {productionRoutes.map((route) => (
                <article key={route.title} className="spl-route-column">
                  <span className="spl-route-kicker">{route.title}</span>
                  <p>{route.detail}</p>
                  <button
                    type="button"
                    className="spl-route-link"
                    onMouseEnter={warmSurveyEntry}
                    onFocus={warmSurveyEntry}
                    onClick={openSurvey}
                  >
                    {route.action}
                  </button>
                </article>
              ))}
            </div>

            <div className="spl-export-strip">
              <span className="spl-export-label">Outputs</span>
              <div className="spl-export-list">
                {exportOutputs.map((item) => (
                  <span key={item} className="spl-export-item">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="spl-footer">
          <div className="spl-shell spl-footer-shell">
            <div className="spl-footer-copy">
              <span className="spl-section-kicker">Ready</span>
              <h2>Start the next survey job.</h2>
            </div>
            <div className="spl-footer-actions">
              <button
                type="button"
                className="spl-btn-primary"
                onMouseEnter={warmSurveyEntry}
                onFocus={warmSurveyEntry}
                onClick={openSurvey}
              >
                Launch Survey Plan
              </button>
              <a className="spl-footer-email" href="mailto:landchecktech@gmail.com?subject=Survey%20Plan%20Support">
                Contact support
              </a>
            </div>
          </div>

          <div className="spl-shell spl-footer-bottom">
            <span>LandCheck Survey Plan for drafting, georeferencing, and subdivision.</span>
            <SocialLinks className="spl-footer-social" />
          </div>
        </footer>
      </main>
    </div>
  );
}
