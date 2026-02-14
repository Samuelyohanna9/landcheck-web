import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/green-partners.css";

type DemoShot = { src: string; label: string };
type Capability = { title: string; detail: string };

const navItems = ["Who We Serve", "Platform", "Resource Library", "Partnerships"];

const demoShots: DemoShot[] = [
  { src: "/Screenshotgreen.png", label: "LandCheck Green - Field dashboard and project controls" },
  { src: "/screenshotlandche green 2.png", label: "LandCheck Green - Mobile operations and status flow" },
  { src: "/Screenshot lndcheck work.png", label: "LandCheck Work - Assignment and operations board" },
  { src: "/Screenshot landcheck work 2.png", label: "LandCheck Work - Team task execution and supervision" },
  { src: "/Screenshot landcheck report.png", label: "Program reporting for partners, donors, and agencies" },
  { src: "/Screenshot landcheck report 2.png", label: "Decision-ready reporting outputs from active projects" },
];

const capabilities: Capability[] = [
  {
    title: "Inventory + Field Capture",
    detail: "GPS tree capture with species, status, notes, and photo evidence.",
  },
  {
    title: "Maintenance + Work Orders",
    detail: "Assign and track planting and maintenance work by project, staff, and tree.",
  },
  {
    title: "Live Monitoring Intelligence",
    detail: "Season-based due-cycle monitoring with risk indicators and lifecycle controls.",
  },
  {
    title: "Program Reporting",
    detail: "Export structured CSV/PDF outputs for agencies, donors, investors, and collaborations.",
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
      <header className="gp-nav">
        <button type="button" className="gp-nav-brand" onClick={() => navigate("/")}>
          <img src="/green logo.png" alt="LandCheck Green" />
        </button>

        <nav className="gp-nav-links" aria-label="Partner navigation">
          {navItems.map((item) => (
            <button key={item} type="button">
              {item}
            </button>
          ))}
        </nav>

        <a className="gp-nav-cta" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Partnership">
          Free Consultation
        </a>
      </header>

      <section className="gp-hero-banner">
        <div className="gp-hero-tint" />
        <div className="gp-hero-copy">
          <p>TREE PROGRAM SOFTWARE</p>
          <h1>LANDCHECK GREEN + WORK</h1>
          <span>INVENTORY, MONITORING, MAINTENANCE, OUTREACH, REPORTING, WORK ORDERS</span>
        </div>
      </section>

      <main className="gp-suite">
        <section className="gp-suite-copy">
          <h2>RESTORATION SOFTWARE SUITE</h2>
          <p>
            LandCheck Green + Work provides an operational system for NGOs, environmental organizations, government
            agencies, donors, investors, and CSR programs to execute and verify tree projects with confidence.
          </p>

          <div className="gp-audience-row">
            <span>NGOs</span>
            <span>Government Agencies</span>
            <span>Donors + Investors</span>
            <span>Environmental Organizations</span>
          </div>

          <div className="gp-capability-grid">
            {capabilities.map((item) => (
              <article key={item.title} className="gp-capability-card">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="gp-proof-row">
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
              <strong>Season + lifecycle controls</strong>
            </div>
          </div>
        </section>

        <section className="gp-suite-demo">
          <div className="gp-demo-frame">
            {demoShots.map((shot, index) => (
              <img
                key={shot.src}
                className={`gp-demo-image ${index === activeShot ? "active" : ""}`}
                src={encodeURI(shot.src)}
                alt={shot.label}
              />
            ))}
            <div className="gp-demo-label">{demoShots[activeShot].label}</div>
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

          <a className="gp-suite-cta" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Pilot%20Request">
            Partner: landchecktech@gmail.com
          </a>
        </section>
      </main>
    </div>
  );
}

