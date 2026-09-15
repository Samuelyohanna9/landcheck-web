import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "../styles/estate-portal.css";

const workflow = [
  ["01", "Bring in the layout", "Import survey coordinates, CSV, GeoJSON, DXF or a scanned plan."],
  ["02", "Approve spatial truth", "Review plots, blocks, roads and geometry checks before publishing the register."],
  ["03", "Run the commercial register", "Reserve plots, allocate buyers, track payments and keep documents against the parcel."],
  ["04", "Deliver the plot", "Prepare Survey outputs and DGPS staking files, then track development from the web dashboard."],
];

const capabilities: Array<{ title: string; detail: string; icon: ReactNode }> = [
  {
    title: "Hazard analysis",
    detail: "Screen flood risk, erosion susceptibility and general vulnerability for a single plot, or run the whole layout in one pass. Results update on the estate dashboard the moment it finishes - no separate report to go and chase down.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5 21 19.5H3L12 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="16.6" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Survey plan production",
    detail: "Generate a clean, branded site layout plan straight from the approved plot register - red parent boundary, black subdivisions, a graphical scale bar, north arrow and legend, sized from A0 down to A4, with or without buyer names for marketing use.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="3.5" width="16" height="17" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="1.4" />
        <path d="m13.6 10-1.1 2.8-2.8 1.1 1.1-2.8 2.8-1.1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "DGPS export",
    detail: "Export stakeout-ready coordinates for one plot or the whole layout at once, in Minna datum, Nigeria's UTM zones, or its West, Mid and East cadastral belts - whichever your field team already works in.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21s-6.5-5.6-6.5-10.8A6.5 6.5 0 0 1 12 3.5a6.5 6.5 0 0 1 6.5 6.7C18.5 15.4 12 21 12 21Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    title: "Commission tracking",
    detail: "A single-level, volume-tiered commission ladder modelled on how Nigerian agencies actually pay their agents - rates step up automatically as an agent closes more, and every payout is recorded with a receipt, not a spreadsheet.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="6.5" width="17" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.5 10.5h17" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" />
      </svg>
    ),
  },
];

const nigeriaPoints = [
  ["Priced in Naira", "Every contract price, collection and commission figure is in NGN throughout - never a converted placeholder."],
  ["Nigerian coordinate systems", "Coordinate exports support Minna datum, Nigeria's UTM zones and its West, Mid and East cadastral belts, not just WGS84."],
  ["A commission structure agents recognise", "Single-level and volume-tiered, matching documented Nigerian agency practice - not a multi-level recruiting structure."],
  ["Reservation before allocation", "A plot can be held on a deposit and only becomes officially Allocated once fully paid, the way estates here actually sell."],
];

