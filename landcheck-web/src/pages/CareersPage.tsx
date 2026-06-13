import { useNavigate } from "react-router-dom";
import "../styles/inner-pages.css";
import "../styles/careers.css";

const NAV_ITEMS = [
  { label: "LandCheck Green", route: "/green-partners" },
  { label: "Survey Plan", route: "/survey" },
  { label: "Flood Analysis", route: "/flood" },
  { label: "Career", route: "/career" },
  { label: "News", route: "/news" },
] as const;

export default function CareersPage() {
  const navigate = useNavigate();

  return (
    <div className="ip-page">
      <header className="ip-nav">
        <button type="button" className="ip-nav-brand" onClick={() => navigate("/")}>
          <img src="/logo.svg" alt="LandCheck" />
        </button>
        <nav className="ip-nav-menu" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.route}
              type="button"
              className={item.route === "/career" ? "ip-nav-active" : undefined}
              onClick={() => navigate(item.route)}
            >
              {item.label}
            </button>
          ))}
          <a
            href="mailto:landchecktech@gmail.com?subject=LandCheck%20Support"
            className="ip-nav-link"
          >
            Support
          </a>
        </nav>
      </header>

      <main>
        <section className="cp-hero">
          <div className="ip-container">
            <span className="ip-eyebrow">Join the Team</span>
            <h1>
              Build Nigeria's Land<br />Intelligence Platform
            </h1>
            <p>
              We're a focused team working on geospatial tools that make a real difference for
              surveyors, NGOs, and land owners across Nigeria.
            </p>
          </div>
        </section>

        <section className="cp-section">
          <div className="ip-container">
            <h2>Why LandCheck</h2>
            <p>
              LandCheck is solving hard, meaningful problems — land documentation, flood risk
              analysis, and environmental field monitoring — across one of Africa's most complex
              land markets. Our products are used by licensed surveyors, government agencies,
              NGOs, and donors.
            </p>
            <p>
              We work in a small, high-ownership environment where what you build goes directly
              into production and directly impacts users. If you want to see the effect of your
              work, this is that kind of place.
            </p>
          </div>
        </section>

        <section className="cp-roles-section">
          <div className="ip-container">
            <h2>Areas We Hire In</h2>
            <div className="cp-roles-grid">
              <div className="cp-role-card">
                <h3>Engineering</h3>
                <p>
                  Full-stack web (React, TypeScript, Node.js), mobile (React Native / Android),
                  and backend/API development.
                </p>
              </div>
              <div className="cp-role-card">
                <h3>Geospatial &amp; GIS</h3>
                <p>
                  Spatial data processing, flood modelling, remote sensing, coordinate systems,
                  and map rendering.
                </p>
              </div>
              <div className="cp-role-card">
                <h3>Product &amp; Design</h3>
                <p>
                  Product thinking, UX design, and research for complex technical tools used
                  by professionals in land, environment, and development.
                </p>
              </div>
              <div className="cp-role-card">
                <h3>Field &amp; Partnerships</h3>
                <p>
                  NGO engagement, field operations support, business development, and ecosystem
                  partnerships across Nigeria.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="cp-contact-section">
          <div className="ip-container">
            <h2>Get In Touch</h2>
            <p>
              We don't always advertise open roles publicly, but we're always interested in
              meeting people who are passionate about geospatial technology, climate data, or
              building tools for Nigeria.
            </p>
            <p>Send your CV and a short note about what you'd like to work on to:</p>
            <a
              href="mailto:landchecktech@gmail.com?subject=Career%20Enquiry%20-%20LandCheck"
              className="cp-email-cta"
            >
              landchecktech@gmail.com
            </a>
            <p className="cp-email-hint">
              Subject: Career Enquiry — [Your Name / Role of Interest]
            </p>
          </div>
        </section>
      </main>

      <footer className="ip-footer">
        <div className="ip-footer-inner">
          <span>
            &copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited
          </span>
          <div className="ip-footer-links">
            <button type="button" onClick={() => navigate("/")}>Home</button>
            <button type="button" onClick={() => navigate("/privacy")}>Privacy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
