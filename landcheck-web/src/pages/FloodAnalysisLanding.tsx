import { useNavigate } from "react-router-dom";
import "../styles/flood-landing.css";
import NavBar from "../components/NavBar";

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
        <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M5 9c3-3 8-3 11 0"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2 2"
        />
      </svg>
    ),
    title: "Flood Risk Mapping",
    detail:
      "Screen any Nigerian land parcel for flood exposure using global terrain and hydrological datasets — delivered instantly.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    title: "Erosion & Soil Stability",
    detail:
      "Assess soil erosion susceptibility and ground stability risk for any site before purchase or development.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: "PDF Risk Report",
    detail:
      "Download a professional risk report with flood zones, risk indicators, satellite map overlay, and mitigation guidance.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width="28" height="28" aria-hidden="true">
        <path
          d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
    title: "Site-Specific Analysis",
    detail:
      "Input any coordinates or land parcel boundary in Nigeria. Analysis uses high-resolution terrain and climate data.",
  },
];

const steps = [
  {
    num: "01",
    title: "Enter the Location",
    detail: "Input the coordinates or address of the land parcel you want to screen. Works anywhere in Nigeria.",
  },
  {
    num: "02",
    title: "Run Hazard Screening",
    detail:
      "Our system analyzes flood exposure, erosion risk, soil stability, and environmental factors using global datasets.",
  },
  {
    num: "03",
    title: "Download the Report",
    detail: "Get a detailed PDF risk report instantly — with risk level indicators, satellite map overlay, and recommendations.",
  },
];

const audience = [
  "Property Developers",
  "Land Buyers",
  "Urban Planners",
  "Financial Institutions",
  "Construction Companies",
  "Government Bodies",
  "Real Estate Professionals",
  "Environmental Consultants",
];

