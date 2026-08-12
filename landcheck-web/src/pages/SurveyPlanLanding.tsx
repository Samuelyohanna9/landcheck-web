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
};

const heroTerms = ["Survey plan", "Georeference", "Plot subdivision"];

const previewModes: PreviewMode[] = [
  {
    id: "survey",
    title: "Survey plan",
    summary: "Coordinate to sheet.",
  },
  {
    id: "georeference",
    title: "Georeference",
    summary: "Control to raster.",
  },
  {
    id: "subdivision",
    title: "Plot subdivision",
    summary: "Parent to lots.",
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

const screenPreviewAssets: Record<PreviewMode["id"], { src: string; alt: string }> = {
  survey: {
    src: "/survey  plan preview.jpg",
    alt: "Preview of plotted survey plan output",
  },
  georeference: {
    src: "/georefrence preview.jpg",
    alt: "Preview of georeferenced raster and control workflow",
  },
  subdivision: {
    src: "/subdivision_preview.jpg",
    alt: "Preview of plot subdivision output",
  },
};

function SurveyPreviewScene({ mode }: { mode: PreviewMode }) {
  const activeAsset = screenPreviewAssets[mode.id];

  return (
    <div className="spl-laptop-stage" aria-label={`${mode.title} preview`}>
      <img
        className="spl-laptop-shell"
        src="/survey-laptop-hand.png"
        alt="Laptop displaying a survey preview"
        loading="eager"
      />
      <div className="spl-laptop-display">
        <figure className="spl-laptop-display-frame">
          <img
            key={activeAsset.src}
            src={activeAsset.src}
            alt={activeAsset.alt}
            className={`spl-laptop-preview spl-laptop-preview--${mode.id}`}
            loading="eager"
          />
        </figure>
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
                  <SurveyPreviewScene mode={activePreview} />
                </div>
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
