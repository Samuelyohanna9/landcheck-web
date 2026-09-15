import { Link } from "react-router-dom";
import SocialLinks from "../components/SocialLinks";
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

      <section className="estate-hero" aria-labelledby="estate-intro-title" role="img" aria-label="A planned residential estate with plots, homes and internal roads">
        <p className="estate-kicker estate-hero-kicker">LandCheck Estates</p>
        <h1 id="estate-intro-title">Manage every estate from one place.</h1>
        <p className="estate-hero-summary">Design layouts, manage plots and buyers, track payments and commissions, and generate professional survey plans.</p>
        <div className="estate-intro-actions estate-intro-actions--centered">
          <a href={DEMO_MAILTO} className="estate-button">Request a demo</a>
          <a href="#platform" className="estate-button estate-button--outline-light">View platform</a>
        </div>
        <p className="estate-hero-caption">One connected record for every plot.</p>
      </section>

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

      <footer className="estate-site-footer">
        <div className="estate-site-footer-inner">
          <div className="estate-site-footer-brand">
            <Link to="/estates" className="estate-brand" aria-label="LandCheck Estates home">
              <img src="/logo.svg" alt="LandCheck" width="100" height="34" loading="lazy" />
              <span>ESTATES</span>
            </Link>
            <ul>
              <li><a href="mailto:landchecktech@gmail.com">landchecktech@gmail.com</a></li>
              <li>LandCheck Geospatial Technologies Limited</li>
              <li><a href="https://landcheck.online" target="_blank" rel="noopener noreferrer">landcheck.online</a></li>
            </ul>
            <SocialLinks className="estate-site-footer-social" />
          </div>

          <div className="estate-site-footer-col">
            <h2>Products</h2>
            <ul>
              <li><Link to="/estates/login">LandCheck Estates</Link></li>
              <li><Link to="/green-partners">LandCheck Green</Link></li>
              <li><Link to="/survey">Survey Plan</Link></li>
              <li><Link to="/flood">Flood Risk Analysis</Link></li>
            </ul>
          </div>

          <div className="estate-site-footer-col">
            <h2>Tools</h2>
            <ul>
              <li><Link to="/survey-plan">Survey Plan Tool</Link></li>
              <li><Link to="/hazard-analysis">Hazard Analysis</Link></li>
              <li><a href="#platform">Estate platform</a></li>
            </ul>
          </div>

          <div className="estate-site-footer-col">
            <h2>Company</h2>
            <ul>
              <li><Link to="/career">Careers</Link></li>
              <li><Link to="/news">News</Link></li>
              <li><a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Support">Support</a></li>
              <li><Link to="/privacy">Privacy</Link></li>
            </ul>
          </div>
        </div>

        <div className="estate-site-footer-bottom">
          <span>All rights reserved. &copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited</span>
          <Link to="/estates/login">Sign in to Estates</Link>
        </div>
      </footer>
    </main>
  );
}
