import { useNavigate } from "react-router-dom";
import "../styles/green-partners.css";

type Capability = { title: string; detail: string };

const navItems = ["Who We Serve", "Platform", "Resource Library", "Partnerships"];

const laptopScreenshot = "/Screenshot lndcheck work.png";
const phoneScreenshot = "/Screenshotgreen.png";

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
          <h2>TREE PLANTING AND MONITORING SOFTWARE</h2>
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
          <div className="gp-device-showcase">
            <div className="gp-laptop">
              <div className="gp-laptop-screen">
                <img src={encodeURI(laptopScreenshot)} alt="LandCheck Work on laptop" />
              </div>
              <div className="gp-laptop-base" />
            </div>

            <div className="gp-phone">
              <div className="gp-phone-notch" />
              <div className="gp-phone-screen">
                <img src={encodeURI(phoneScreenshot)} alt="LandCheck Green on phone" />
              </div>
              <div className="gp-phone-home" />
            </div>
          </div>

          <div className="gp-device-labels">
            <span>Laptop view: LandCheck Work</span>
            <span>Phone view: LandCheck Green</span>
          </div>

          <a className="gp-suite-cta" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Pilot%20Request">
            Partner: landchecktech@gmail.com
          </a>
        </section>
      </main>
    </div>
  );
}
