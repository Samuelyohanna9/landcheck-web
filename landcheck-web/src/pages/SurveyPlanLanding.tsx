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

type WorkflowPanel = {
  title: string;
  detail: string;
  caption: string;
};

const capabilityStrip = [
  "Survey plan drafting",
  "Raster georeferencing",
  "Plot subdivision",
  "Interactive CAD editor",
  "PDF, CSV, and CAD exports",
];

const workflowPanels: WorkflowPanel[] = [
  {
    title: "Survey plan production",
    detail: "Capture raw parcel coordinates, set presentation details, and render a formal plan sheet from the browser.",
    caption: "Coordinate intake to official preview",
  },
  {
    title: "Georeference scanned plans",
    detail: "Anchor JPEG or PNG survey sheets against real control points, then continue into digitizing and staking exports.",
    caption: "Ground control pairing and anchored raster review",
  },
  {
    title: "Subdivision workspace",
    detail: "Split a parent parcel by count, area, fraction, or custom allocation and keep every resulting lot traceable.",
    caption: "Subdivision logic with controlled lot outputs",
  },
  {
    title: "Interactive CAD editor",
    detail: "Refine roads, buildings, rivers, fences, and boundary intent inside a drafting environment built for survey review.",
    caption: "Browser CAD editing without desktop overhead",
  },
  {
    title: "Final export package",
    detail: "Issue plan PDFs, orthophoto sheets, topographic outputs, CSV stakeout files, and DWG or DXF handoff files.",
    caption: "Client-ready and field-ready exports",
  },
];

const coreCapabilities = [
  {
    title: "Survey plan drafting",
    detail: "Move from coordinate entry to a finished parcel sheet with formal metadata, paper sizing, and plot preview control.",
  },
  {
    title: "Subdivision engine",
    detail: "Generate new lots from one parent parcel using count-based, area-based, fractional, or custom allocation rules.",
  },
  {
    title: "Raster georeferencing",
    detail: "Upload scanned plans, place control points, solve the transform, digitize features, and continue the job in one flow.",
  },
  {
    title: "Interactive CAD editor",
    detail: "Adjust boundary-aware linework, inspect geometry, and prepare cleaner outputs without leaving the browser session.",
  },
  {
    title: "Export pack",
    detail: "Deliver survey plan PDFs, orthophoto PDFs, topographic sheets, staking CSVs, and CAD handoff files from the same job.",
  },
];

const productionRoutes = [
  {
    title: "Survey Plan",
    detail: "Standard parcel drafting and official sheet generation from entered coordinates.",
    action: "Open survey plan",
  },
  {
    title: "Subdivision",
    detail: "Parent-plot splitting with batch review, lot naming, and clean-copy outputs.",
    action: "Open subdivision",
  },
  {
    title: "Georeference",
    detail: "Scanned raster control, digitizing, and CSV export for field staking workflows.",
    action: "Open georeference",
  },
];

const exportOutputs = [
  "Plan sheet PDF",
  "Orthophoto PDF",
  "Topographic PDF",
  "Computation sheet",
  "CSV stakeout",
  "DWG / DXF",
];

export default function SurveyPlanLanding() {
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState(0);

  useEffect(() => {
    scheduleSurveyPlanIdlePrefetch();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePanel((current) => (current + 1) % workflowPanels.length);
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

  const activeWorkflow = workflowPanels[activePanel];

  return (
    <div className="spl-page">
      <NavBar fixed overlay activeRoute="/survey" ctaLabel="Open Survey Plan" ctaRoute="/survey-plan" />

      <main>
        <section className="spl-hero">
          <div className="spl-hero-overlay" />
          <div className="spl-shell spl-hero-shell">
            <div className="spl-hero-copy">
              <span className="spl-kicker">LandCheck Survey Plan</span>
              <h1>Survey drafting, georeferencing, and export in one web workflow.</h1>
              <p>
                Build clean parcel sheets, run subdivisions, georeference scanned plans, and issue field-ready outputs
                without moving between disconnected tools.
              </p>
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
                  View Capabilities
                </a>
              </div>
              <div className="spl-capability-strip" aria-label="Survey plan capabilities">
                {capabilityStrip.map((item) => (
                  <span key={item} className="spl-capability-pill">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="spl-hero-visual" aria-live="polite">
              <div className="spl-screen-frame">
                <div className="spl-screen-topline">
                  <span className="spl-screen-dot" />
                  <span>Survey workflow</span>
                </div>
                <div className="spl-screen-body">
                  <div className="spl-screen-stage">
                    <span className="spl-screen-stage-label">Current focus</span>
                    <h2>{activeWorkflow.title}</h2>
                    <p>{activeWorkflow.detail}</p>
                  </div>
                  <div className="spl-screen-rail" aria-hidden="true">
                    {workflowPanels.map((panel, index) => (
                      <div
                        key={panel.title}
                        className={`spl-screen-rail-item${index === activePanel ? " is-active" : ""}`}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{panel.title}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="spl-screen-footer">
                  <strong>{activeWorkflow.caption}</strong>
                  <span>Designed for reliable field outputs on poor or unstable networks.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="survey-capabilities" className="spl-section spl-section--light">
          <div className="spl-shell spl-section-shell">
            <div className="spl-section-intro">
              <span className="spl-section-kicker">Core capabilities</span>
              <h2>Everything needed for a professional survey job, kept in a cleaner flow.</h2>
              <p>
                The platform covers drafting, scanned-plan recovery, subdivision logic, browser editing, and final
                delivery without loading the page with unnecessary interface noise.
              </p>
            </div>

            <div className="spl-capability-list">
              {coreCapabilities.map((item, index) => (
                <article key={item.title} className="spl-capability-row">
                  <span className="spl-capability-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="spl-section spl-section--paper">
          <div className="spl-shell spl-section-shell">
            <div className="spl-section-intro spl-section-intro--narrow">
              <span className="spl-section-kicker">Production routes</span>
              <h2>Choose the route that matches the job.</h2>
            </div>

            <div className="spl-routes-grid">
              {productionRoutes.map((route) => (
                <article key={route.title} className="spl-route-column">
                  <h3>{route.title}</h3>
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
              <span className="spl-export-label">Exports</span>
              <div className="spl-export-pills">
                {exportOutputs.map((item) => (
                  <span key={item} className="spl-export-pill">
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
              <span className="spl-section-kicker">Ready to draft</span>
              <h2>Open Survey Plan and start the next job.</h2>
              <p>
                Enter coordinates, preview the parcel, refine the sheet, and issue the export package from one browser
                session.
              </p>
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
            <span>LandCheck Survey Plan for parcel drafting, subdivision, and georeferencing.</span>
            <SocialLinks className="spl-footer-social" />
          </div>
        </footer>
      </main>
    </div>
  );
}
