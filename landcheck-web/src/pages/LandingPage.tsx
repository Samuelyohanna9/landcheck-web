import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import planProduction1 from "./plan production1.png";
import planProduction2 from "./plan production 2.png";
import planProduction3 from "./plan production 3.png";
import planProduction4 from "./plan pruction 4.png";
import planProduction5 from "./plan production5.png";
import "../styles/landing.css";

type LaptopShot = { src: string; label: string; fit?: "cover" | "contain" };

const planProductionShots: LaptopShot[] = [
  { src: planProduction1, label: "Survey plan production workspace", fit: "contain" },
  { src: planProduction2, label: "Coordinate workflow and boundary plotting", fit: "contain" },
  { src: planProduction3, label: "Plan drafting and output preparation", fit: "contain" },
  { src: planProduction4, label: "Map-driven survey editing and review", fit: "contain" },
  { src: planProduction5, label: "Final report and export-ready view", fit: "contain" },
];

const problemStatements = [
  "Records are fragmented",
  "Surveys are slow & expensive",
  "Fraud & land theft common",
  "Verification is difficult",
  "Disputes waste years in court",
];

const quickFeatures = [
  "Generate true-scale survey plans (PDF & DWG)",
  "View orthophoto maps instantly",
  "Detect buildings, roads & rivers automatically",
  "Support for UTM & Minna Datum coordinates",
  "Export professional reports",
  "Work entirely online - no software install",
];

const surveyPlanFeatures = [
  "Interactive map plotting",
  "WGS84, UTM & Minna Datum",
  "PDF & DWG export",
  "Orthophoto generation",
  "Back computation sheets",
];

const floodFeatures = [
  "Flood risk assessment",
  "Erosion analysis",
  "Soil stability reports",
  "Environmental impact",
  "Risk mitigation advice",
];

const futureVision = [
  "Every surveyed plot will have a unique digital fingerprint",
  "Ownership history can be verified instantly",
  "Duplicate registrations can be detected",
  "Boundary conflicts can be resolved objectively",
  "Governments can validate land records before approval",
  "Fraudulent land sales become traceable",
];

const laptopKeys = Array.from({ length: 56 }, (_, index) => index);