export default function EstateLanding() {
  return (
    <main className="estate-portal">
      <nav className="estate-portal-nav" aria-label="Estate product navigation">
        <Link to="/estates" className="estate-wordmark"><span>LANDCHECK</span><strong>ESTATES</strong></Link>
        <div className="estate-portal-nav-links">
          <a href="#workflow">Workflow</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#intelligence">Intelligence</a>
          <Link to="/estates/login" className="estate-nav-login">Sign in</Link>
          <Link to="/estates/register" className="estate-button estate-button--small">Register company</Link>
        </div>
      </nav>

      <section className="estate-hero">
        <div className="estate-hero-copy">
          <p className="estate-kicker">The operating system for estate developers</p>
          <h1>Turn a land layout into a working estate.</h1>
          <p className="estate-hero-lede">
            LandCheck Estates brings your survey data, approved plot register, hazard screening, survey plan production,
            DGPS exports, customers, collections, commissions and delivery workflow into one web workspace.
          </p>
          <div className="estate-hero-actions">
            <Link to="/estates/register" className="estate-button">Create your company workspace <span aria-hidden="true">-&gt;</span></Link>
            <Link to="/estates/login" className="estate-text-link">Already registered? Sign in</Link>
          </div>
          <div className="estate-hero-proof"><span>Web-first</span><span>Parcel-centred</span><span>Survey-ready</span></div>
        </div>
        <div className="estate-hero-visual" aria-label="Estate operations overview">
          <div className="estate-visual-grid" />
          <div className="estate-map-card">
            <div className="estate-map-card-top"><span>ESTATE REGISTER</span><b>LIVE</b></div>
            <div className="estate-mini-map">
              <i className="plot plot--available" /><i className="plot plot--sold" /><i className="plot plot--reserved" />
              <i className="plot plot--available" /><i className="plot plot--sold" /><i className="plot plot--available" />
              <span className="estate-road estate-road--one" /><span className="estate-road estate-road--two" />
            </div>
            <div className="estate-map-card-footer"><strong>Northfield Gardens</strong><span>248 plots - 3 blocks</span></div>
          </div>
          <div className="estate-float-card estate-float-card--cash"><small>COLLECTED</small><strong>NGN 84.6m</strong><span>Up 12.4% this quarter</span></div>
          <div className="estate-float-card estate-float-card--queue"><small>DELIVERY QUEUE</small><strong>18 plots</strong><span>Awaiting staking</span></div>
        </div>
      </section>

      <section className="estate-trust-strip">
        <span>BUILT FOR PROPERTY DEVELOPERS</span>
        <span>Survey data stays authoritative</span>
        <span>Every action is auditable</span>
        <span>No field app required for daily operations</span>
      </section>

      <section className="estate-workflow-section" id="workflow">
        <div className="estate-section-heading">
          <p className="estate-kicker">One connected workflow</p>
          <h2>From boundary to buyer to build.</h2>
          <p>Start with the land you already have. LandCheck keeps the parcel as the source of truth while your team moves the project forward.</p>
        </div>
        <div className="estate-workflow-grid">
          {workflow.map(([number, title, detail]) => (
            <article key={number}><span>{number}</span><h3>{title}</h3><p>{detail}</p></article>
          ))}
        </div>
      </section>

      <section className="estate-capabilities-section" id="capabilities">
        <div className="estate-section-heading">
          <p className="estate-kicker">Purpose-built modules</p>
          <h2>What actually gets a plot sold and delivered.</h2>
          <p>Four capabilities most estate teams still run through separate consultants, spreadsheets and field trips - handled inside the same register instead.</p>
        </div>
        <div className="estate-capabilities-grid">
          {capabilities.map((item) => (
            <article key={item.title} className="estate-capability-card">
              <span className="estate-capability-icon">{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="estate-intelligence-section" id="intelligence">
        <div>
          <p className="estate-kicker">Land intelligence before commitment</p>
          <h2>See constraints before they become expensive.</h2>
          <p>Keep estate-level screening and plot-level screening separate. Review floodplain and low-lying susceptibility, erosion indicators, terrain and other available constraints alongside the operational map.</p>
          <Link to="/estates/register" className="estate-text-link estate-text-link--light">Open an Estate workspace <span aria-hidden="true">-&gt;</span></Link>
        </div>
        <div className="estate-intelligence-list">
          <div><b>LAND</b><span>Boundary - terrain - flood - erosion</span></div>
          <div><b>PLANNING</b><span>Blocks - plots - roads - open spaces</span></div>
          <div><b>COMMERCIAL</b><span>Customers - allocations - payments - commissions</span></div>
          <div><b>DELIVERY</b><span>Survey - staking - development</span></div>
        </div>
      </section>

      <section className="estate-nigeria-section" id="nigeria">
        <div className="estate-section-heading">
          <p className="estate-kicker">Built for this market</p>
          <h2>Not a general real-estate tool adapted after the fact.</h2>
          <p>One of the first platforms built specifically around how Nigerian estate developers already operate, rather than a generic international product retrofitted with a Naira sign.</p>
        </div>
        <div className="estate-nigeria-grid">
          {nigeriaPoints.map(([title, detail]) => (
            <div key={title} className="estate-nigeria-item">
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="estate-portal-footer">
        <Link to="/estates" className="estate-wordmark"><span>LANDCHECK</span><strong>ESTATES</strong></Link>
        <span>Spatial truth for property development.</span>
        <Link to="/estates/login">Sign in to workspace</Link>
      </footer>
    </main>
  );
}
