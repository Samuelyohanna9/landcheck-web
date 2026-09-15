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

const SignupGateModal = lazy(() => import("../components/SignupGateModal"));

const capabilities = [
  {
    title: "Prepare survey plans",
    description: "Enter coordinates, check the parcel and prepare a clear plan.",
  },
  {
    title: "Georeference scanned plans",
    description: "Align an existing drawing, then trace its boundaries on the map.",
  },
  {
    title: "Subdivide and export",
    description: "Create child parcels and export plans or CAD-ready files.",
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
  const [totalPlotsGenerated, setTotalPlotsGenerated] = useState<number | null>(null);
  const signedIn = isSurveyAuthed();

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
    <div className="spl-page">
      <header className="spl-nav">
        <Link to="/" className="spl-brand" aria-label="LandCheck home">
          <span>LandCheck</span>
          <span className="spl-brand-product">Survey</span>
        </Link>
        <nav className="spl-nav-links" aria-label="Survey navigation">
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
              <h1 id="spl-hero-title">Survey plans, made clear.</h1>
              <p className="spl-hero-summary">
                Prepare plans, georeference scans and subdivide parcels in one workspace.
              </p>
              <div className="spl-hero-actions">
                <button type="button" className="spl-text-link spl-text-link--light" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
                  Open survey workspace
                </button>
              </div>
              {totalPlotsGenerated !== null && (
                <p className="spl-hero-proof" aria-live="polite">
                  <strong>{totalPlotsGenerated.toLocaleString("en-NG")}</strong>
                  <span>survey plots generated</span>
                </p>
              )}
            </div>
          </div>
        </section>

        <section id="capabilities" className="spl-section spl-capabilities">
          <div className="spl-shell spl-capabilities-layout">
            <div className="spl-section-intro">
              <p className="spl-section-kicker">A practical survey workspace</p>
              <h2>From source data to finished plan.</h2>
              <p>
                Bring in coordinates or a scanned drawing, check the geometry and prepare the final plan in one place.
              </p>
            </div>
            <ul className="spl-capability-list">
              {capabilities.map((item) => (
                <li key={item.title}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="spl-workflow">
          <div className="spl-shell">
            <div className="spl-workflow-intro">
              <p className="spl-section-kicker">One connected workspace</p>
              <h2>Bring in the data. Finish the plan.</h2>
              <p>Import coordinates or a scan, review the map, then prepare and export your work.</p>
            </div>
          </div>
        </section>

        <section className="spl-scan-section">
          <div className="spl-shell spl-scan-layout">
            <div>
              <p className="spl-section-kicker">For existing plans</p>
              <h2>Make scanned plans usable.</h2>
            </div>
            <div className="spl-scan-copy">
              <p>
                Align a scanned drawing to the map, then trace and review its boundaries.
              </p>
              <button type="button" className="spl-text-link" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
                Open georeferencing tools
              </button>
            </div>
          </div>
        </section>

      </main>

      <footer className="spl-footer">
        <div className="spl-footer-main">
          <div className="spl-footer-brand">
            <Link to="/" className="spl-brand">
              <span>LandCheck</span>
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
