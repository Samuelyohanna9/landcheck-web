import { useNavigate } from "react-router-dom";
import "../styles/green-partners.css";

type Capability = {
  title: string;
  detail: string;
  bullets: string[];
};

type PartnerTrack = {
  title: string;
  detail: string;
  outcomes: string[];
};

const capabilities: Capability[] = [
  {
    title: "Project Command Center",
    detail: "Create and manage restoration projects with active project focus and structured execution views.",
    bullets: ["Project setup with location context", "Action-driven workspace", "Cross-team project visibility"],
  },
  {
    title: "Field Tree Capture + Evidence",
    detail: "Capture trees on-map with GPS coordinates, species, planting date, status, notes, and photo evidence.",
    bullets: ["Map-based tree creation", "Mobile camera upload", "Auto-linked tree photo records"],
  },
  {
    title: "Live Workforce Coordination",
    detail: "Assign planting and maintenance to specific staff and monitor status across teams.",
    bullets: ["User board with role and status", "Task assignment by tree and assignee", "Per-user operational filtering"],
  },
  {
    title: "Season-Based Maintenance Intelligence",
    detail: "Run live maintenance scheduling with rainy/dry models and species maturity peg years by project.",
    bullets: ["Live due-cycle table", "Risk indicators for overdue work", "Species lifecycle closure logic"],
  },
  {
    title: "Tree-Level Accountability",
    detail: "Open any tree to see maintenance history, who worked on it, status, and timeline records.",
    bullets: ["Tree sidebar inspection", "Task-level done/pending/overdue totals", "Timeline and maintenance traces"],
  },
  {
    title: "Decision-Ready Reporting",
    detail: "Export project and operational outputs for governance reviews, donor updates, and program reporting.",
    bullets: ["CSV/PDF exports", "Map-aware reporting", "Tree and maintenance summary outputs"],
  },
];

const partnerTracks: PartnerTrack[] = [
  {
    title: "NGOs & Environmental Organizations",
    detail: "Run reforestation programs with transparent field execution and verifiable monitoring.",
    outcomes: ["Track survival beyond planting day", "View staff output by project and assignee", "Share structured donor-ready updates"],
  },
  {
    title: "Government Agencies",
    detail: "Coordinate public restoration activities with stronger operational control and field evidence.",
    outcomes: ["Monitor regional teams with one system", "Identify overdue interventions early", "Improve policy reporting confidence"],
  },
  {
    title: "Donors, CSR & Climate Funds",
    detail: "Gain visibility into what was planted, maintained, and completed across funded programs.",
    outcomes: ["Tree-level traceability", "Status-based risk alerts", "Standardized reporting pathways"],
  },
  {
    title: "Research & Monitoring Teams",
    detail: "Use structured records to evaluate implementation quality and operational performance over time.",
    outcomes: ["Species-level lifecycle parameters", "Maintenance completion evidence", "Consistent project datasets"],
  },
];

const deliveryFlow = [
  "Define program goals, geographies, and partner teams.",
  "Onboard staff and start project operations in Green + Work.",
  "Capture trees, assign maintenance, and monitor live due cycles.",
  "Export verified progress updates for stakeholders and funders.",
];

export default function GreenPartnersLanding() {
  const navigate = useNavigate();

  return (
    <div className="green-partners-page">
      <header className="gp-topbar">
        <button type="button" className="gp-brand" onClick={() => navigate("/")}>
          <img src="/green logo.png" alt="LandCheck Green" />
          <span>LandCheck Green + Work</span>
        </button>
        <div className="gp-top-actions">
          <button type="button" className="gp-top-link" onClick={() => navigate("/green")}>
            Open Green
          </button>
          <button type="button" className="gp-top-link" onClick={() => navigate("/green-work")}>
            Open Work
          </button>
          <a className="gp-top-cta" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Partnership">
            Partner With Us
          </a>
        </div>
      </header>

      <section className="gp-hero">
        <div className="gp-hero-panel" data-animate>
          <p className="gp-kicker">Built for NGOs, Governments, Donors, and Climate Programs</p>
          <h1>Turn Tree Planting Into Verifiable Long-Term Impact</h1>
          <p className="gp-subtitle">
            LandCheck Green + LandCheck Work connects field operations, maintenance intelligence, and tree-level evidence
            so restoration partners can manage execution with confidence.
          </p>
          <div className="gp-hero-actions">
            <a className="gp-btn gp-btn-primary" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Collaboration">
              Start Collaboration
            </a>
            <button type="button" className="gp-btn gp-btn-soft" onClick={() => navigate("/green-work")}>
              Explore Operations App
            </button>
          </div>
          <div className="gp-hero-stats">
            <div>
              <span>Verified Trees</span>
              <strong>Map + species + photo records</strong>
            </div>
            <div>
              <span>Live Supervision</span>
              <strong>Per-user assignments and progress</strong>
            </div>
            <div>
              <span>Maintenance Intelligence</span>
              <strong>Season model + species lifecycle pegs</strong>
            </div>
          </div>
        </div>
      </section>

      <main className="gp-main">
        <section className="gp-section">
          <div className="gp-head">
            <p>Platform Capability</p>
            <h2>What Green + Work Already Delivers</h2>
          </div>
          <div className="gp-capability-grid">
            {capabilities.map((item) => (
              <article key={item.title} className="gp-card" data-animate>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <ul>
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="gp-section gp-section-alt">
          <div className="gp-head">
            <p>Collaboration Models</p>
            <h2>How Partners Can Work With LandCheck</h2>
          </div>
          <div className="gp-track-grid">
            {partnerTracks.map((track) => (
              <article key={track.title} className="gp-track" data-animate>
                <h3>{track.title}</h3>
                <p>{track.detail}</p>
                <ul>
                  {track.outcomes.map((outcome) => (
                    <li key={outcome}>{outcome}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="gp-section">
          <div className="gp-head">
            <p>Deployment Path</p>
            <h2>Partner Rollout in 4 Steps</h2>
          </div>
          <div className="gp-flow">
            {deliveryFlow.map((step, index) => (
              <article key={step} className="gp-flow-step" data-animate>
                <span>{index + 1}</span>
                <p>{step}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="gp-cta" data-animate>
          <h2>Let’s Build High-Integrity Restoration Programs Together</h2>
          <p>
            If you are funding, running, or supervising restoration projects, we can support a pilot and scale pathway
            tailored to your program structure.
          </p>
          <a className="gp-btn gp-btn-primary" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Pilot%20Request">
            Contact: landchecktech@gmail.com
          </a>
        </section>
      </main>
    </div>
  );
}

