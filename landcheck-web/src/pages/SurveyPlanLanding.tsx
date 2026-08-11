import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import planProduction1 from "./plan production1.png";
import planProduction2 from "./plan production 2.png";
import planProduction3 from "./plan production 3.png";
import planProduction4 from "./plan pruction 4.png";
import planProduction5 from "./plan production5.png";
import "../styles/survey-plan-landing.css";
import NavBar from "../components/NavBar";
import SocialLinks from "../components/SocialLinks";
import {
  prefetchSurveyPlanPreviewStep,
  prefetchSurveyPlanRoute,
  scheduleSurveyPlanIdlePrefetch,
} from "../utils/surveyPlanPrefetch";

type LaptopShot = { src: string; label: string };
type HeroHighlight = { title: string; detail: string };
type FeatureItem = { title: string; detail: string };
type StepItem = { title: string; detail: string };

const planShots: LaptopShot[] = [
  { src: planProduction1, label: "Survey plan production workspace" },
  { src: planProduction2, label: "Coordinate workflow and boundary plotting" },
  { src: planProduction3, label: "Plan drafting and output preparation" },
  { src: planProduction4, label: "Map-driven survey editing and review" },
  { src: planProduction5, label: "Final report and export-ready view" },
];

const laptopKeys = Array.from({ length: 56 }, (_, i) => i);

const features: FeatureItem[] = [
  {
    title: "Coordinate intake",
    detail:
      "Capture survey jobs in WGS84, UTM, or Minna systems from manual entry or spreadsheet upload.",
  },
  {
    title: "Sheet preview",
    detail:
      "Review the draft plan visually before printing so changes happen on the right sheet, not after export.",
  },
  {
    title: "Export package",
    detail: "Deliver PDF, DWG, and orthophoto outputs in one controlled browser workflow.",
  },
  {
    title: "Satellite context",
    detail:
      "Pull roads, rivers, and nearby structures into the production workflow where context matters.",
  },
];

const steps: StepItem[] = [
  {
    title: "Load the job",
    detail:
      "Enter points manually or bring them in from CSV and Excel using the coordinate system that matches the field record.",
  },
  {
    title: "Review the draft",
    detail:
      "Check the parcel on the live preview, refine the context, and confirm the layout before final output.",
  },
  {
    title: "Export the package",
    detail:
      "Produce the plan sheet and supporting outputs with the final typography, scale, and presentation settings applied.",
  },
];

const heroHighlights: HeroHighlight[] = [
  {
    title: "Nigerian coordinate workflows",
    detail: "WGS84, UTM, and Minna-ready input and output handling.",
  },
  {
    title: "Browser-based production",
    detail: "Draft, preview, and export without moving between desktop tools.",
  },
  {
    title: "Print-grade outputs",
    detail: "Professional sheets, orthophotos, and export files from one job record.",
  },
];

const audience = [
  "Licensed surveyors",
  "Land consultancies",
  "Layout reviewers",
  "Property developers",
  "Government agencies",
  "Legal land teams",
];