export default function FloodAnalysisLanding() {
  const navigate = useNavigate();

  return (
    <div className="fal-page">
      {/* Navigation */}
      <NavBar fixed activeRoute="/flood" ctaLabel="Run Analysis" ctaRoute="/hazard-analysis" />
      <main>

      {/* Hero */}
      <section className="fal-hero">
        <div className="fal-hero-overlay" />
        {/* Decorative flood/water SVG */}
        <svg className="fal-hero-svg" aria-hidden="true" viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="fal-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(37,99,235,0.15)" />
              <stop offset="100%" stopColor="rgba(37,99,235,0)" />
            </radialGradient>
          </defs>
          <ellipse cx="720" cy="350" rx="600" ry="250" fill="url(#fal-glow)" />
          {/* Water-like wave lines */}
          <path d="M-50,250 Q120,225 290,252 Q460,280 630,248 Q800,216 970,250 Q1140,284 1310,252 Q1400,236 1490,248" fill="none" stroke="rgba(37,99,235,0.07)" strokeWidth="80"/>
          <path d="M-50,380 Q120,358 290,382 Q460,406 630,375 Q800,344 970,378 Q1140,412 1310,378 Q1400,362 1490,374" fill="none" stroke="rgba(37,99,235,0.05)" strokeWidth="60"/>
          <path d="M-50,480 Q180,460 360,482 Q540,504 720,474 Q900,444 1080,476 Q1260,508 1490,474" fill="none" stroke="rgba(37,99,235,0.04)" strokeWidth="40"/>
          {/* Subtle grid */}
          {[0,1,2,3,4,5,6,7,8,9,10,11].map((i) => (
            <line key={`v${i}`} x1={i * 130} y1="0" x2={i * 130} y2="700" stroke="rgba(255,255,255,0.018)" strokeWidth="0.5"/>
          ))}
          {[0,1,2,3,4,5,6,7,8].map((i) => (
            <line key={`h${i}`} x1="0" y1={i * 90} x2="1440" y2={i * 90} stroke="rgba(255,255,255,0.018)" strokeWidth="0.5"/>
          ))}
        </svg>
        <div className="fal-hero-content">
          <span className="fal-hero-eyebrow">LANDCHECK FLOOD RISK</span>
          <h1>
            Land Hazard Screening
            <br />
            for Any Site in Nigeria
          </h1>
          <p>
            Instant flood risk assessment, erosion analysis, and soil stability reports — with a downloadable
            PDF for any Nigerian land parcel.
          </p>
          <div className="fal-hero-ctas">
            <button
              type="button"
              className="fal-hero-btn-primary"
              onClick={() => navigate("/hazard-analysis")}
            >
              Run Flood Analysis
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
            <a href="#features" className="fal-hero-btn-outline">
              See Features
            </a>
          </div>
        </div>
        <a href="#features" className="fal-scroll-indicator" aria-label="Scroll to features">
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

      {/* Features */}
      <section id="features" className="fal-features-section">
        <div className="fal-features-inner">
          <div className="fal-section-head">
            <span className="fal-eyebrow">WHAT WE SCREEN FOR</span>
            <h2>Comprehensive Land Risk Analysis</h2>
            <p>Everything you need to assess hazard risk before buying, building, or financing land in Nigeria.</p>
          </div>
          <div className="fal-features-grid">
            {features.map((item) => (
              <article key={item.title} className="fal-feature-card">
                <div className="fal-feature-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
          <div className="fal-features-cta">
            <button
              type="button"
              className="fal-btn-primary"
              onClick={() => navigate("/hazard-analysis")}
            >
              Run a Free Analysis →
            </button>
          </div>
        </div>
      </section>

      {/* Risk visualization strip */}
      <section className="fal-risk-strip">
        <div className="fal-risk-inner">
          <span className="fal-eyebrow fal-eyebrow--light">RISK LEVELS</span>
          <h2>Understand Your Land's Risk Profile</h2>
          <div className="fal-risk-levels">
            <div className="fal-risk-level fal-risk-low">
              <span className="fal-risk-label">Low Risk</span>
              <p>Minimal flood or erosion exposure. Suitable for development with standard precautions.</p>
            </div>
            <div className="fal-risk-level fal-risk-moderate">
              <span className="fal-risk-label">Moderate Risk</span>
              <p>Periodic flood exposure or moderate soil instability. Engineering review recommended.</p>
            </div>
            <div className="fal-risk-level fal-risk-high">
              <span className="fal-risk-label">High Risk</span>
              <p>Significant flood or erosion hazard. Detailed engineering assessment required before development.</p>
            </div>
            <div className="fal-risk-level fal-risk-severe">
              <span className="fal-risk-label">Severe Risk</span>
              <p>Very high hazard exposure. Special mitigation required. Not recommended for standard construction.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="fal-steps-section">
        <div className="fal-steps-inner">
          <div className="fal-section-head">
            <span className="fal-eyebrow">SIMPLE PROCESS</span>
            <h2>How It Works</h2>
            <p>From coordinates to risk report in under a minute</p>
          </div>
          <div className="fal-steps-grid">
            {steps.map((s) => (
              <article key={s.num} className="fal-step-card">
                <div className="fal-step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section id="who-its-for" className="fal-audience-section">
        <div className="fal-audience-inner">
          <div className="fal-section-head">
            <span className="fal-eyebrow fal-eyebrow--light">BUILT FOR</span>
            <h2>Who Uses Flood Risk Analysis</h2>
          </div>
          <div className="fal-audience-grid">
            {audience.map((item) => (
              <div key={item} className="fal-audience-tag">
                {item}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="fal-audience-cta"
            onClick={() => navigate("/hazard-analysis")}
          >
            Run Your Analysis Now →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="fal-footer">
        <div className="fal-footer-inner">
          <div className="fal-footer-copy">
            <h2>Screen Any Land Parcel for Flood Risk</h2>
            <p>Instant results. No sign-up required. Works for any location in Nigeria.</p>
          </div>
          <div className="fal-footer-actions">
            <button
              type="button"
              className="fal-footer-primary-btn"
              onClick={() => navigate("/hazard-analysis")}
            >
              Open Flood Risk Tool
            </button>
            <a
              className="fal-footer-email-btn"
              href="mailto:landchecktech@gmail.com?subject=LandCheck%20Flood%20Risk%20Enquiry"
            >
              landchecktech@gmail.com
            </a>
          </div>
        </div>
        <div className="fal-footer-bottom">
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
