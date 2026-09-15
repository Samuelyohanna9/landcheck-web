import { Link } from "react-router-dom";
import "../styles/estate-portal.css";

const workflow = [
  ["01", "Bring in your layout", "Upload survey coordinates, a CAD or GIS drawing, a CSV, or a scanned plan."],
  ["02", "Review the estate map", "Check plot boundaries, numbering, roads and shared spaces before approving the register."],
  ["03", "Manage plots and buyers", "Track availability, reservations, allocations, customer details, payments and documents."],
  ["04", "Prepare and deliver", "Create survey and staking outputs, then keep development progress with the plot."],
];

const capabilities = [
  ["Estate layout", "Bring in an existing plan, review its geometry and publish the approved plots to your estate register."],
  ["Plot and customer records", "See each plot's status, buyer, agreed price, payment progress and documents together."],
  ["Payments and documents", "Record and review payments, keep receipt evidence private, and open customer statements."],
  ["Survey and staking", "Prepare survey work and export staking coordinates from the approved plot geometry."],
  ["Land intelligence", "Review available terrain, flood and erosion screening alongside the estate map."],
];

const marketDetails = [
  ["Local transactions", "Keep estate prices, payments and collections in Nigerian naira."],
  ["Survey-aware", "Move from approved plot geometry into LandCheck Survey outputs when the work is ready."],
  ["Office-first", "Manage the estate in the web workspace. Field evidence can support delivery, but it is not the daily operating flow."],
];

export default function EstateLanding() {
  return (
    <main className="estate-portal">
      <header className="estate-portal-nav">
        <Link to="/estates" className="estate-brand" aria-label="LandCheck Estates home">
          <img src="/logo.svg" alt="LandCheck" width="138" height="38" />
          <span>ESTATES</span>
        </Link>
        <nav className="estate-portal-nav-links" aria-label="Estate product navigation">
          <a href="#workflow">How it works</a>
          <a href="#capabilities">What you can do</a>
          <a href="#intelligence">Land intelligence</a>
          <Link to="/estates/login" className="estate-nav-login">Sign in</Link>
          <Link to="/estates/register" className="estate-nav-cta">Create account</Link>
        </nav>
      </header>

      <section className="estate-introduction" aria-labelledby="estate-intro-title">
        <div className="estate-intro-copy">
          <p className="estate-kicker">LandCheck Estates</p>
          <h1 id="estate-intro-title">From boundary to buyer to build.</h1>
        </div>
        <div className="estate-intro-summary">
          <p>Plan and run your estate from an approved map. Bring in your existing survey data, review the layout, then manage plots, customers, payments and delivery in one web workspace.</p>
          <div className="estate-intro-actions">
            <Link to="/estates/register" className="estate-button">Create a company account</Link>
            <Link to="/estates/login" className="estate-text-link">Sign in to your workspace</Link>
          </div>
        </div>
      </section>

      <figure className="estate-landscape" role="img" aria-label="A planned residential estate with plots, homes and internal roads">
        <figcaption><span>LANDCHECK ESTATES</span><span>One clear register for every plot.</span></figcaption>
      </figure>

      <div className="estate-principles" aria-label="Product principles">
        <span>Map-led planning</span>
        <span>Parcel-centred records</span>
        <span>Survey-ready delivery</span>
        <span>Web-first operations</span>
      </div>

      <section className="estate-content-section" id="workflow">
        <div className="estate-section-heading">
          <p className="estate-kicker">A connected workflow</p>
          <div>
            <h2>Keep the land, the plan and the sale in step.</h2>
            <p>Start with the survey or layout you already have. Each approved plot becomes the record your team can use as the project moves forward.</p>
          </div>
        </div>
        <ol className="estate-workflow-list">
          {workflow.map(([number, title, detail]) => (
            <li key={number}>
              <span className="estate-step-number">{number}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="estate-content-section estate-capabilities-section" id="capabilities">
        <div className="estate-section-heading">
          <p className="estate-kicker">The estate workspace</p>
          <div>
            <h2>Everything important stays with the plot.</h2>
            <p>Give your team one place to see what a plot is, who it belongs to and what needs to happen next.</p>
          </div>
        </div>
        <dl className="estate-capability-list">
          {capabilities.map(([title, detail], index) => (
            <div key={title}>
              <dt><span>{String(index + 1).padStart(2, "0")}</span>{title}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="estate-intelligence-section" id="intelligence">
        <div className="estate-intelligence-copy">
          <p className="estate-kicker">Understand the land</p>
          <h2>See the site before making the next decision.</h2>
          <p>Review available terrain and environmental screening at estate or plot level. Flood and erosion indicators stay distinct, so your team can understand what each result does and does not say.</p>
          <Link to="/estates/register" className="estate-text-link estate-text-link--light">Open an Estate workspace <span aria-hidden="true">&rarr;</span></Link>
        </div>
        <dl className="estate-intelligence-list">
          <div><dt>LAND</dt><dd>Boundary, terrain and screening</dd></div>
          <div><dt>LAYOUT</dt><dd>Plots, roads and shared spaces</dd></div>
          <div><dt>COMMERCIAL</dt><dd>Customers, payments and records</dd></div>
          <div><dt>DELIVERY</dt><dd>Survey, staking and development</dd></div>
        </dl>
      </section>

      <section className="estate-content-section estate-market-section">
        <div className="estate-section-heading">
          <p className="estate-kicker">Made for estate teams</p>
          <div>
            <h2>Built around how your project actually moves.</h2>
            <p>LandCheck Estates connects the approved map to the day-to-day work of selling and delivering plots.</p>
          </div>
        </div>
        <dl className="estate-market-list">
          {marketDetails.map(([title, detail]) => (
            <div key={title}><dt>{title}</dt><dd>{detail}</dd></div>
          ))}
        </dl>
      </section>

      <footer className="estate-portal-footer">
        <Link to="/estates" className="estate-brand" aria-label="LandCheck Estates home">
          <img src="/logo.svg" alt="LandCheck" width="126" height="35" />
          <span>ESTATES</span>
        </Link>
        <span>Spatial records for property development.</span>
        <Link to="/estates/login">Sign in to your workspace</Link>
      </footer>
    </main>
  );
}
