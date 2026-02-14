import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/green-partners.css";

type DemoShot = { src: string; label: string };
type CapabilityHighlight = { title: string; detail: string };

const demoShots: DemoShot[] = [
  { src: "/Screenshotgreen.png", label: "LandCheck Green - Field dashboard and project controls" },
  { src: "/screenshotlandche green 2.png", label: "LandCheck Green - Mobile operations and status flow" },
  { src: "/Screenshot lndcheck work.png", label: "LandCheck Work - Assignment and operations board" },
  { src: "/Screenshot landcheck work 2.png", label: "LandCheck Work - Team task execution and supervision" },
  { src: "/Screenshot landcheck report.png", label: "Program reporting for partners, donors, and agencies" },
  { src: "/Screenshot landcheck report 2.png", label: "Decision-ready reporting outputs from active projects" },
];

const capabilityHighlights: CapabilityHighlight[] = [
  {
    title: "Field Capture + Verification",
    detail: "GPS tree capture with species, status, notes, and photo evidence.",
  },
  {
    title: "Operations Command",
    detail: "Assign planting and maintenance by staff, project, and tree.",
  },
  {
    title: "Live Maintenance Intelligence",
    detail: "Rainy and dry season due-cycle monitoring with risk signals.",
  },
  {
    title: "Species Lifecycle Governance",
    detail: "Peg species maturity years and close cycles at the right stage.",
  },
  {
    title: "Tree-Level Accountability",
    detail: "Open each tree to review history, ownership, and task timeline.",
  },
  {
    title: "Decision-Ready Reporting",
    detail: "Generate structured CSV/PDF evidence for partners and funders.",
  },
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
        </button>
        <a className="gp-top-cta" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Partnership">
          Partner: landchecktech@gmail.com
        </a>
      </header>

      <main className="gp-stage">
        <section className="gp-copy-panel">
          <p className="gp-kicker">Restoration Intelligence Platform</p>
          <h1>Professional Program Control for Climate Partnerships</h1>
          <p className="gp-subtitle">
            LandCheck Green + Work gives implementers, regulators, and funders one transparent system to execute,
            verify, and report tree programs from planting through long-term maintenance.
          </p>

          <div className="gp-audience-row">
            <span>NGOs</span>
            <span>Government Agencies</span>
            <span>Donors</span>
            <span>Investors</span>
            <span>CSR Programs</span>
            <span>Environmental Organizations</span>
          </div>

          <div className="gp-capability-grid">
            {capabilityHighlights.map((item) => (
              <div key={item.title} className="gp-capability-item">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="gp-impact-row">
            <div>
              <span>Operational Trust</span>
              <strong>Real-time team and field visibility</strong>
            </div>
            <div>
              <span>Audit Confidence</span>
              <strong>Tree-level evidence and timelines</strong>
            </div>
            <div>
              <span>Funding Assurance</span>
              <strong>Structured outputs for partner reporting</strong>
            </div>
          </div>
        </section>

        <section className="gp-demo-panel">
          <div className="gp-demo-frame">
            {demoShots.map((shot, index) => (
              <img
                key={shot.src}
                className={`gp-demo-image ${index === activeShot ? "active" : ""}`}
                src={encodeURI(shot.src)}
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
