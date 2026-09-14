import { Link } from "react-router-dom";
import "../styles/estate-portal.css";

const workflow = [
  ["01", "Bring in the layout", "Import survey coordinates, CSV, GeoJSON, DXF or a scanned plan."],
  ["02", "Approve spatial truth", "Review plots, blocks, roads and geometry checks before publishing the register."],
  ["03", "Run the commercial register", "Reserve plots, allocate buyers, track payments and keep documents against the parcel."],
  ["04", "Deliver the plot", "Prepare Survey outputs and DGPS staking files, then track development from the web dashboard."],
];

export default function EstateLanding() {
  return (
    <main className="estate-portal">
      <nav className="estate-portal-nav" aria-label="Estate product navigation">
        <Link to="/estates" className="estate-wordmark"><span>LANDCHECK</span><strong>ESTATES</strong></Link>
        <div className="estate-portal-nav-links"><a href="#workflow">Workflow</a><a href="#intelligence">Intelligence</a><Link to="/estates/login" className="estate-nav-login">Sign in</Link><Link to="/estates/register" className="estate-button estate-button--small">Register company</Link></div>
      </nav>
      <section className="estate-hero">
        <div className="estate-hero-copy"><p className="estate-kicker">The operating system for estate developers</p><h1>Turn a land layout into a working estate.</h1><p className="estate-hero-lede">LandCheck Estates brings your survey data, approved plot register, customers, collections and delivery workflow into one web workspace.</p><div className="estate-hero-actions"><Link to="/estates/register" className="estate-button">Create your company workspace <span aria-hidden="true">-&gt;</span></Link><Link to="/estates/login" className="estate-text-link">Already registered? Sign in</Link></div><div className="estate-hero-proof"><span>Web-first</span><span>Parcel-centred</span><span>Survey-ready</span></div></div>
        <div className="estate-hero-visual" aria-label="Estate operations overview"><div className="estate-visual-grid" /><div className="estate-map-card"><div className="estate-map-card-top"><span>ESTATE REGISTER</span><b>LIVE</b></div><div className="estate-mini-map"><i className="plot plot--available" /><i className="plot plot--sold" /><i className="plot plot--reserved" /><i className="plot plot--available" /><i className="plot plot--sold" /><i className="plot plot--available" /><span className="estate-road estate-road--one" /><span className="estate-road estate-road--two" /></div><div className="estate-map-card-footer"><strong>Northfield Gardens</strong><span>248 plots - 3 blocks</span></div></div><div className="estate-float-card estate-float-card--cash"><small>COLLECTED</small><strong>NGN 84.6m</strong><span>Up 12.4% this quarter</span></div><div className="estate-float-card estate-float-card--queue"><small>DELIVERY QUEUE</small><strong>18 plots</strong><span>Awaiting staking</span></div></div>
      </section>
      <section className="estate-trust-strip"><span>BUILT FOR PROPERTY DEVELOPERS</span><span>Survey data stays authoritative</span><span>Every action is auditable</span><span>No field app required for daily operations</span></section>
      <section className="estate-workflow-section" id="workflow"><div className="estate-section-heading"><p className="estate-kicker">One connected workflow</p><h2>From boundary to buyer to build.</h2><p>Start with the land you already have. LandCheck keeps the parcel as the source of truth while your team moves the project forward.</p></div><div className="estate-workflow-grid">{workflow.map(([number, title, detail]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{detail}</p></article>)}</div></section>
      <section className="estate-intelligence-section" id="intelligence"><div><p className="estate-kicker">Land intelligence before commitment</p><h2>See constraints before they become expensive.</h2><p>Keep estate-level screening and plot-level screening separate. Review floodplain and low-lying susceptibility, erosion indicators, terrain and other available constraints alongside the operational map.</p><Link to="/estates/register" className="estate-text-link estate-text-link--light">Open an Estate workspace <span aria-hidden="true">-&gt;</span></Link></div><div className="estate-intelligence-list"><div><b>LAND</b><span>Boundary - terrain - flood - erosion</span></div><div><b>PLANNING</b><span>Blocks - plots - roads - open spaces</span></div><div><b>COMMERCIAL</b><span>Customers - allocations - payments</span></div><div><b>DELIVERY</b><span>Survey - staking - development</span></div></div></section>
      <footer className="estate-portal-footer"><Link to="/estates" className="estate-wordmark"><span>LANDCHECK</span><strong>ESTATES</strong></Link><span>Spatial truth for property development.</span><Link to="/estates/login">Sign in to workspace</Link></footer>
    </main>
  );
}
