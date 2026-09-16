import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { isSurveyAuthed } from "../auth/surveyAuth";
import {
  prefetchSurveyPlanPreviewStep,
  prefetchSurveyPlanRoute,
  scheduleSurveyPlanIdlePrefetch,
} from "../utils/surveyPlanPrefetch";
import "../styles/survey-plan-landing.css";
import "../styles/public-landing.css";

const SignupGateModal = lazy(() => import("../components/SignupGateModal"));

const asset = (fileName: string) => encodeURI(`/${fileName}`);

const featureHighlights = [
  {
    title: "AI Coordinate Scan",
    description: "Extract coordinates from scanned plans with high accuracy.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8V5a1 1 0 011-1h3M20 8V5a1 1 0 00-1-1h-3M4 16v3a1 1 0 001 1h3M20 16v3a1 1 0 01-1 1h-3" />
        <path d="M3 12h18" />
      </svg>
    ),
  },
  {
    title: "Georeference Layouts",
    description: "Align scanned drawings to real world coordinates.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
  },
  {
    title: "Automatic Subdivision",
    description: "Create child parcels and update boundaries instantly.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <rect x="13" y="13" width="8" height="8" rx="1" />
      </svg>
    ),
  },
  {
    title: "PDF & DWG Export",
    description: "Generate survey plans, reports and CAD files.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
        <path d="M14 3v4h4M9 15l1.8 3 1.7-2.4L14.2 18" />
      </svg>
    ),
  },
];

const workflowSteps = [
  {
    step: "1",
    title: "Import your data",
    description: "Enter coordinates or upload a scanned drawing in common formats (CSV, DXF, JPG, PNG).",
    image: null as string | null,
  },
  {
    step: "2",
    title: "Review and edit",
    description: "Check geometry, adjust boundaries and add details on the map.",
    image: asset("survey  plan preview.jpg"),
  },
  {
    step: "3",
    title: "Export professional outputs",
    description: "Generate survey plans and export to PDF, DWG or GIS formats.",
    image: asset("subdivision_preview.jpg"),
  },
];

const workspaceAudiences = [
  {
    title: "Survey practices",
    description: "Deliver accurate plans, faster.",
    points: [
      "Standardized outputs (PDF, DWG, GIS)",
      "Faster plot delivery",
      "Organize client and project records",
      "Work with your team in one workspace",
    ],
  },
  {
    title: "Real-estate teams",
    description: "Turn land data into progress.",
    points: [
      "Validate and manage land parcels",
      "Track customer and payment records",
      "Collaborate with surveyors",
      "Keep a central record of all projects",
    ],
  },
];

