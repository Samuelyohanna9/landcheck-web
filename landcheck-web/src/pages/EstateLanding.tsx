import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SocialLinks from "../components/SocialLinks";
import EstatePricingCards from "../components/estates/EstatePricingCards";
import EstateDemoRequestModal from "../components/EstateDemoRequestModal";
import "../styles/estate-portal.css";
import "../styles/public-landing.css";

type IncludedItem = string | { text: string; tag: string };

const includedGroups: Array<{ title: string; items: IncludedItem[] }> = [
  {
    title: "Plan and build",
    items: [
      "Automatic layout design",
      "Georeference and digitise",
      "Live satellite map of approved plots",
      "Field-ready coordinates",
      "Professional survey plans",
      { text: "Hazard analysis - flood and erosion screening", tag: "Plus" },
      { text: "Soil analysis - indicative bearing capacity, water table and drainage", tag: "Pro" },
    ],
  },
  {
    title: "Sell and manage",
    items: [
      "Customer-facing Estate website",
      "Online plot reservations",
      "Reservation alerts for your team",
      "Customers and allocations",
      "Payments and commissions",
      { text: "Email updates for customers; SMS on Pro", tag: "Pro" },
      { text: "WhatsApp inbox for buyer and lead chats", tag: "Pro" },
      { text: "Facebook and Instagram posting with comment and like replies", tag: "Pro" },
      { text: "QR-coded marketing campaigns by channel", tag: "Pro" },
      "Staff-reviewed title status and government approvals tracker",
      "Plot and agent verification checks on your public page",
      { text: "Live video inspections for diaspora and out-of-town buyers, GPS-verified in real time", tag: "Enterprise" },
    ],
  },
];

const solutionAreas = ["Development", "Sales", "Finance", "Survey"];

const publicSiteScreens = [
  { src: "/estate-public-site-1.jpg", alt: "Public Estate page showing the area growth outlook for a buyer" },
  { src: "/estate-public-site-2.jpg", alt: "Public Estate page showing the satellite plot map for a buyer to choose from" },
  { src: "/estate-public-site-3.jpg", alt: "Public Estate page showing a plot's price and a Reserve this plot button" },
];

const publicSiteBullets = [
  "Live pricing and availability",
  "Reserve a plot in one tap",
  "Published development outlook",
];

