import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import planProduction1 from "./plan production1.png";
import planProduction2 from "./plan production 2.png";
import planProduction3 from "./plan production 3.png";
import planProduction4 from "./plan pruction 4.png";
import planProduction5 from "./plan production5.png";
import "../styles/landing.css";
import { fetchPublicPartnerOrganizations } from "../api/greenSponsor";

type LaptopShot = { src: string; label: string; fit?: "cover" | "contain" };
type PartnerOrg = { name: string; logo: string | null };

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

const greenFeatures = [
  "GPS tree inventory + field capture",
  "Agric farm boundary monitoring",
  "Relief & humanitarian site capture",
  "Work orders + staff assignment",
  "Program reporting for donors & NGOs",
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

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=online.landcheck.mobile";

const PILOT_ORG_NAMES = new Set(["Think Green Foundation"]);

export default function LandingPage() {
  const navigate = useNavigate();
  const [activeShot, setActiveShot] = useState(0);
  const [partners, setPartners] = useState<PartnerOrg[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveShot((prev) => (prev + 1) % planProductionShots.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPublicPartnerOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        const mapped = orgs.map((o) => ({ name: o.name, logo: o.logo_url }));
        if (mapped.length > 0) setPartners(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landcheck-landing">
      {/* Navigation */}
      <header className="lp-nav">
        <button type="button" className="lp-nav-brand" onClick={() => navigate("/")}>
          <img src="/logo.svg" alt="LandCheck" />
        </button>
        <div className="lp-nav-actions">
          <button type="button" className="lp-nav-btn subtle" onClick={() => navigate("/survey-plan")}>
            Survey Plans
          </button>
          <button type="button" className="lp-nav-btn subtle" onClick={() => navigate("/hazard-analysis")}>
            Hazard Analysis
          </button>
          <button type="button" className="lp-nav-btn subtle" onClick={() => navigate("/green-partners")}>
            LandCheck Green
          </button>
          <button type="button" className="lp-nav-btn subtle" onClick={() => navigate("/dashboard")}>
            My Plots
          </button>
          <button type="button" className="lp-nav-btn primary" onClick={() => navigate("/feedback")}>
            Give Feedback
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-tint" />
        <div className="lp-hero-copy">
          <p>LAND INTELLIGENCE PLATFORM FOR NIGERIA</p>
          <h1>Survey Plans, Flood Risk + Environmental Monitoring</h1>
          <span>VERIFIABLE RECORDS · FASTER SURVEYS · FIELD MONITORING · TRANSPARENT REPORTING</span>
          <div className="lp-hero-cta-row">
            <button type="button" className="lp-hero-cta primary" onClick={() => navigate("/survey-plan")}>
              Survey Plan
            </button>
            <button type="button" className="lp-hero-cta" onClick={() => navigate("/hazard-analysis")}>
              Flood Analysis
            </button>
            <button type="button" className="lp-hero-cta green" onClick={() => navigate("/green-partners")}>
              LandCheck Green
            </button>
          </div>
        </div>
      </section>

      <main className="lp-main">
        {/* Three-product cards */}
        <section className="lp-products-section">
          <div className="lp-section-eyebrow-row">
            <span className="lp-eyebrow">OUR PLATFORM</span>
            <h2 className="lp-products-title">Three Integrated Products</h2>
            <p className="lp-products-sub">One platform covering land documentation, risk assessment, and field monitoring</p>
          </div>
          <div className="lp-products-grid">
            <article className="lp-product-card lp-product-survey" onClick={() => navigate("/survey-plan")}>
              <div className="lp-product-icon">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="26" height="26">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="lp-product-badge">Available Now</div>
              <h3>Survey Plan Production</h3>
              <p>Generate true-scale professional survey plans from coordinate input. PDF, DWG, orthophoto, and computation sheet exports.</p>
              <ul className="lp-product-features">
                {surveyPlanFeatures.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <span className="lp-product-cta">Open Survey Plan →</span>
            </article>

            <article className="lp-product-card lp-product-hazard" onClick={() => navigate("/hazard-analysis")}>
              <div className="lp-product-icon">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="26" height="26">
                  <path d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="lp-product-badge beta">Flood Risk Beta</div>
              <h3>Land Hazard Analysis</h3>
              <p>Screen any land parcel in Nigeria for flood risk, erosion, and soil stability using global datasets with PDF report.</p>
              <ul className="lp-product-features">
                {floodFeatures.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <span className="lp-product-cta">Run Flood Analysis →</span>
            </article>

            <article className="lp-product-card lp-product-green" onClick={() => navigate("/green-partners")}>
              <div className="lp-product-icon">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="26" height="26">
                  <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="lp-product-badge green">Android + Web</div>
              <h3>LandCheck Green</h3>
              <p>Tree inventory, agric farm monitoring, and humanitarian site assessment for NGOs, government agencies, and CSR programs.</p>
              <ul className="lp-product-features">
                {greenFeatures.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <div className="lp-product-green-actions">
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lp-product-play-btn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden="true">
                    <path d="M3.5 2.87L12.41 12 3.5 21.13c-.31-.3-.5-.72-.5-1.17V4.04c0-.45.19-.87.5-1.17z" fill="#4285F4" />
                    <path d="M3.5 2.87L12.41 12l3.3-3.3L5.27 2.36A1.79 1.79 0 0 0 3.5 2.87z" fill="#34A853" />
                    <path d="M3.5 21.13L12.41 12l3.3 3.3-10.44 6.34A1.79 1.79 0 0 1 3.5 21.13z" fill="#EA4335" />
                    <path d="M15.71 8.7L12.41 12l3.3 3.3 3.5-2.01a1.5 1.5 0 0 0 0-2.6l-3.5-2z" fill="#FBBC04" />
                  </svg>
                  Google Play
                </a>
                <a
                  href="/green/login/sponsor"
                  className="lp-product-sponsor-btn"
                  onClick={(e) => e.stopPropagation()}
                >
                  Sponsor a Tree
                </a>
              </div>
            </article>
          </div>
        </section>

        {/* Platform Demo */}
        <section className="lp-platform">
          <div className="lp-platform-copy">
            <h2>LANDCHECK OPERATION HUB</h2>
            <p className="lp-platform-kicker">SURVEY PLAN PRODUCTION AND FLOOD INTELLIGENCE SOFTWARE</p>
            <div className="lp-platform-divider" aria-hidden="true" />
            <div className="lp-platform-body">
              <p>
                LandCheck is first of its kind in Nigerian surveying — a powerful web application that reduces hours
                of CAD work to minutes of clicks, with flood hazard screening done in seconds. Built for surveyors,
                planners, developers, real estate firms, and land owners.
              </p>
              <p>
                Generate accurate, true-scale professional survey plans from coordinate input or CSV/Excel upload.
                Automatic detection of buildings, roads, and rivers anywhere in Nigeria. Export DWG, PDF,
                computation sheets, orthophoto, and topographic maps.
              </p>
              <p>
                Flood risk analysis for any land parcel in Nigeria using global datasets — detailed report with risk
                indicators and map overlay.
              </p>
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

        {/* Why LandCheck Exists */}
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

        {/* What You Can Do Today */}
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

        {/* Vision */}
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

      {/* Partner Organizations */}
      {partners.length > 0 && (
        <section className="lp-partners-section">
          <div className="lp-partners-inner">
            <div className="lp-partners-head">
              <span className="lp-eyebrow">TRUSTED BY</span>
              <h2>Our Partner Organizations</h2>
              <p>Organizations running field programs on LandCheck Green across Nigeria</p>
            </div>
            <div className="lp-partners-logos">
              {partners.map((org) => (
                <div
                  key={org.name}
                  className="lp-partner-badge"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate("/green-partners#partners")}
                  onKeyDown={(e) => e.key === "Enter" && navigate("/green-partners#partners")}
                >
                  {PILOT_ORG_NAMES.has(org.name) && (
                    <span className="lp-partner-pilot-tag">Pilot</span>
                  )}
                  {org.logo ? (
                    <img src={org.logo} alt={org.name} className="lp-partner-logo" />
                  ) : (
                    <span className="lp-partner-initials">
                      {org.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                    </span>
                  )}
                  <span className="lp-partner-name">{org.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="lp-footer">
        <p>&copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited</p>
        <div className="lp-footer-links">
          <button type="button" onClick={() => navigate("/green-partners")}>
            LandCheck Green
          </button>
          <button type="button" onClick={() => navigate("/dashboard")}>
            Dashboard
          </button>
          <button type="button" onClick={() => navigate("/feedback")}>
            Feedback
          </button>
          <button type="button" onClick={() => navigate("/privacy")}>
            Privacy Policy
          </button>
        </div>
      </footer>
    </div>
  );
}
