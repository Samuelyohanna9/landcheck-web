import { Link } from "react-router-dom";
import "../styles/estate-portal.css";

const DEMO_MAILTO = "mailto:landchecktech@gmail.com?subject=LandCheck%20Estates%20demo%20request";

const connectedCapabilities = [
  "Automatic layout design",
  "Georeference and digitise",
  "Customers and allocations",
  "Payments and commissions",
  "Professional survey plans",
  "Field-ready coordinates",
];

const solutionAreas = ["Development", "Sales", "Finance", "Survey"];

export default function EstateLanding() {
  return (
    <main className="estate-portal">
      <header className="estate-portal-nav">
        <Link to="/estates" className="estate-brand" aria-label="LandCheck Estates home">
          <img src="/logo.svg" alt="LandCheck" width="138" height="38" />
          <span>ESTATES</span>
        </Link>
        <nav className="estate-portal-nav-links" aria-label="Estate product navigation">
          <a href="#platform">Platform</a>
          <a href="#solutions">Solutions</a>
          <a href="#demo">Pricing</a>
          <Link to="/estates/login" className="estate-nav-login">Sign in</Link>
          <a href={DEMO_MAILTO} className="estate-nav-cta">Request a demo</a>
        </nav>
      </header>

      <section className="estate-introduction--centered" aria-labelledby="estate-intro-title">
        <p className="estate-kicker">LandCheck Estates</p>
        <h1 id="estate-intro-title">Manage every estate from one place.</h1>
        <p className="estate-intro-summary-text">Design layouts, manage plots and buyers, track payments and commissions, and generate professional survey plans.</p>
        <div className="estate-intro-actions estate-intro-actions--centered">
          <a href={DEMO_MAILTO} className="estate-button">Request a demo</a>
          <a href="#platform" className="estate-button estate-button--outline">View platform</a>
        </div>
      </section>

      <figure className="estate-landscape" role="img" aria-label="A planned residential estate with plots, homes and internal roads">
        <figcaption><span>LANDCHECK ESTATES</span><span>One connected record for every plot.</span></figcaption>
      </figure>

      <section className="estate-content-section" id="platform">
        <h2 className="estate-centered-heading">Everything connected to the plot.</h2>
        <div className="estate-connected-grid">
          {connectedCapabilities.map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>

      <section className="estate-solutions-section" id="solutions">
        <h2>One platform for your entire estate operation.</h2>
        <ul className="estate-solutions-pills">
          {solutionAreas.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="estate-centered-section">
        <h2>From raw land to sale-ready plots.</h2>
        <p>LandCheck keeps the layout, buyer, payment, commission and survey documents together.</p>
        <Link to="/estates/register" className="estate-button">Explore the platform</Link>
      </section>

      <div className="estate-outcomes-band">
        <p>Fewer allocation errors. Faster documentation. Clearer management oversight.</p>
      </div>

      <section className="estate-centered-section" id="demo">
        <h2>See LandCheck on your estate.</h2>
        <p>Book a practical demonstration using your own layout.</p>
        <a href={DEMO_MAILTO} className="estate-button">Request a demo</a>
      </section>

      <footer className="estate-portal-footer">
        <Link to="/estates" className="estate-brand" aria-label="LandCheck Estates home">
          <img src="/logo.svg" alt="LandCheck" width="126" height="35" />
          <span>ESTATES</span>
        </Link>
        <nav className="estate-portal-footer-links" aria-label="Footer">
          <a href="#platform">Platform</a>
          <a href="mailto:landchecktech@gmail.com">Contact</a>
          <Link to="/privacy">Privacy</Link>
          <Link to="/estates/login">Sign in</Link>
        </nav>
      </footer>
    </main>
  );
}
