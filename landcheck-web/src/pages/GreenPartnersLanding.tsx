import { useEffect, useState } from "react";
import "../styles/green-partners.css";
import { fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";

type LaptopShot = { src: string; label: string; fit?: "cover" | "contain" };
type PhoneShot = { src: string; label: string };
type PartnerOrg = { name: string; logo: string | null };

const laptopShots: LaptopShot[] = [
  { src: "/Screenshot lndcheck work.png", label: "LandCheck Work - Assignment and operations board" },
  { src: "/Screenshot landcheck work 2.png", label: "LandCheck Work - Team task execution and supervision" },
  { src: "/Screenshot landcheck report.png", label: "LandCheck - Program reporting output", fit: "contain" },
  { src: "/Screenshot landcheck report 2.png", label: "LandCheck - Evidence-rich partner report view", fit: "contain" },
];
const phoneShots: PhoneShot[] = [
  { src: "/screenshot phone-green.jpg", label: "LandCheck Green - Field dashboard" },
  { src: "/phonr scrennshot 2.jpg", label: "LandCheck Green - Add tree with mapped positions" },
];
const laptopKeys = Array.from({ length: 56 }, (_, index) => index);

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=online.landcheck.mobile";

const PILOT_ORG_NAMES = new Set(["Think Green Foundation"]);

const capabilities = [
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

function PlayStoreTriangle({ size = 24 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path
        d="M3.5 2.87L12.41 12 3.5 21.13c-.31-.3-.5-.72-.5-1.17V4.04c0-.45.19-.87.5-1.17z"
        fill="#4285F4"
      />
      <path
        d="M3.5 2.87L12.41 12l3.3-3.3L5.27 2.36A1.79 1.79 0 0 0 3.5 2.87z"
        fill="#34A853"
      />
      <path
        d="M3.5 21.13L12.41 12l3.3 3.3-10.44 6.34A1.79 1.79 0 0 1 3.5 21.13z"
        fill="#EA4335"
      />
      <path
        d="M15.71 8.7L12.41 12l3.3 3.3 3.5-2.01a1.5 1.5 0 0 0 0-2.6l-3.5-2z"
        fill="#FBBC04"
      />
    </svg>
  );
}

export default function GreenPartnersLanding() {
  const [activeLaptopShot, setActiveLaptopShot] = useState(0);
  const [activePhoneShot, setActivePhoneShot] = useState(0);
  const [partners, setPartners] = useState<PartnerOrg[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveLaptopShot((prev) => (prev + 1) % laptopShots.length);
      setActivePhoneShot((prev) => (prev + 1) % phoneShots.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPublicPartnerOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        const mapped: PartnerOrg[] = orgs.map((o) => ({ name: o.name, logo: o.logo_url }));
        if (mapped.length > 0) setPartners(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="green-partners-page">
      {/* Navigation */}
      <NavBar logoBadge logoSrc="/green-logo-cropped-700.png" activeRoute="/green-partners" />

      {/* Hero Banner */}
      <section className="gp-hero-banner">
        <div className="gp-hero-tint" />
        <div className="gp-hero-copy">
          <h1>LANDCHECK GREEN</h1>
          <span>INVENTORY · MONITORING · MAINTENANCE · OUTREACH · REPORTING</span>
          <div className="gp-hero-ctas">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="gp-hero-playstore-btn"
            >
              <PlayStoreTriangle size={30} />
              <div className="gp-ps-text">
                <span>GET IT ON</span>
                <strong>Google Play</strong>
              </div>
            </a>
            <a href="/green/login/sponsor" className="gp-hero-sponsor-btn">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
                <path
                  d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Sponsor a Tree Online
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="14" height="14">
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Platform Modes */}
      <section id="modes" className="gp-modes-section">
        <div className="gp-modes-inner">
          <div className="gp-section-head">
            <span className="gp-section-eyebrow">FLEXIBLE PLATFORM</span>
            <h2>Built for Your Program Type</h2>
            <p>LandCheck Green adapts seamlessly to different field program workflows</p>
          </div>
          <div className="gp-modes-grid">
            <article className="gp-mode-card gp-mode-agric">
              <div className="gp-mode-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="26" height="26">
                  <path
                    d="M12 22V12m0 0C12 7 16 3 16 3s-2 6-4 9zm0 0C12 7 8 3 8 3s2 6 4 9z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path d="M3 22h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path
                    d="M7 14c0 3.5 2 6 5 8 3-2 5-4.5 5-8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="gp-mode-tag">Agricultural Mode</div>
              <h3>Farm + Crop Monitoring</h3>
              <p>
                Precision field tracking for agricultural programs, from farm boundary capture to seasonal crop
                monitoring and farmer registry.
              </p>
              <ul className="gp-mode-features">
                <li>Farm boundary capture with GPS polygon mapping</li>
                <li>Plot and crop registration per farmer</li>
                <li>Seasonal monitoring and growth-cycle tracking</li>
                <li>Farmer profile and land data registry</li>
                <li>Agricultural program reporting and export</li>
              </ul>
            </article>

            <article className="gp-mode-card gp-mode-relief">
              <div className="gp-mode-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="26" height="26">
                  <path
                    d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="gp-mode-tag">Relief + Recovery Mode</div>
              <h3>Humanitarian Site Assessment</h3>
              <p>
                Comprehensive field tools for disaster recovery and humanitarian programs, with multi-geometry site
                capture and beneficiary tracking.
              </p>
              <ul className="gp-mode-features">
                <li>Multi-geometry capture — point, line, and polygon</li>
                <li>Beneficiary registration and asset tracking</li>
                <li>Site assessment with GPS-verified evidence</li>
                <li>Distribution and relief program oversight</li>
                <li>Humanitarian reporting for donors and agencies</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* Main Platform Suite */}
      <main id="platform" className="gp-suite">
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
                {laptopShots.map((shot, index) => (
                  <img
                    key={shot.src}
                    src={encodeURI(shot.src)}
                    alt={shot.label}
                    className={`gp-laptop-shot ${shot.fit === "contain" ? "fit-contain" : "fit-cover"} ${index === activeLaptopShot ? "active" : ""}`}
                    loading="lazy"
                    width="640"
                    height="400"
                  />
                ))}
              </div>
              <div className="gp-laptop-hinge" />
              <div className="gp-laptop-base" />
              <div className="gp-laptop-deck">
                <div className="gp-laptop-keys">
                  {laptopKeys.map((keyId) => (
                    <span key={keyId} className="gp-key" />
                  ))}
                </div>
                <div className="gp-laptop-trackpad" />
              </div>
            </div>

            <div className="gp-phone">
              <div className="gp-phone-notch" />
              <div className="gp-phone-screen">
                {phoneShots.map((shot, index) => (
                  <img
                    key={shot.src}
                    src={encodeURI(shot.src)}
                    alt={shot.label}
                    className={`gp-phone-shot ${index === activePhoneShot ? "active" : ""}`}
                    loading="lazy"
                    width="300"
                    height="600"
                  />
                ))}
              </div>
              <div className="gp-phone-home" />
            </div>
          </div>

          <div className="gp-demo-dl-row">
            <a
              className="gp-demo-playstore"
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <PlayStoreTriangle size={22} />
              <div>
                <span>Download on</span>
                <strong>Google Play</strong>
              </div>
            </a>
            <a className="gp-suite-cta" href="/green/login/sponsor">
              Sponsor online
            </a>
          </div>
          <a className="privacy-inline-link" href="/privacy">
            Privacy Policy
          </a>
        </section>
      </main>

      {/* Partner Organizations */}
      {partners.length > 0 && (
        <section id="partners" className="gp-partners-section">
          <div className="gp-partners-inner">
            <div className="gp-section-head gp-section-head--center">
              <span className="gp-section-eyebrow">TRUSTED BY</span>
              <h2>Our Partner Organizations</h2>
              <p>Field programs running on LandCheck Green across Nigeria</p>
            </div>
            <div className="gp-partners-logos">
              {partners.map((org) => (
                <div key={org.name} className="gp-partner-badge">
                  {PILOT_ORG_NAMES.has(org.name) && (
                    <span className="gp-partner-pilot-tag">Pilot Programme</span>
                  )}
                  {org.logo ? (
                    <img src={org.logo} alt={org.name} className="gp-partner-logo" />
                  ) : (
                    <span className="gp-partner-name-initials">
                      {org.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <span className="gp-partner-name">{org.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer CTA */}
      <footer id="contact" className="gp-footer-cta">
        <div className="gp-footer-inner">
          <div className="gp-footer-copy">
            <h2>Start a Partnership</h2>
            <p>We work with NGOs, government agencies, donors, and CSR teams across Nigeria.</p>
          </div>
          <div className="gp-footer-actions">
            <a
              className="gp-footer-email-btn"
              href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Partnership"
            >
              landchecktech@gmail.com
            </a>
            <a
              className="gp-footer-play-btn"
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <PlayStoreTriangle size={16} />
              Download Android App
            </a>
          </div>
        </div>
        <div className="gp-footer-bottom">
          <a className="gp-footer-privacy" href="/privacy">
            Privacy Policy
          </a>
          <span className="gp-footer-copy-text">
            © {new Date().getFullYear()} LandCheck Geospatial Technologies Limited
          </span>
        </div>
      </footer>
    </div>
  );
}
