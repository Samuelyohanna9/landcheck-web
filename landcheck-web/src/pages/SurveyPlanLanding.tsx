import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    title: "Survey plan production",
    description: "Enter or import coordinates, review the geometry, and prepare a clear survey plan for delivery.",
  },
  {
    title: "Georeference scanned plans",
    description: "Align a scanned plan with control points, then trace boundaries and features against the map.",
  },
  {
    title: "Parcel subdivision",
    description: "Create and review child plots from a parent parcel, with areas and dimensions kept in view.",
  },
  {
    title: "Coordinate and drawing tools",
    description: "Work with coordinate data, edit mapped features, and prepare CAD and PDF deliverables.",
  },
];

const workflow = [
  { title: "Bring in your data", detail: "Coordinates, a scanned plan, or an existing parcel." },
  { title: "Check and edit", detail: "Review geometry and make corrections on the map." },
  { title: "Prepare the plan", detail: "Set out the information needed for a professional drawing." },
  { title: "Export your work", detail: "Create a shareable plan or CAD-ready file." },
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
  const signedIn = isSurveyAuthed();

  useEffect(() => {
    scheduleSurveyPlanIdlePrefetch();
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
          <a href="#capabilities">Capabilities</a>
          <a href="#workflow">Workflow</a>
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
            <div className="spl-hero-screen">
              <img src="/survey%20%20plan%20preview.jpg" alt="" />
            </div>
          </div>
          <div className="spl-hero-shade" />
          <div className="spl-shell spl-hero-shell">
            <div className="spl-hero-copy">
              <p className="spl-kicker">LandCheck Survey</p>
              <h1 id="spl-hero-title">Survey work, clearly mapped.</h1>
              <p className="spl-hero-summary">
                Prepare survey plans, georeference scanned layouts and subdivide parcels in one browser workspace.
              </p>
              <div className="spl-hero-actions">
                <button type="button" className="spl-text-link spl-text-link--light" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
                  Open the survey workspace <span aria-hidden="true">↗</span>
                </button>
                <a className="spl-text-link spl-text-link--light-muted" href="#capabilities">
                  Explore capabilities
                </a>
              </div>
              <p className="spl-hero-note">Coordinate work, drafting and deliverables in one place.</p>
            </div>
          </div>
        </section>

        <section id="capabilities" className="spl-section spl-capabilities">
          <div className="spl-shell spl-capabilities-layout">
            <div className="spl-section-intro">
              <p className="spl-section-kicker">A practical survey workspace</p>
              <h2>From source data to a finished plan.</h2>
              <p>
                Move from coordinates or a scanned drawing to checked geometry and a professional output without breaking the workflow into separate tools.
              </p>
            </div>
            <ol className="spl-capability-list">
              {capabilities.map((item, index) => (
                <li key={item.title}>
                  <span className="spl-list-number">0{index + 1}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="workflow" className="spl-workflow">
          <div className="spl-shell">
            <div className="spl-workflow-intro">
              <p className="spl-section-kicker">One connected process</p>
              <h2>Bring in the work. Leave with a plan.</h2>
            </div>
            <ol className="spl-workflow-list">
              {workflow.map((step, index) => (
                <li key={step.title}>
                  <span className="spl-list-number">0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="spl-scan-section">
          <div className="spl-shell spl-scan-layout">
            <div>
              <p className="spl-section-kicker">For existing plans</p>
              <h2>Make scanned work usable again.</h2>
            </div>
            <div className="spl-scan-copy">
              <p>
                Read beacon labels and coordinates from a scanned schedule with AI assistance, then review the results. For scanned drawings, align the image with control points and trace the features you need.
              </p>
              <button type="button" className="spl-text-link" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
                Open georeferencing tools <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </section>

        <section className="spl-closing">
          <p className="spl-section-kicker">LandCheck Survey</p>
          <h2>Start your next survey in the browser.</h2>
          <button type="button" className="spl-text-link" onMouseEnter={warmSurveyEntry} onClick={openWorkspace}>
            Open the survey workspace <span aria-hidden="true">↗</span>
          </button>
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
