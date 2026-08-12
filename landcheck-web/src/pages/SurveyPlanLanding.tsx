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

function SurveyPreviewScene({ mode }: { mode: PreviewMode }) {
  if (mode.id === "survey") {
    return (
      <div className="spl-scene spl-scene--survey">
        <div className="spl-scene-top">
          <span>Plan sheet preview</span>
          <span>Live parcel view</span>
        </div>
        <div className="spl-scene-paper">
          <div className="spl-scene-polygon">
            <span className="spl-scene-vertex spl-scene-vertex--a">A</span>
            <span className="spl-scene-vertex spl-scene-vertex--b">B</span>
            <span className="spl-scene-vertex spl-scene-vertex--c">C</span>
            <span className="spl-scene-vertex spl-scene-vertex--d">D</span>
            <span className="spl-scene-area">2.98 ha</span>
          </div>
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
    );
  }

  if (mode.id === "georeference") {
    return (
      <div className="spl-scene spl-scene--georeference">
        <div className="spl-scene-top">
          <span>Raster control</span>
          <span>Ground map pairing</span>
        </div>
        <div className="spl-scene-split">
          <div className="spl-raster-panel">
            <div className="spl-raster-grid" />
            <span className="spl-gcp spl-gcp--one">GCP 1</span>
            <span className="spl-gcp spl-gcp--two">GCP 2</span>
            <span className="spl-gcp spl-gcp--three">GCP 3</span>
          </div>
          <div className="spl-map-panel">
            <div className="spl-map-panel-grid" />
            <span className="spl-map-cross spl-map-cross--one" />
            <span className="spl-map-cross spl-map-cross--two" />
            <span className="spl-map-cross spl-map-cross--three" />
          </div>
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
        <span>Lot balance checked</span>
      </div>
      <div className="spl-subdivision-panel">
        <div className="spl-parent-lot">
          <div className="spl-child-lot spl-child-lot--one">Lot A</div>
          <div className="spl-child-lot spl-child-lot--two">Lot B</div>
          <div className="spl-child-lot spl-child-lot--three">Lot C</div>
          <div className="spl-child-lot spl-child-lot--four">Lot D</div>
        </div>
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
