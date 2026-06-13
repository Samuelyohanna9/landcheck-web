import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import planProduction1 from "./plan production1.png";
import planProduction2 from "./plan production 2.png";
import planProduction3 from "./plan production 3.png";
import planProduction4 from "./plan pruction 4.png";
import planProduction5 from "./plan production5.png";
import "../styles/survey-plan-landing.css";
import NavBar from "../components/NavBar";

type LaptopShot = { src: string; label: string };

const planShots: LaptopShot[] = [
  { src: planProduction1, label: "Survey plan production workspace" },
  { src: planProduction2, label: "Coordinate workflow and boundary plotting" },
  { src: planProduction3, label: "Plan drafting and output preparation" },
  { src: planProduction4, label: "Map-driven survey editing and review" },
  { src: planProduction5, label: "Final report and export-ready view" },
];

const laptopKeys = Array.from({ length: 56 }, (_, i) => i);

const features = [
  {
    title: "Coordinate Input",
    detail: "Enter manually, upload CSV/Excel, or use WGS84, UTM, or Minna Datum values with back-computation support.",
  },
  {
    title: "Interactive Map Editing",
    detail: "View and refine your survey boundary on a live interactive map before generating the final plan.",
  },
  {
    title: "Professional Export",
    detail: "Export as PDF or DWG with orthophoto maps, computation sheets, and topographic overlays.",
  },
  {
    title: "Auto Feature Detection",
    detail: "Automatic detection of buildings, roads, and rivers anywhere in Nigeria using satellite data.",
  },
];

const steps = [
  {
    num: "01",
    title: "Enter Your Coordinates",
    detail:
      "Paste, upload CSV/Excel, or type coordinates in WGS84, UTM, or Minna Datum. Back-computation supported.",
  },
  {
    num: "02",
    title: "Plot on the Interactive Map",
    detail:
      "See your boundary rendered on a live map. Satellite features are detected and overlaid automatically.",
  },
  {
    num: "03",
    title: "Generate and Export",
    detail:
      "One click generates a true-scale plan with title block, north arrow, and scale bar. Download PDF, DWG, or orthophoto.",
  },
];

const audience = [
  "Licensed Surveyors",
  "Land Owners",
  "Real Estate Firms",
  "Government Agencies",
  "Legal Professionals",
  "Property Developers",
];

export default function SurveyPlanLanding() {
  const navigate = useNavigate();
  const [activeShot, setActiveShot] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveShot((prev) => (prev + 1) % planShots.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="spl-page">
      {/* Navigation */}
      <NavBar fixed activeRoute="/survey" ctaLabel="Open Survey Plan" ctaRoute="/survey-plan" />
      <main>

      {/* Hero */}
      <section className="spl-hero">
        <div className="spl-hero-overlay" />
        <div className="spl-hero-content">
          <span className="spl-hero-eyebrow">LANDCHECK SURVEY PLAN</span>
          <h1>
            Professional Survey Plans
            <br />
            from Coordinate Input
          </h1>
          <p>Nigeria's first web-based survey plan production system. No CAD software required.</p>
          <div className="spl-hero-ctas">
            <button
              type="button"
              className="spl-hero-btn-primary"
              onClick={() => navigate("/survey-plan")}
            >
              Open Survey Plan Tool
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
              See Features
            </a>
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

      {/* Features + Device Showcase */}
      <section id="features" className="spl-showcase-section">
        <div className="spl-showcase-inner">
          <div className="spl-showcase-copy">
            <span className="spl-eyebrow">THE PLATFORM</span>
            <h2>Survey Plan Production Software</h2>
            <p>
              A powerful web application that reduces hours of CAD work to minutes of clicks. Built for
              surveyors, planners, developers, and land owners in Nigeria.
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
                onClick={() => navigate("/survey-plan")}
              >
                Start Survey Plan →
              </button>
              <button
                type="button"
                className="spl-btn-secondary"
                onClick={() => navigate("/hazard-analysis")}
              >
                Try Flood Analysis
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

      {/* How It Works */}
      <section id="how-it-works" className="spl-steps-section">
        <div className="spl-steps-inner">
          <div className="spl-section-head">
            <span className="spl-eyebrow">SIMPLE PROCESS</span>
            <h2>How It Works</h2>
            <p>From coordinates to export-ready plan in three steps</p>
          </div>
          <div className="spl-steps-grid">
            {steps.map((s) => (
              <article key={s.num} className="spl-step-card">
                <div className="spl-step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section id="who-its-for" className="spl-audience-section">
        <div className="spl-audience-inner">
          <div className="spl-section-head">
            <span className="spl-eyebrow spl-eyebrow--light">BUILT FOR</span>
            <h2>Who Uses LandCheck Survey Plan</h2>
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
            onClick={() => navigate("/survey-plan")}
          >
            Start Generating Plans →
          </button>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="spl-footer">
        <div className="spl-footer-inner">
          <div className="spl-footer-copy">
            <h2>Start Generating Professional Survey Plans</h2>
            <p>No CAD software required. Works entirely in your browser.</p>
          </div>
          <div className="spl-footer-actions">
            <button
              type="button"
              className="spl-footer-primary-btn"
              onClick={() => navigate("/survey-plan")}
            >
              Open Survey Plan Tool
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
        </div>
      </footer>
      </main>
    </div>
  );
}
