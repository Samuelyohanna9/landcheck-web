import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/green-partners.css";

type DemoShot = { src: string; label: string };

const demoShots: DemoShot[] = [
  { src: "/Screenshotgreen.png", label: "LandCheck Green - Field dashboard and project controls" },
  { src: "/screenshotlandche green 2.png", label: "LandCheck Green - Mobile operations and status flow" },
  { src: "/Screenshot lndcheck work.png", label: "LandCheck Work - Assignment and operations board" },
  { src: "/Screenshot landcheck work 2.png", label: "LandCheck Work - Team task execution and supervision" },
  { src: "/Screenshot landcheck report.png", label: "Program reporting for partners, donors, and agencies" },
  { src: "/Screenshot landcheck report 2.png", label: "Decision-ready reporting outputs from active projects" },
];

const capabilityHighlights = [
  "Project-based reforestation command center",
  "GPS tree capture with species, status, and notes",
  "Auto-linked tree photo evidence to cloud storage",
  "Live tree map with tree-level detail sidebar",
  "Task assignment by staff, tree, and maintenance type",
  "Rainy and dry season due-cycle modeling",
  "Species peg years and lifecycle closure logic",
  "Overdue and risk indicators for supervisors",
  "Per-staff performance and operational summaries",
  "CSV and PDF project/work reporting exports",
];

export default function GreenPartnersLanding() {
  const navigate = useNavigate();
  const [activeShot, setActiveShot] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveShot((prev) => (prev + 1) % demoShots.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="green-partners-page">
      <header className="gp-topbar">
        <button type="button" className="gp-brand" onClick={() => navigate("/")}>
          <img src="/green logo.png" alt="LandCheck Green" />
          <span>LandCheck Green + Work</span>
        </button>
        <a className="gp-top-cta" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Partnership">
          Partner: landchecktech@gmail.com
        </a>
      </header>

      <main className="gp-stage">
        <section className="gp-copy-panel">
          <p className="gp-kicker">Restoration Intelligence Platform</p>
          <h1>Built to Attract Serious Climate Partners</h1>
          <p className="gp-subtitle">
            LandCheck Green + Work gives NGOs, environmental organizations, government agencies, donors, and investors a
            transparent system for managing tree programs from planting to long-term maintenance outcomes.
          </p>

          <div className="gp-audience-row">
            <span>NGOs</span>
            <span>Government</span>
            <span>Donors</span>
            <span>Investors</span>
            <span>CSR Programs</span>
            <span>Environmental Orgs</span>
          </div>

          <div className="gp-capability-grid">
            {capabilityHighlights.map((item) => (
              <div key={item} className="gp-capability-item">
                {item}
              </div>
            ))}
          </div>

          <div className="gp-impact-row">
            <div>
              <span>Execution Visibility</span>
              <strong>Live staff and task monitoring</strong>
            </div>
            <div>
              <span>Data Integrity</span>
              <strong>Tree-level evidence and timelines</strong>
            </div>
            <div>
              <span>Operational Intelligence</span>
              <strong>Season model + lifecycle controls</strong>
            </div>
          </div>
        </section>

        <section className="gp-demo-panel">
          <div className="gp-demo-frame">
            {demoShots.map((shot, index) => (
              <img
                key={shot.src}
                className={`gp-demo-image ${index === activeShot ? "active" : ""}`}
                src={shot.src}
                alt={shot.label}
              />
            ))}
            <div className="gp-demo-overlay">
              <p>{demoShots[activeShot].label}</p>
            </div>
          </div>

          <div className="gp-demo-dots">
            {demoShots.map((shot, index) => (
              <button
                key={shot.src}
                type="button"
                className={index === activeShot ? "active" : ""}
                onClick={() => setActiveShot(index)}
                aria-label={`Show screenshot ${index + 1}`}
              />
            ))}
          </div>

          <a className="gp-main-cta" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Pilot%20Request">
            Request Partnership Deck
          </a>
        </section>
      </main>
    </div>
  );
}
