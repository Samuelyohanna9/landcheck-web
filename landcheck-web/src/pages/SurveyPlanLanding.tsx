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

type IconName =
  | "bolt"
  | "cloud"
  | "flag"
  | "doc"
  | "pin"
  | "cad"
  | "grid"
  | "image"
  | "upload"
  | "tripod"
  | "compass"
  | "target"
  | "chevron"
  | "paperplane";

const iconPaths: Record<Exclude<IconName, "flag">, string> = {
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  cloud: "M7 18h10a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.1 12.2 3.5 3.5 0 0 0 7 18Z",
  doc: "M7 3h7l4 4v14H7V3Zm7 0v4h4M9.5 12.5h5M9.5 15.5h5M9.5 9.5h2",
  pin: "M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  cad: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3h6M17 14v6",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  image: "M4 5h16v14H4V5Zm3 10 4-5 3 3.5L17 10l3 5H7Zm1.5-6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3",
  tripod: "M12 4 6 20m6-16 6 16M9 14h6M12 4v6M4 20h16",
  compass: "M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm3.5 5.5-2 5.5-5.5 2 2-5.5 5.5-2Z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-3.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z",
  chevron: "m9 5 7 7-7 7",
  paperplane: "m3 11 18-8-8 18-2.5-7.5L3 11Zm10.5 2.5L21 3",
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  if (name === "flag") {
    return (
      <span className={`spl-flag-icon ${className ?? ""}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

const heroTrustBadges: { icon: IconName; label: string }[] = [
  { icon: "bolt", label: "Fast & Accurate" },
  { icon: "cloud", label: "Cloud Based" },
  { icon: "flag", label: "African Standards" },
  { icon: "doc", label: "DWG & PDF Export" },
];

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

const coreCapabilities: { icon: IconName; title: string; detail: string }[] = [
  { icon: "pin", title: "Georeference", detail: "Georeference plans with Minna or WGS84 datum." },
  { icon: "cad", title: "CAD & Survey Tools", detail: "Powerful CAD tools for survey drafting." },
  { icon: "grid", title: "Plot Subdivision", detail: "Automatic subdivision and labeling." },
  { icon: "doc", title: "Reports", detail: "Export professional reports and documents." },
  { icon: "image", title: "Orthophoto Maps", detail: "View and download high resolution maps." },
  { icon: "upload", title: "Export", detail: "Export to DWG, PDF and other formats." },
];

const productionRoutes: { icon: IconName; title: string; detail: string; action: string }[] = [
  {
    icon: "tripod",
    title: "General Survey",
    detail: "Cadastral, Topographic, Engineering survey",
    action: "Open drafting workspace",
  },
  {
    icon: "pin",
    title: "Georeference",
    detail: "Georeference existing plans and maps",
    action: "Open raster workspace",
  },
  {
    icon: "grid",
    title: "Subdivision",
    detail: "Divide land into plots and generate plans",
    action: "Open subdivision workspace",
  },
  {
    icon: "compass",
    title: "Back Computation",
    detail: "Compute missing sides, angles and coordinates",
    action: "Open back computation workspace",
  },
];

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
              <div className="spl-hero-badges" aria-label="Survey capabilities">
                {heroTrustBadges.map((badge) => (
                  <span key={badge.label} className="spl-hero-badge">
                    <Icon name={badge.icon} className="spl-hero-badge-icon" />
                    {badge.label}
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
                <div className="spl-geo-card" aria-hidden="true">
                  <span className="spl-geo-card-icon">
                    <Icon name="target" />
                  </span>
                  <div className="spl-geo-card-body">
                    <strong>Georeferenced</strong>
                    <span>UTM Zone 32N</span>
                    <span>Minna Datum</span>
                    <span className="spl-geo-card-pill">High Accuracy</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="survey-capabilities" className="spl-section spl-section--light">
          <div className="spl-shell spl-section-shell">
            <div className="spl-section-intro">
              <span className="spl-section-kicker">Built for survey professionals</span>
              <h2>Everything you need for survey production.</h2>
            </div>

            <div className="spl-capability-grid">
              {coreCapabilities.map((item) => (
                <article key={item.title} className="spl-capability-card">
                  <span className="spl-capability-card-icon">
                    <Icon name={item.icon} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="spl-section spl-section--paper">
          <div className="spl-shell spl-section-shell">
            <div className="spl-routes-panel">
              <div className="spl-section-intro spl-section-intro--narrow spl-section-intro--center">
                <span className="spl-section-kicker">Choose the job</span>
                <h2>What would you like to do today?</h2>
              </div>

              <div className="spl-routes-grid">
                {productionRoutes.map((route) => (
                  <button
                    type="button"
                    key={route.title}
                    className="spl-route-card"
                    onMouseEnter={warmSurveyEntry}
                    onFocus={warmSurveyEntry}
                    onClick={openSurvey}
                    aria-label={route.action}
                  >
                    <span className="spl-route-card-icon">
                      <Icon name={route.icon} />
                    </span>
                    <span className="spl-route-card-body">
                      <strong>{route.title}</strong>
                      <span>{route.detail}</span>
                    </span>
                    <Icon name="chevron" className="spl-route-card-chevron" />
                  </button>
                ))}
              </div>

              <p className="spl-routes-tip">
                <strong>Tip:</strong>&nbsp;You can switch jobs anytime from the dashboard.
              </p>
            </div>
          </div>
        </section>

        <footer className="spl-footer">
          <div className="spl-shell spl-footer-shell">
            <div className="spl-footer-copy">
              <span className="spl-footer-icon">
                <Icon name="paperplane" />
              </span>
              <div>
                <h2>Start the next survey job.</h2>
                <p>LandCheck Survey. Fast, reliable, professional.</p>
              </div>
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
              <a className="spl-btn-secondary" href="mailto:landchecktech@gmail.com?subject=Survey%20Plan%20Support">
                Learn More
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