const socialLinks = [
  { label: "Instagram", href: "https://www.instagram.com/land.check/" },
  { label: "Facebook", href: "https://www.facebook.com/landcheck/" },
  { label: "YouTube", href: "https://www.youtube.com/@LandCheckGreen" },
  { label: "TikTok", href: "https://www.tiktok.com/@landcheckgeo" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/landcheck-geospatial/" },
];

export default function SurveyPlanLanding() {
  const navigate = useNavigate();
  const [signInOpen, setSignInOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [totalPlotsGenerated, setTotalPlotsGenerated] = useState<number | null>(null);
  const signedIn = isSurveyAuthed();
  const closeMenu = () => setMenuOpen(false);

  // Escape closes the mobile drawer, matching the dismissal convention used on the other landing
  // pages' own collapsible nav (EstateLanding, the main site's NavBar).
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    scheduleSurveyPlanIdlePrefetch();
  }, []);

  useEffect(() => {
    let active = true;
    const refreshPlotCount = async () => {
      try {
        const { data } = await api.get<{ total_plots_generated: number }>("/analytics/public-proof", {
          headers: { "Cache-Control": "no-cache" },
        });
        const count = Number(data.total_plots_generated);
        if (active && Number.isSafeInteger(count) && count >= 0) {
          setTotalPlotsGenerated(count);
        }
      } catch {
        if (active) setTotalPlotsGenerated(null);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshPlotCount();
    };

    void refreshPlotCount();
    const interval = window.setInterval(() => void refreshPlotCount(), 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const warmSurveyEntry = () => {
    void prefetchSurveyPlanRoute();
    void prefetchSurveyPlanPreviewStep();
  };

  const openWorkspace = () => {
    warmSurveyEntry();
    navigate("/survey-plan");
  };

  return (
    <div className="spl-page public-landing">
      <header className="spl-nav">
        <Link to="/" className="spl-brand" aria-label="LandCheck home">
          <img src="/logo.svg" alt="LandCheck" width="130" height="38" />
          <span className="spl-brand-product">Survey</span>
        </Link>
        <button
          type="button"
          className="spl-nav-hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
        >
          <span /><span /><span />
        </button>
        <nav className="spl-nav-links" aria-label="Survey navigation">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#for-surveyors">For Surveyors</a>
          <a href="#for-estates">For Estates</a>
          {signedIn ? (
            <Link to="/dashboard">Dashboard</Link>
          ) : (
            <button type="button" onClick={() => setSignInOpen(true)}>Sign in</button>
          )}
          <button type="button" className="spl-nav-workspace" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
            Open workspace
          </button>
        </nav>
      </header>

      <div className={`spl-mobile-overlay${menuOpen ? " spl-mobile-overlay--open" : ""}`} onClick={closeMenu} aria-hidden={!menuOpen}>
        <nav className={`spl-mobile-drawer${menuOpen ? " spl-mobile-drawer--open" : ""}`} onClick={(event) => event.stopPropagation()} aria-label="Survey navigation (mobile)">
          <div className="spl-mobile-drawer-head">
            <img src="/logo.svg" alt="LandCheck" width="112" height="32" />
            <button type="button" className="spl-mobile-close" onClick={closeMenu} aria-label="Close navigation">&times;</button>
          </div>
          <a href="#features" className="spl-mobile-item" onClick={closeMenu}>Features</a>
          <a href="#workflow" className="spl-mobile-item" onClick={closeMenu}>Workflow</a>
          <a href="#for-surveyors" className="spl-mobile-item" onClick={closeMenu}>For Surveyors</a>
          <a href="#for-estates" className="spl-mobile-item" onClick={closeMenu}>For Estates</a>
          {signedIn ? (
            <Link to="/dashboard" className="spl-mobile-item" onClick={closeMenu}>Dashboard</Link>
          ) : (
            <button type="button" className="spl-mobile-item" onClick={() => { closeMenu(); setSignInOpen(true); }}>Sign in</button>
          )}
          <button
            type="button"
            className="spl-mobile-cta"
            onMouseEnter={warmSurveyEntry}
            onClick={() => { closeMenu(); openWorkspace(); }}
          >
            Open workspace
          </button>
        </nav>
      </div>

      <main>
        <section className="spl-hero" aria-labelledby="spl-hero-title">
          <div className="spl-hero-device" aria-hidden="true">
            <img className="spl-hero-laptop" src="/survey-laptop-hand.png" alt="" />
          </div>
          <div className="spl-hero-screen" aria-hidden="true">
            <img src="/survey%20%20plan%20preview.jpg" alt="" />
          </div>
          <div className="spl-hero-shade" />
          <div className="spl-shell spl-hero-shell">
            <div className="spl-hero-copy">
              <p className="spl-kicker">LandCheck Survey</p>
              <h1 id="spl-hero-title">Professional survey plans. Ready in minutes.</h1>
              <p className="spl-hero-summary">
                Convert coordinates or scanned layouts into accurate, export-ready survey plans - from one connected workspace.
              </p>
              <div className="spl-hero-actions">
                <button type="button" className="spl-hero-btn-primary" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
                  Open survey workspace
                </button>
                <a href="#workflow" className="spl-hero-btn-outline">See how it works</a>
              </div>
              <div className="spl-hero-stats">
                {totalPlotsGenerated !== null && (
                  <div className="spl-hero-stat">
                    <strong>{totalPlotsGenerated.toLocaleString("en-NG")}</strong>
                    <span>survey plots generated</span>
                  </div>
                )}
                <div className="spl-hero-stat">
                  <strong>Faster</strong>
                  <span>from data to plan</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="spl-section spl-features">
          <div className="spl-shell spl-features-grid">
            {featureHighlights.map((item) => (
              <div className="spl-feature-card" key={item.title}>
                <span className="spl-feature-icon" aria-hidden="true">{item.icon}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="spl-section spl-capabilities">
          <div className="spl-shell">
            <div className="spl-section-intro spl-section-intro--center">
              <p className="spl-section-kicker">A simpler way to work</p>
              <h2>From field data to finished plan.</h2>
              <p>
                Bring in coordinates or a scanned drawing, check the geometry and prepare the final plan in one place.
              </p>
            </div>
            <ul className="spl-step-list">
              {workflowSteps.map((item) => (
                <li key={item.title} className="spl-step-card">
                  <div className="spl-step-visual">
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="spl-step-number" aria-hidden="true">{item.step}</span>
                    )}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="spl-scan-section">
          <div className="spl-shell">
            <div className="spl-section-intro spl-section-intro--center">
              <p className="spl-section-kicker">For existing plans</p>
              <h2>Turn scanned layouts into usable spatial data.</h2>
              <p>
                Georeference your scanned drawings, trace boundaries and convert them into accurate, editable parcels.
              </p>
            </div>
            <figure className="spl-scan-figure">
              <img src={asset("georefrence preview.jpg")} alt="A scanned plot layout aligned to its real-world satellite position during georeferencing" loading="lazy" decoding="async" />
            </figure>
            <button type="button" className="spl-btn-primary" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
              Open georeferencing tools
            </button>
          </div>
        </section>

        <section id="for-surveyors" className="spl-section spl-audiences">
          <div className="spl-shell">
            <div className="spl-section-intro spl-section-intro--center">
              <p className="spl-section-kicker">Built for professionals</p>
              <h2>One workspace for every land project.</h2>
              <p>Whether you run a survey practice or manage a real-estate portfolio, LandCheck gives you the tools to work faster and with confidence.</p>
            </div>
            <div className="spl-audience-grid">
              {workspaceAudiences.map((audience) => (
                <div className="spl-audience-card" key={audience.title} id={audience.title === "Real-estate teams" ? "for-estates" : undefined}>
                  <h3>{audience.title}</h3>
                  <p>{audience.description}</p>
                  <ul>
                    {audience.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="spl-workflow">
          <div className="spl-shell">
            <div className="spl-workflow-intro">
              <p className="spl-section-kicker">One connected workspace</p>
              <h2>Bring in the data. Finish the plan.</h2>
              <p>Import coordinates or a scan, review the map, then prepare and export your work.</p>
              <button type="button" className="spl-hero-btn-primary" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
                Start a survey plan
              </button>
            </div>
          </div>
        </section>

      </main>

      <footer className="spl-footer">
        <div className="spl-footer-main">
          <div className="spl-footer-brand">
            <Link to="/" className="spl-brand">
              <img src="/logo.svg" alt="LandCheck" width="100" height="34" loading="lazy" />
              <span className="spl-brand-product">Survey</span>
            </Link>
            <a href="mailto:landchecktech@gmail.com">landchecktech@gmail.com</a>
            <a href="https://landcheck.online" target="_blank" rel="noopener noreferrer">landcheck.online</a>
            <span>LandCheck Geospatial Technologies Limited</span>
          </div>
          <div className="spl-footer-column">
            <h2>Products</h2>
            <Link to="/estates">LandCheck Estates</Link>
            <Link to="/green-partners">LandCheck Green</Link>
            <Link to="/survey">Survey Plan</Link>
            <Link to="/flood">Flood Risk Analysis</Link>
          </div>
          <div className="spl-footer-column">
            <h2>Tools</h2>
            <Link to="/survey-plan">Survey workspace</Link>
            <Link to="/hazard-analysis">Hazard analysis</Link>
            <a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Support">Support</a>
          </div>
          <div className="spl-footer-column">
            <h2>For</h2>
            <a href="#for-surveyors">For Surveyors</a>
            <a href="#for-estates">For Estates</a>
            <Link to="/privacy">Privacy</Link>
          </div>
          <div className="spl-footer-column">
            <h2>Social</h2>
            {socialLinks.map((item) => (
              <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
            ))}
          </div>
        </div>
        <div className="spl-footer-bottom">
          <span>© {new Date().getFullYear()} LandCheck Geospatial Technologies Limited</span>
          <Link to={signedIn ? "/dashboard" : "/survey-plan"}>{signedIn ? "Open dashboard" : "Open survey workspace"}</Link>
        </div>
      </footer>

      {signInOpen && (
        <Suspense fallback={null}>
          <SignupGateModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