export default function SurveyPlanLanding() {
  const navigate = useNavigate();
  const [activeShot, setActiveShot] = useState(0);

  const warmSurveyPlanEntry = () => {
    void prefetchSurveyPlanRoute();
    void prefetchSurveyPlanPreviewStep();
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveShot((prev) => (prev + 1) % planShots.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    scheduleSurveyPlanIdlePrefetch();
  }, []);

  return (
    <div className="spl-page">
      <NavBar fixed activeRoute="/survey" ctaLabel="Open Survey Plan" ctaRoute="/survey-plan" />
      <main>
        <section className="spl-hero">
          <div className="spl-hero-overlay" />
          <div className="spl-hero-content">
            <span className="spl-hero-eyebrow">LANDCHECK SURVEY PLAN</span>
            <h1>
              Survey drafting,
              <br />
              review, and export
              <br />
              in one browser studio
            </h1>
            <p>
              Load field coordinates, inspect the parcel visually, refine the presentation,
              and deliver clean survey sheets without moving between disconnected desktop tools.
            </p>
            <div className="spl-hero-ctas">
              <button
                type="button"
                className="spl-hero-btn-primary"
                onMouseEnter={warmSurveyPlanEntry}
                onFocus={warmSurveyPlanEntry}
                onTouchStart={warmSurveyPlanEntry}
                onClick={() => navigate("/survey-plan")}
              >
                Launch Survey Studio
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
                  <path
                    d="M5 12h14M12 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <a href="#features" className="spl-hero-btn-outline">
                Review Capabilities
              </a>
            </div>
            <div className="spl-hero-proof">
              {heroHighlights.map((item) => (
                <article key={item.title} className="spl-hero-proof-card">
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
          <a href="#features" className="spl-scroll-indicator" aria-label="Scroll to features">
            <svg viewBox="0 0 24 24" fill="none" width="38" height="38">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </section>

        <section id="features" className="spl-showcase-section">
          <div className="spl-showcase-inner">
            <div className="spl-showcase-copy">
              <span className="spl-eyebrow">THE PLATFORM</span>
              <h2>A production-grade survey workflow for Nigerian field teams</h2>
              <p>
                Built for surveyors, land consultants, developers, and review teams that need clean
                coordinate intake, reliable preview, and export-ready outputs from one controlled workspace.
              </p>

              <div className="spl-feature-grid">
                {features.map((item) => (
                  <article key={item.title} className="spl-feature-card">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>

              <div className="spl-showcase-ctas">
                <button
                  type="button"
                  className="spl-btn-primary"
                  onMouseEnter={warmSurveyPlanEntry}
                  onFocus={warmSurveyPlanEntry}
                  onTouchStart={warmSurveyPlanEntry}
                  onClick={() => navigate("/survey-plan")}
                >
                  Open Survey Workflow
                </button>
                <button
                  type="button"
                  className="spl-btn-secondary"
                  onClick={() => navigate("/hazard-analysis")}
                >
                  Explore Flood Analysis
                </button>
              </div>
            </div>

            <div className="spl-showcase-demo">
              <div className="spl-laptop">
                <div className="spl-laptop-screen">
                  {planShots.map((shot, index) => (
                    <img
                      key={shot.label}
                      src={shot.src}
                      alt={shot.label}
                      className={`spl-laptop-shot fit-contain ${index === activeShot ? "active" : ""}`}
                      loading="lazy"
                      width="440"
                      height="275"
                    />
                  ))}
                </div>
                <div className="spl-laptop-hinge" />
                <div className="spl-laptop-base" />
                <div className="spl-laptop-deck">
                  <div className="spl-laptop-keys">
                    {laptopKeys.map((k) => (
                      <span key={k} className="spl-key" />
                    ))}
                  </div>
                  <div className="spl-laptop-trackpad" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="spl-steps-section">
          <div className="spl-steps-inner">
            <div className="spl-section-head">
              <span className="spl-eyebrow">SIMPLE PROCESS</span>
              <h2>A controlled route from field coordinates to final sheet</h2>
              <p>Three production stages, with preview and export checks built in.</p>
            </div>
            <div className="spl-steps-grid">
              {steps.map((step, index) => (
                <article key={step.title} className="spl-step-card">
                  <span className="spl-step-no">0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="who-its-for" className="spl-audience-section">
          <div className="spl-audience-inner">
            <div className="spl-section-head">
              <span className="spl-eyebrow spl-eyebrow--light">BUILT FOR</span>
              <h2>Used by survey and land delivery teams</h2>
            </div>
            <div className="spl-audience-grid">
              {audience.map((item) => (
                <div key={item} className="spl-audience-tag">
                  {item}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="spl-audience-cta"
              onMouseEnter={warmSurveyPlanEntry}
              onFocus={warmSurveyPlanEntry}
              onTouchStart={warmSurveyPlanEntry}
              onClick={() => navigate("/survey-plan")}
            >
              Start a Survey Session
            </button>
          </div>
        </section>

        <footer className="spl-footer">
          <div className="spl-footer-inner">
            <div className="spl-footer-copy">
              <h2>Open Survey Plan when the job is ready for production.</h2>
              <p>
                Coordinate intake, review, and export stay together in one browser-based workflow.
              </p>
            </div>
            <div className="spl-footer-actions">
              <button
                type="button"
                className="spl-footer-primary-btn"
                onMouseEnter={warmSurveyPlanEntry}
                onFocus={warmSurveyPlanEntry}
                onTouchStart={warmSurveyPlanEntry}
                onClick={() => navigate("/survey-plan")}
              >
                Launch Survey Studio
              </button>
              <a
                className="spl-footer-email-btn"
                href="mailto:landchecktech@gmail.com?subject=LandCheck%20Survey%20Plan%20Enquiry"
              >
                landchecktech@gmail.com
              </a>
            </div>
          </div>
          <div className="spl-footer-bottom">
            <button type="button" onClick={() => navigate("/privacy")}>
              Privacy Policy
            </button>
            <span>&copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited</span>
            <SocialLinks className="spl-footer-social" />
          </div>
        </footer>
      </main>
    </div>
  );
}