export default function LandingPage() {
  const navigate = useNavigate();
  const [activeShot, setActiveShot] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveShot((prev) => (prev + 1) % planProductionShots.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="landcheck-landing">
      <header className="lp-nav">
        <button type="button" className="lp-nav-brand" onClick={() => navigate("/")}>
          <img src="/logo.svg" alt="LandCheck" />
        </button>

        <div className="lp-nav-actions">
          <button type="button" className="lp-nav-btn subtle" onClick={() => navigate("/green-partners")}>
            Green + Work
          </button>
          <button type="button" className="lp-nav-btn subtle" onClick={() => navigate("/dashboard")}>
            My Plots
          </button>
          <button type="button" className="lp-nav-btn primary" onClick={() => navigate("/feedback")}>
            Give Feedback
          </button>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-tint" />
        <div className="lp-hero-copy">
          <p>LAND INTELLIGENCE SOFTWARE</p>
          <h1>Survey Plan Production + Flood Risk Intelligence</h1>
          <span>VERIFIABLE RECORDS, FASTER SURVEYS, CLEARER DECISIONS</span>
          <div className="lp-hero-cta-row">
            <button type="button" className="lp-hero-cta primary" onClick={() => navigate("/survey-plan")}>
              Start Survey Plan
            </button>
            <button type="button" className="lp-hero-cta" onClick={() => navigate("/hazard-analysis")}>
              Run Flood Analysis
            </button>
          </div>
        </div>
      </section>

      <main className="lp-main">
        <section className="lp-platform">
          <div className="lp-platform-copy">
            <h2>LANDCHECK OPERATION HUB</h2>
            <p>
              LandCheck is building the foundation for a trusted digital land registry and verification system for
              Nigeria. Teams can execute survey production and flood screening workflows in one consistent environment.
            </p>

            <div className="lp-chip-row">
              <span>Surveyors</span>
              <span>Planners</span>
              <span>Developers</span>
              <span>Real-Estate Firms</span>
              <span>Land Owners</span>
            </div>

            <div className="lp-capability-grid">
              <article className="lp-capability-card">
                <h3>Survey Plan Production</h3>
                <p>Create true-scale plans with precise coordinate handling and professional deliverables.</p>
              </article>
              <article className="lp-capability-card">
                <h3>Flood Hazard Screening</h3>
                <p>Use global datasets for flood risk map overlays and fast preliminary risk reports.</p>
              </article>
              <article className="lp-capability-card">
                <h3>Automated Feature Detection</h3>
                <p>Identify buildings, roads, and rivers quickly inside mapping workflows.</p>
              </article>
              <article className="lp-capability-card">
                <h3>Report-Ready Outputs</h3>
                <p>Export structured PDF and DWG outputs for projects, compliance, and stakeholder review.</p>
              </article>
            </div>

            <div className="lp-proof-row">
              <div>
                <span>Execution Visibility</span>
                <strong>End-to-end survey workflow clarity</strong>
              </div>
              <div>
                <span>Data Integrity</span>
                <strong>Coordinate-consistent production standards</strong>
              </div>
              <div>
                <span>Risk Intelligence</span>
                <strong>Flood screening for informed decisions</strong>
              </div>
            </div>
          </div>

          <div className="lp-platform-demo">
            <div className="lp-device-showcase">
              <div className="lp-laptop">
                <div className="lp-laptop-screen">
                  {planProductionShots.map((shot, index) => (
                    <img
                      key={`${shot.src}-${shot.label}`}
                      src={shot.src}
                      alt={shot.label}
                      className={`lp-laptop-shot ${shot.fit === "contain" ? "fit-contain" : "fit-cover"} ${index === activeShot ? "active" : ""}`}
                    />
                  ))}
                </div>
                <div className="lp-laptop-hinge" />
                <div className="lp-laptop-base" />
                <div className="lp-laptop-deck">
                  <div className="lp-laptop-keys">
                    {laptopKeys.map((keyId) => (
                      <span key={keyId} className="lp-key" />
                    ))}
                  </div>
                  <div className="lp-laptop-trackpad" />
                </div>
              </div>
            </div>

            <div className="lp-demo-actions">
              <button type="button" onClick={() => navigate("/survey-plan")}>
                Start Survey Plan
              </button>
              <button type="button" onClick={() => navigate("/hazard-analysis")}>
                Run Flood Analysis
              </button>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <h3>Why LandCheck Exists</h3>
          <div className="lp-problem-grid">
            {problemStatements.map((item) => (
              <article key={item} className="lp-problem-card">
                <span className="lp-problem-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 9v3m0 4h.01m8.3 3H3.7c-1.26 0-2.04-1.37-1.41-2.46l8.3-14.4c.63-1.1 2.2-1.1 2.83 0l8.3 14.4c.63 1.09-.15 2.46-1.41 2.46z" />
                  </svg>
                </span>
                <span>{item}</span>
              </article>
            ))}
          </div>
          <p className="lp-section-note">LandCheck changes that.</p>
        </section>

        <section className="lp-section">
          <h3>What You Can Do Today</h3>
          <div className="lp-feature-grid">
            {quickFeatures.map((item) => (
              <article key={item} className="lp-feature-item">
                <span className="lp-feature-check" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span>{item}</span>
              </article>
            ))}
          </div>
          <p className="lp-section-note">Built for surveyors, planners, developers, real-estate firms, and land owners.</p>
        </section>

        <section className="lp-service-grid">
          <article className="lp-service-card" onClick={() => navigate("/survey-plan")}>
            <div className="lp-service-head">
              <h3>Survey Plan Production</h3>
              <span className="lp-service-badge live">Available Now</span>
            </div>
            <p>
              Create professional survey plans with precise coordinate input, automated feature detection, and multiple
              export formats.
            </p>
            <ul>
              {surveyPlanFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button type="button">Start Survey Plan</button>
          </article>

          <article className="lp-service-card hazard" onClick={() => navigate("/hazard-analysis")}>
            <div className="lp-service-head">
              <h3>Land Hazard Analysis</h3>
              <span className="lp-service-badge beta">Flood Risk (Beta)</span>
            </div>
            <p>Flood risk screening using global datasets with map overlay and PDF report.</p>
            <ul>
              {floodFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button type="button">Run Flood Analysis</button>
          </article>
        </section>

        <section className="lp-section lp-vision">
          <h3>Our Bigger Mission: Stop Land Theft</h3>
          <p className="lp-vision-intro">
            LandCheck is not just a mapping tool. It is being built as the foundation for a trusted digital land
            registry and verification system.
          </p>
          <div className="lp-vision-grid">
            <article className="lp-vision-card">
              <h4>In the Future</h4>
              <ul>
                {futureVision.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="lp-vision-card highlight">
              <h4>Our Long-Term Vision</h4>
              <p>
                <strong>A national reference database for land verification.</strong>
              </p>
              <p>A system governments, banks, courts, and citizens can rely on.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <p>&copy; 2026 LandCheck - Professional Survey Solutions</p>
        <div className="lp-footer-links">
          <button type="button" onClick={() => navigate("/dashboard")}>
            Dashboard
          </button>
          <button type="button" onClick={() => navigate("/feedback")}>
            Give Feedback
          </button>
        </div>
      </footer>
    </div>
  );
}