export default function EstateLanding() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState(0);

  // Cycles the phone mockup's screenshots automatically - a static image doesn't show that the
  // public Estate page is several real pages (outlook, map, plot register), not one screenshot.
  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveScreen((current) => (current + 1) % publicSiteScreens.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  // Picking a plan from the landing page (not yet signed in) sends a new visitor to register
  // first - registration itself hands off to /estates/choose-plan once the account exists.
  const selectPlanFromLanding = () => navigate("/estates/register");

  const openDemo = () => {
    setDemoOpen(true);
  };

  // Escape closes the mobile drawer, matching the dismissal convention used everywhere else in
  // the app (modals, the dashboard's own sidebar drawer).
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  return (
    <main className="estate-portal public-landing">
      <header className="estate-portal-nav">
        <button
          type="button"
          className="estate-nav-hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
        >
          <span /><span /><span />
        </button>
        <Link to="/estates" className="estate-brand" aria-label="LandCheck Estates home">
          <img src="/logo-wordmark-web.png" alt="LandCheck" width="182" height="58" />
          <span>ESTATES</span>
        </Link>
        <nav className="estate-portal-nav-links" aria-label="Estate product navigation">
          <a href="#platform">Platform</a>
          <a href="#overview-video">Watch overview</a>
          <a href="#solutions">Solutions</a>
          <a href="#pricing">Pricing</a>
          <Link to="/agents/login">For property agents</Link>
          <Link to="/estates/login" className="estate-nav-login">Sign in</Link>
          <button type="button" className="estate-nav-cta" onClick={openDemo}>Request a demo</button>
        </nav>
      </header>

      <div className={`estate-mobile-overlay${menuOpen ? " estate-mobile-overlay--open" : ""}`} onClick={closeMenu} aria-hidden={!menuOpen}>
        <nav className={`estate-mobile-drawer${menuOpen ? " estate-mobile-drawer--open" : ""}`} onClick={(event) => event.stopPropagation()} aria-label="Estate product navigation (mobile)">
          <div className="estate-mobile-drawer-head">
            <img src="/logo-wordmark-web.png" alt="LandCheck" width="156" height="50" />
            <button type="button" className="estate-mobile-close" onClick={closeMenu} aria-label="Close navigation">&times;</button>
          </div>
          <a href="#platform" className="estate-mobile-item" onClick={closeMenu}>Platform</a>
          <a href="#overview-video" className="estate-mobile-item" onClick={closeMenu}>Watch overview</a>
          <a href="#solutions" className="estate-mobile-item" onClick={closeMenu}>Solutions</a>
          <a href="#pricing" className="estate-mobile-item" onClick={closeMenu}>Pricing</a>
          <Link to="/agents/login" className="estate-mobile-item" onClick={closeMenu}>For property agents</Link>
          <Link to="/estates/login" className="estate-mobile-item" onClick={closeMenu}>Sign in</Link>
          <button type="button" className="estate-mobile-cta" onClick={() => { closeMenu(); openDemo(); }}>Request a demo</button>
        </nav>
      </div>

      <section className="estate-hero" aria-labelledby="estate-intro-title" role="img" aria-label="A planned residential estate with plots, homes and internal roads">
        <p className="estate-kicker estate-hero-kicker">LandCheck Estates</p>
        <h1 id="estate-intro-title">Run your estate from layout to allocation.</h1>
        <p className="estate-hero-summary">LandCheck Estates connects layouts, plots, customers, reservations, sales, instalments, allocations and survey documents for Nigerian real estate developers.</p>
        <div className="estate-intro-actions estate-intro-actions--centered">
          <button type="button" className="estate-button" onClick={openDemo}>Request a demo</button>
          <a href="#platform" className="estate-button estate-button--outline-light">View platform</a>
        </div>
        <p className="estate-hero-caption">Every plot. One connected record.</p>
      </section>

      <section className="estate-video-section" id="overview-video" aria-labelledby="estate-video-title">
        <div className="estate-video-copy">
          <p className="estate-kicker">See it in action</p>
          <h2 id="estate-video-title">One connected workspace for every plot.</h2>
          <p>See how LandCheck Estates connects estate layouts, plot availability, customer records, reservations, payments, allocations and survey documents.</p>
        </div>
        <div className="estate-video-frame">
          <iframe
            src="https://www.youtube-nocookie.com/embed/G7IjmlPz-Es?rel=0&modestbranding=1"
            title="LandCheck Estates product overview"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </section>

      <section className="estate-content-section" id="platform">
        <h2 className="estate-centered-heading">Everything connected to the plot.</h2>
        <div className="estate-screenshot-grid">
          <figure className="estate-screenshot">
            <img src="/estate-dashboard-map.jpg" alt="LandCheck Estates dashboard showing an estate's map, plots and activity" loading="lazy" />
            <figcaption>Live satellite map of every plot</figcaption>
          </figure>
          <figure className="estate-screenshot">
            <img src="/estate-dashboard-layout-designer.jpg" alt="LandCheck Estates automatic layout design tool" loading="lazy" />
            <figcaption>Automatic layout design</figcaption>
          </figure>
          <figure className="estate-screenshot">
            <img src="/social post.jpg" alt="LandCheck Estates automatic social posting plan for Facebook and Instagram" loading="lazy" />
            <figcaption>Automatic social media posting</figcaption>
          </figure>
        </div>
      </section>

      <section className="estate-content-section" id="features">
        <h2 className="estate-centered-heading">Tools for the whole estate workflow.</h2>
        <div className="estate-included-grid">
          {includedGroups.map((group) => (
            <div className="estate-included-card" key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => typeof item === "string"
                  ? <li key={item}>{item}</li>
                  : <li key={item.text}>{item.text} <span className="estate-included-tag">{item.tag}</span></li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="estate-centered-section" id="trust">
        <h2>Give buyers a clearer record to work from.</h2>
        <p>
          Publish a public estate page with a map, plot information, availability and configured verification details.
          Keep customer, reservation, payment and survey records in the same workspace. Enterprise teams can add
          GPS-verified live video inspections for remote buyers.
        </p>
        <Link to="/estates/register" className="estate-button">Start a 14-day trial</Link>
      </section>

      <section className="estate-content-section estate-feature-section" id="public-site">
        <div className="estate-feature-row estate-feature-row--phone">
          <div className="estate-feature-text">
            <p className="estate-kicker">Public estate website</p>
            <h2>A branded website for every estate.</h2>
            <p className="estate-feature-copy">A page that's yours - not a spreadsheet link or a WhatsApp broadcast.</p>
            <ul className="estate-feature-bullets">
              {publicSiteBullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="estate-feature-visual">
            <div className="estate-phone-frame">
              <div className="estate-phone-screen">
                {publicSiteScreens.map((screen, index) => (
                  <img
                    key={screen.src}
                    src={screen.src}
                    alt={screen.alt}
                    loading={index === 0 ? "eager" : "lazy"}
                    className={index === activeScreen ? "is-active" : ""}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="estate-solutions-section" id="solutions">
        <h2>One platform for development, sales, finance and survey.</h2>
        <ul className="estate-solutions-pills">
          {solutionAreas.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="estate-content-section" id="pricing">
        <h2 className="estate-centered-heading">Plans for the size of your estate operation.</h2>
        <EstatePricingCards onSelectPlan={selectPlanFromLanding} ctaLabel={() => "Start a 14-day trial"} />
      </section>

      <section className="estate-centered-section">
        <h2>From layout to allocation.</h2>
        <p>Keep the layout, plot, customer, payment, commission and survey records together.</p>
        <Link to="/estates/register" className="estate-button">Explore the platform</Link>
      </section>

      <div className="estate-outcomes-band">
        <p> Faster documentation. Clearer management oversight.</p>
      </div>

      <section className="estate-centered-section" id="demo">
        <h2>See LandCheck on your estate.</h2>
        <p>Book a practical demonstration using your own layout.</p>
        <button type="button" className="estate-button" onClick={openDemo}>Request a demo</button>
      </section>

      <footer className="estate-site-footer">
        <div className="estate-site-footer-inner">
          <div className="estate-site-footer-brand">
            <Link to="/estates" className="estate-brand" aria-label="LandCheck Estates home">
              <span className="estate-site-footer-logo-plate"><img src="/logo-wordmark-web.png" alt="LandCheck" width="140" height="44" loading="lazy" /></span>
              <span>ESTATES</span>
            </Link>
            <ul>
              <li><a href="mailto:admin@landcheck.online">admin@landcheck.online</a></li>
              <li>LandCheck Geospatial Technologies Limited</li>
              <li><a href="https://landcheck.online" target="_blank" rel="noopener noreferrer">landcheck.online</a></li>
            </ul>
            <SocialLinks className="estate-site-footer-social" />
          </div>

          <div className="estate-site-footer-col">
            <h2>Products</h2>
            <ul>
              <li><Link to="/estates/login">LandCheck Estates</Link></li>
              <li><Link to="/agents/login">LandCheck Agents</Link></li>
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
              <li><Link to="/news/">News</Link></li>
              <li><a href="mailto:support@landcheck.online?subject=LandCheck%20Support">Support</a></li>
              <li><Link to="/privacy">Privacy</Link></li>
            </ul>
          </div>
        </div>

        <div className="estate-site-footer-bottom">
          <span>All rights reserved. &copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited</span>
          <span className="estate-site-footer-bottom-links"><Link to="/agents/login">Agent workspace</Link><Link to="/estates/login">Sign in to Estates</Link></span>
        </div>
      </footer>
      {demoOpen && <EstateDemoRequestModal onClose={() => setDemoOpen(false)} />}
    </main>
  );
}
