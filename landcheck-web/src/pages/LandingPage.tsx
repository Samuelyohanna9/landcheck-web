import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/landing.css";
import { fetchPublicPartnerOrganizations } from "../api/greenSponsor";

type PartnerOrg = { name: string; logo: string | null };

const PILOT_ORG_NAMES = new Set(["Think Green Foundation"]);

const targets = [
  "Licensed Surveyors",
  "Land Owners & Real Estate",
  "Environmental Organisations & NGOs",
  "Government Agencies",
];

const products = [
  {
    key: "green",
    title: "LandCheck Green",
    description: "GPS tree inventory, agric farm monitoring, humanitarian site assessment, and program reporting for NGOs, donors, and government agencies.",
    route: "/green-partners",
    bgClass: "lp-prod-green-bg",
  },
  {
    key: "survey",
    title: "Survey Plan",
    description: "True-scale professional plans from coordinate input — PDF, DWG, orthophoto, and computation sheet exports.",
    route: "/survey",
    bgClass: "lp-prod-survey-bg",
  },
  {
    key: "flood",
    title: "Flood Risk Analysis",
    description: "Screen any Nigerian land parcel for flood risk, erosion, and soil stability with a detailed PDF risk report.",
    route: "/flood",
    bgClass: "lp-prod-flood-bg",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [partners, setPartners] = useState<PartnerOrg[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchPublicPartnerOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        const mapped = orgs.map((o) => ({ name: o.name, logo: o.logo_url }));
        if (mapped.length > 0) setPartners(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landcheck-landing">
      {/* Navigation */}
      <header className="lp-nav">
        <button type="button" className="lp-nav-brand" onClick={() => navigate("/")}>
          <img src="/logo.svg" alt="LandCheck" />
        </button>
        <nav className="lp-nav-menu" aria-label="Main navigation">
          <button type="button" onClick={() => navigate("/green-partners")}>LandCheck Green</button>
          <button type="button" onClick={() => navigate("/survey")}>Survey Plan</button>
          <button type="button" onClick={() => navigate("/flood")}>Flood Analysis</button>
          <button type="button" onClick={() => navigate("/career")}>Career</button>
          <button type="button" onClick={() => navigate("/news")}>News</button>
          <a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Support" className="lp-nav-support">Support</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="lp-hero">
        {/* Decorative geographic SVG */}
        <svg className="lp-hero-svg" aria-hidden="true" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice">
          <path d="M-50,310 Q160,285 380,315 Q590,345 810,300 Q1010,258 1240,292 Q1360,308 1490,295" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5"/>
          <path d="M-50,410 Q160,385 380,412 Q590,440 810,398 Q1010,358 1240,388 Q1360,404 1490,395" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1.5"/>
          <path d="M-50,505 Q160,480 380,505 Q590,530 810,492 Q1010,458 1240,484 Q1360,500 1490,492" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>
          <path d="M-50,220 Q160,200 380,224 Q590,248 810,212 Q1010,180 1240,208 Q1360,222 1490,215" fill="none" stroke="rgba(255,255,255,0.022)" strokeWidth="1"/>
          <rect x="340" y="178" width="762" height="374" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.2" strokeDasharray="10 6"/>
          <circle cx="340" cy="178" r="5" fill="rgba(224,123,0,0.6)"/>
          <circle cx="1102" cy="178" r="5" fill="rgba(224,123,0,0.6)"/>
          <circle cx="340" cy="552" r="5" fill="rgba(224,123,0,0.6)"/>
          <circle cx="1102" cy="552" r="5" fill="rgba(224,123,0,0.5)"/>
          <circle cx="720" cy="340" r="3" fill="rgba(255,255,255,0.15)"/>
        </svg>
        <div className="lp-hero-overlay" />
        <div className="lp-hero-content">
          <h1>
            Land Intelligence<br />for Nigeria
          </h1>
          <p className="lp-hero-lead">
            Environmental monitoring, field operations, survey plans, and flood risk — all in one platform
          </p>
          <div className="lp-hero-ctas">
            <button type="button" className="lp-hero-btn-primary" onClick={() => navigate("/green-partners")}>
              LANDCHECK GREEN
            </button>
            <button type="button" className="lp-hero-btn-outline" onClick={() => navigate("/survey")}>
              SURVEY PLAN
            </button>
          </div>
        </div>
        <a href="#landcheck-intro" className="lp-scroll-indicator" aria-label="Scroll to content">
          <svg viewBox="0 0 24 24" fill="none" width="40" height="40">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </section>

      {/* We are LandCheck */}
      <section id="landcheck-intro" className="lp-intro-section">
        <div className="lp-intro-inner">
          <h2>
            We are <strong>LandCheck</strong>
          </h2>
          <div className="lp-intro-lead-wrap">
            <p>
              LandCheck develops web and mobile tools for land documentation, flood hazard analysis, and
              environmental field monitoring — providing cutting-edge solutions for surveyors, land owners,
              NGOs, and government agencies across Nigeria.
            </p>
          </div>
          <div className="lp-stats-row">
            <div className="lp-stat-card">
              <div className="lp-stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="52" height="52">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
              <div className="lp-stat-text">
                <strong>3</strong>
                <span>
                  Integrated
                  <br />
                  Products
                </span>
              </div>
            </div>
            <div className="lp-stat-card">
              <div className="lp-stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="52" height="52">
                  <path
                    d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </div>
              <div className="lp-stat-text">
                <strong>Nigeria</strong>
                <span>
                  Precision
                  <br />
                  Datasets
                </span>
              </div>
            </div>
            <div className="lp-stat-card">
              <div className="lp-stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="52" height="52">
                  <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <path
                    d="M8 21h8M12 17v4"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="lp-stat-text">
                <strong>Web</strong>
                <span>
                  No Installation
                  <br />
                  Required
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="lp-intro-cta"
            onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
          >
            EXPLORE OUR PRODUCTS
          </button>
        </div>
      </section>

      {/* Who We Serve */}
      <section id="targets" className="lp-targets-section">
        <div className="lp-targets-header">
          <h2>
            <strong>Who We Serve</strong>
          </h2>
          <p>LandCheck builds digital tools that help you deliver on your goals.</p>
        </div>
        <div className="lp-targets-list">
          {targets.map((item, i) => (
            <div key={item} className="lp-target-item">
              <span className="lp-target-num">{i + 1}</span>
              <h3>{item}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* Products */}
      <section id="products" className="lp-products-section">
        <div className="lp-products-header">
          <h2>
            Our <strong>Products</strong>
          </h2>
          <p>Explore our products and find the best fit for your needs.</p>
        </div>
        <div className="lp-products-row">
          {products.map((prod) => (
            <div
              key={prod.key}
              className={`lp-prod-card ${prod.bgClass}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(prod.route)}
              onKeyDown={(e) => e.key === "Enter" && navigate(prod.route)}
            >
              <div className="lp-prod-overlay" />
              <div className="lp-prod-content">
                <h2>{prod.title}</h2>
                <p>{prod.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Partners */}
      {partners.length > 0 && (
        <section className="lp-partners-section">
          <div className="lp-partners-inner">
            <h2>
              Our <strong>Partner Organizations</strong>
            </h2>
            <p>Field programs powered by LandCheck across Nigeria</p>
            <div className="lp-partners-logos">
              {partners.map((org) => (
                <div
                  key={org.name}
                  className="lp-partner-badge"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate("/green-partners#partners")}
                  onKeyDown={(e) => e.key === "Enter" && navigate("/green-partners#partners")}
                >
                  {PILOT_ORG_NAMES.has(org.name) && (
                    <span className="lp-partner-pilot-tag">Pilot</span>
                  )}
                  {org.logo ? (
                    <img src={org.logo} alt={org.name} className="lp-partner-logo" />
                  ) : (
                    <span className="lp-partner-initials">
                      {org.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <span className="lp-partner-name">{org.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact Ribbon */}
      <section className="lp-contact-ribbon">
        <div className="lp-contact-inner">
          <h3>To request more information about our products</h3>
          <a
            href="mailto:landchecktech@gmail.com?subject=LandCheck%20Products%20Enquiry"
            className="lp-contact-cta"
          >
            CONTACT US
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src="/logo.svg" alt="LandCheck" className="lp-footer-logo" />
            <ul>
              <li>
                <a href="mailto:landchecktech@gmail.com">landchecktech@gmail.com</a>
              </li>
              <li>LandCheck Geospatial Technologies Limited</li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h5>Products</h5>
            <ul>
              <li>
                <button type="button" onClick={() => navigate("/green-partners")}>
                  LandCheck Green
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate("/survey")}>
                  Survey Plan
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate("/flood")}>
                  Flood Risk Analysis
                </button>
              </li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h5>Tools</h5>
            <ul>
              <li>
                <button type="button" onClick={() => navigate("/survey-plan")}>
                  Survey Plan Tool
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate("/hazard-analysis")}>
                  Hazard Analysis
                </button>
              </li>
              <li>
                <a
                  href="https://play.google.com/store/apps/details?id=online.landcheck.mobile"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Android App
                </a>
              </li>
              <li>
                <button type="button" onClick={() => navigate("/green/login/sponsor")}>
                  Sponsor a Tree
                </button>
              </li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h5>Company</h5>
            <ul>
              <li>
                <button type="button" onClick={() => navigate("/career")}>
                  Career
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate("/news")}>
                  News
                </button>
              </li>
              <li>
                <a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Support">
                  Support
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>
            All rights reserved. &copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited
          </span>
          <ul className="lp-footer-legal">
            <li>
              <button type="button" onClick={() => navigate("/privacy")}>
                Privacy
              </button>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
