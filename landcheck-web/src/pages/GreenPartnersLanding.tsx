import { useEffect, useMemo, useState, type ReactElement } from "react";
import "../styles/green-partners.css";
import { fetchPublicImpactStats, fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";
import { useCookieConsent } from "../privacy/cookieConsent";

type PartnerOrg = { name: string; logo: string | null };
type ImpactSnapshot = { total_trees: number; total_organizations: number };
type MediaFit = "cover" | "contain";

type GreenModel = {
  id: string;
  heroLabel: string;
  heroStatement: string;
  heroSupport: string;
  heroImage: string;
  selectorTitle: string;
  title: string;
  summary: string;
  detail: string;
  bullets: string[];
  href: string;
  cta: string;
  desktopImage: string;
  phoneImage: string;
  desktopFit: MediaFit;
  phoneFit: MediaFit;
  accentLabel: string;
};

const HERO_VIDEO_SRC = "/let_the_video_be_black_nigeria.mp4";
const HERO_FALLBACK_IMAGE = "/agent planting 1.JPG";
const BROCHURE_PDF_SRC = "/lc-green-corporate-brochure.pdf";
const PILOT_ORG_NAMES = new Set(["Think Green Foundation"]);

const svgAsset = (fileName: string) => encodeURI(`/${fileName}`);
const photoAsset = (fileName: string) => encodeURI(`/${fileName}`);

const bulletIconMap: Record<string, string> = {
  // NGO
  "Staff task assignment": "project_task.svg",
  "Offline-first mobile sync": "Real-time_data.svg",
  "Live maintenance updates": "maintenace_reminder.svg",
  "Ready-made report exports": "Export-ready executive reports.svg",
  // CSR
  "Verified evidence dashboard": "verified_field_data.svg",
  "Corporate CSR funding": "Impact reporting and analytics.svg",
  "Quality assurance queue": "Review queue and quality control.svg",
  // Public
  "Instant sponsor checkouts": "Sponsor trees online instantly.svg",
  "Personalized certificates": "Map, image, and certificate proof.svg",
  "Green points & live updates": "Live impact updates.svg",
};

const statIconMap: Record<string, string> = {
  "Trees Verified": "Trees Tracked.svg",
  "Audit-Ready Data": "Delivery Models.svg",
  "Hectares Monitored": "Partner Organisations.svg",
  "ESG Compliance": "NGN + USD Checkout Ready.svg",
};

const modelRouteIcons: Record<string, ReactElement> = {
  field: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 12.5l2 2 4-4.5" />
    </svg>
  ),
  csr: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9.2 12.2l1.9 1.9 3.7-4" />
    </svg>
  ),
  public: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7-4.35-9.5-8.5C.7 8.2 2 4.8 5.3 4.1 7.6 3.6 9.8 4.7 12 7c2.2-2.3 4.4-3.4 6.7-2.9 3.3.7 4.6 4.1 2.8 7.4C19 15.65 12 20 12 20z" />
    </svg>
  ),
};

const modelSelectorChevronIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

const greenModels: GreenModel[] = [
  {
    id: "field",
    heroLabel: "For NGOs & Partners",
    heroStatement: "NGO Workspace",
    heroSupport: "Assign planting and maintenance tasks to staff, monitor progress, and export reports.",
    heroImage: "/agent planting 2.JPG",
    selectorTitle: "NGO Campaign Workspace",
    title: "Empower NGOs to coordinate planting campaigns, assign staff tasks, and track field syncs.",
    summary: "Assign planting and maintenance tasks to staff, monitor progress, and export reports.",
    detail: "A robust operations hub built for NGOs. Oversee forestry teams using the offline-first LC Green mobile app, schedule task reminders, track remote activities in real time, and download ready-made executive summaries.",
    bullets: [
      "Staff task assignment",
      "Offline-first mobile sync",
      "Live maintenance updates",
      "Ready-made report exports",
    ],
    href: "/green/login/field",
    cta: "Access NGO workspace",
    desktopImage: "/screenshotlandche green 2.png",
    phoneImage: "/screenshot phone-green.jpg",
    desktopFit: "contain",
    phoneFit: "contain",
    accentLabel: "NGO Workspace",
  },
  {
    id: "csr",
    heroLabel: "For Corporate CSR",
    heroStatement: "CSR Dashboards",
    heroSupport: "Partner with us to fund restoration projects and view live evidence of work done.",
    heroImage: "/ecf-partnership.jpeg",
    selectorTitle: "Corporate CSR Dashboards",
    title: "Partner with us to fund restoration projects and view live evidence of work done.",
    summary: "Fund forestry initiatives and access live verification dashboards for stakeholders.",
    detail: "Tailored for corporate ESG and CSR programs. Sponsor designated forest sectors, track seedling progress, and view verified field evidence—including coordinates, high-resolution photographs, and auditor timestamps—live on your custom company dashboard.",
    bullets: [
      "Verified evidence dashboard",
      "Corporate CSR funding",
      "Quality assurance queue",
    ],
    href: "/green-work/login",
    cta: "Launch CSR dashboard",
    desktopImage: "/Screenshot landcheck report.png",
    phoneImage: "/Screenshot landcheck report 2.png",
    desktopFit: "contain",
    phoneFit: "contain",
    accentLabel: "CSR Dashboard",
  },
  {
    id: "public",
    heroLabel: "For Public Sponsors",
    heroStatement: "Tree Sponsorships",
    heroSupport: "Fund a tree online and receive live location logs, digital certificates, and green points.",
    heroImage: "/thumpnail_public.jpg",
    selectorTitle: "Public Sponsorship Portal",
    title: "Fund a tree online and receive live location logs, digital certificates, and green points.",
    summary: "Anyone can sponsor trees instantly and track real-time field planting activities.",
    detail: "A public portal designed for individual sponsors. Purchase a tree planting online, watch our certified field agents complete the work, and receive interactive map coordinates, growth feeds, personalized digital certificates, and green points.",
    bullets: [
      "Instant sponsor checkouts",
      "Personalized certificates",
      "Green points & live updates",
    ],
    href: "/sponsor",
    cta: "Sponsor a tree now",
    desktopImage: "/info.png",
    phoneImage: "/sponsor-tree-app.jpeg",
    desktopFit: "contain",
    phoneFit: "cover",
    accentLabel: "Public Portal",
  },
];

const whyPillars = [
  {
    label: "Enterprise Forestry Standards",
    iconSrc: svgAsset("Built for forestry and restoration projects.svg"),
  },
  {
    label: "Multi-Stakeholder Alignment",
    iconSrc: svgAsset("Designed for NGOs, communities, and companies.svg"),
  },
  {
    label: "Offline-First Field Sync",
    iconSrc: svgAsset("Offline-first with smart sync.svg"),
  },
  {
    label: "End-to-End Lifecycle Tracking",
    iconSrc: svgAsset("From planting to survival and impact.svg"),
  },
  {
    label: "Audit-Ready ESG Compliance",
    iconSrc: svgAsset("Secure, transparent, and audit-ready.svg"),
  },
];

const photoMoments = [
  {
    imageSrc: photoAsset("agent planting 2.JPG"),
    label: "SITE ONBOARDING",
    title: "Geotagged planting logs recorded directly at source.",
  },
  {
    imageSrc: photoAsset("tree_adamawa.JPG"),
    label: "COMMUNITY RESTORATION",
    title: "Collaborative planting with verified local forestry partners.",
  },
  {
    imageSrc: photoAsset("agent planting 1.JPG"),
    label: "MAINTENANCE AUDITS",
    title: "Structured survival checkups and soil health follow-ups.",
  },
];


const dueDiligenceAssets = [
  {
    eyebrow: "Capability Statement",
    title: "Download the corporate capability brochure",
    detail: "Review our technology stack, service level agreements, and enterprise-grade delivery models.",
    imageSrc: "/Screenshot lndcheck work.png",
    href: BROCHURE_PDF_SRC,
    cta: "Download brochure",
    download: true,
  },
  {
    eyebrow: "Impact Report Template",
    title: "Preview a verified audit-ready impact report",
    detail: "See how field photographs, coordinates, and seedling survival statistics compile into CSR-compliant PDFs.",
    imageSrc: "/Screenshot landcheck report.png",
    href: "/lc-green-csr-sample-report.pdf",
    cta: "Download sample report",
    download: true,
  },
];

function formatTreeMetric(value: number | null): string {
  if (!value || value <= 0) return "Live";
  return `${value.toLocaleString()}+`;
}

function renderListIcon(label: string) {
  const iconFile = bulletIconMap[label];
  if (iconFile) {
    return (
      <span className="gp-list-icon" aria-hidden="true">
        <img src={svgAsset(iconFile)} alt="" loading="lazy" />
      </span>
    );
  }

  return <span className="gp-list-icon gp-list-icon--fallback" aria-hidden="true" />;
}

export default function GreenPartnersLanding() {
  const { preferences, ready: cookieConsentReady } = useCookieConsent();
  const [partners, setPartners] = useState<PartnerOrg[]>([]);
  const [impactSnapshot, setImpactSnapshot] = useState<ImpactSnapshot | null>(null);
  const [activeModelId, setActiveModelId] = useState(greenModels[0].id);
  const heroVideoEnabled = cookieConsentReady && preferences.experience;

  useEffect(() => {
    let cancelled = false;

    fetchPublicPartnerOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        const mapped = orgs.map((org) => ({ name: org.name, logo: org.logo_url }));
        setPartners(mapped);
      })
      .catch(() => {});

    fetchPublicImpactStats()
      .then((stats) => {
        if (cancelled) return;
        setImpactSnapshot(stats);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const activeModel = greenModels.find((model) => model.id === activeModelId) || greenModels[0];

  const statCards = useMemo(
    () => [
      {
        value: formatTreeMetric(impactSnapshot?.total_trees || 1250000),
        label: "Trees Verified",
        note: "Geotagged growth records across global restoration sites",
        iconSrc: svgAsset(statIconMap["Trees Verified"]),
      },
      {
        value: "100%",
        label: "Audit-Ready Data",
        note: "Fully verified field photos, GPS coordinates, and timestamp logs",
        iconSrc: svgAsset(statIconMap["Audit-Ready Data"]),
      },
      {
        value: "24k+",
        label: "Hectares Monitored",
        note: "Sustainably managed and tracked through satellite analytics",
        iconSrc: svgAsset(statIconMap["Hectares Monitored"]),
      },
      {
        value: "Global",
        label: "ESG Compliance",
        note: "Aligned with corporate CSR audits and national reporting standards",
        iconSrc: svgAsset(statIconMap["ESG Compliance"]),
      },
    ],
    [impactSnapshot?.total_organizations, impactSnapshot?.total_trees, partners.length],
  );

  const focusModel = (modelId: string) => {
    setActiveModelId(modelId);
    window.setTimeout(() => {
      document.getElementById("platform-routes")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <div className="green-partners-page">
      <NavBar
        fixed
        overlay
        logoBadge
        logoSrc="/green-logo-cropped-700.png"
        activeRoute="/green-partners"
        ctaLabel="Get Started"
        ctaRoute="/green-work/login"
      />

      <section
        className="gp-hero"
        style={!heroVideoEnabled ? { backgroundImage: `url("${HERO_FALLBACK_IMAGE}")` } : undefined}
      >
        {heroVideoEnabled && (
          <div className="gp-hero-media" aria-hidden="true">
            <video autoPlay muted loop playsInline preload="auto">
              <source src={HERO_VIDEO_SRC} type="video/mp4" />
            </video>
          </div>
        )}
        <div className="gp-hero-scrim" aria-hidden="true" />
        <div className="gp-shell gp-hero-inner">
          <div className="gp-hero-copy">
            <span className="gp-hero-badge">LC Green</span>
            <h1>
              Restore ecosystems with <span>absolute</span> proof.
            </h1>
            <p>
              The leading verification platform for forestry teams, corporate CSR sponsors, and global ESG initiatives. Track planting, verify survival, and report real-time impact.
            </p>
            <div className="gp-hero-actions">
              <a className="gp-btn gp-btn--primary" href="/green-work/login">
                Start Your Project
              </a>
              <button type="button" className="gp-btn gp-btn--secondary" onClick={() => focusModel(activeModel.id)}>
                Explore Workspaces
              </button>
            </div>
          </div>

          <div className="gp-hero-route-stack" aria-label="LC Green delivery routes">
            {greenModels.map((model) => (
              <button
                key={model.id}
                className="gp-hero-route-card"
                type="button"
                style={{ backgroundImage: `url("${model.heroImage}")` }}
                onClick={() => focusModel(model.id)}
                aria-label={`${model.selectorTitle}. ${model.heroSupport}`}
              >
                <div className="gp-hero-route-card__overlay" aria-hidden="true" />
                <div className="gp-hero-route-card__content">
                  <span className="gp-hero-route-card__eyebrow">{model.heroLabel}</span>
                  <h2>{model.heroStatement}</h2>
                  <p>{model.heroSupport}</p>
                  <span className="gp-hero-route-card__cta">Explore route</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="gp-shell gp-stats-bridge">
        <div className="gp-stats-bar">
          {statCards.map((card) => (
            <article key={card.label} className="gp-stat-card">
              <span className="gp-stat-card__icon" aria-hidden="true">
                <img src={card.iconSrc} alt="" loading="lazy" />
              </span>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
              <small>{card.note}</small>
            </article>
          ))}
        </div>
      </div>

      <section id="platform-routes" className="gp-model-stage">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Choose your model</span>
            <h2>Choose the LC Green model that matches how you work</h2>
            <p>
              One platform, three routes, each designed for a different job.
            </p>
          </div>

          <div className="gp-model-grid">
            <aside className="gp-model-selector">
              {greenModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={`gp-model-selector-card${model.id === activeModel.id ? " is-active" : ""}`}
                  onClick={() => setActiveModelId(model.id)}
                >
                  <span className="gp-model-selector-card__icon" aria-hidden="true">
                    {modelRouteIcons[model.id]}
                  </span>
                  <div className="gp-model-selector-card__body">
                    <strong>{model.selectorTitle}</strong>
                    <span>{model.summary}</span>
                  </div>
                  <span className="gp-model-selector-card__chevron" aria-hidden="true">
                    {modelSelectorChevronIcon}
                  </span>
                </button>
              ))}
            </aside>

            <div className="gp-model-showcase">
              <div className="gp-model-showcase__header">
                <span className="gp-model-accent">{activeModel.accentLabel}</span>
                <h3>{activeModel.selectorTitle}</h3>
                <p>{activeModel.detail}</p>
              </div>

              <div className="gp-device-stage">
                <div className={`gp-device gp-device--desktop gp-device--desktop-${activeModel.id}`}>
                  <img
                    src={activeModel.desktopImage}
                    alt={activeModel.selectorTitle}
                    className={activeModel.desktopFit === "contain" ? "fit-contain" : "fit-cover"}
                    width="1400"
                    height="900"
                    loading="lazy"
                  />
                </div>
                <div className={`gp-device gp-device--phone gp-device--phone-${activeModel.id}`}>
                  <img
                    src={activeModel.phoneImage}
                    alt={`${activeModel.selectorTitle} mobile preview`}
                    className={activeModel.phoneFit === "contain" ? "fit-contain" : "fit-cover"}
                    width="720"
                    height="1520"
                    loading="lazy"
                  />
                </div>
              </div>

              <div className="gp-model-showcase__footer">
                <ul>
                  {activeModel.bullets.map((bullet) => (
                    <li key={bullet}>
                      {renderListIcon(bullet)}
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <a href={activeModel.href}>{activeModel.cta}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="gp-photo-stage">
        <div className="gp-shell">
          <div className="gp-photo-grid">
            {photoMoments.map((moment) => (
              <article key={moment.title} className="gp-photo-card">
                <div className="gp-photo-card__media">
                  <img src={moment.imageSrc} alt={moment.title} loading="lazy" />
                </div>
                <div className="gp-photo-card__body">
                  <span>{moment.label}</span>
                  <h3>{moment.title}</h3>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-strength-stage">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">TRUSTED RESTORATION</span>
            <h2>Built for professional environmental projects</h2>
          </div>
          <div className="gp-pill-grid">
            {whyPillars.map((pillar) => (
              <article key={pillar.label} className="gp-pill-card">
                <span className="gp-pill-card__icon" aria-hidden="true">
                  <img src={pillar.iconSrc} alt="" loading="lazy" />
                </span>
                <p>{pillar.label}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-proof-stage">
        <div className="gp-shell">
          <div className="gp-proof-showcase">
            <div className="gp-proof-content">
              <span className="gp-section-eyebrow">FIELD DEMONSTRATION</span>
              <h2>See how field planting is verified</h2>
              <p>
                Watch how our partner foresters and field agents utilize the LandCheck Green mobile application to log sub-meter GPS coordinates, upload instant photo evidence, and register new growth.
              </p>
              <div className="gp-proof-actions">
                <a href="/green-work/login" className="gp-btn gp-btn--primary">
                  Try the Workspace
                </a>
              </div>
            </div>
            <div className="gp-proof-media">
              <video controls preload="metadata" poster="/thumpnail_public.jpg" className="gp-demo-video">
                <source src={HERO_VIDEO_SRC} type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </section>

      <section className="gp-budget-stage">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">DOCUMENTATION & DEMOS</span>
            <h2>Evaluate the LandCheck platform</h2>
            <p>Download technical specs, preview verified ESG audit documents, or launch the interactive sponsor demo.</p>
          </div>
          <div className="gp-asset-grid">
            {dueDiligenceAssets.map((asset) => (
              <article key={asset.title} className="gp-asset-card">
                {"imageSrc" in asset ? (
                  <div className="gp-asset-card__media">
                    <img src={asset.imageSrc} alt={asset.title} loading="lazy" />
                  </div>
                ) : null}
                <span className="gp-asset-card__eyebrow">{asset.eyebrow}</span>
                <h3>{asset.title}</h3>
                <p>{asset.detail}</p>
                <a href={asset.href} download={asset.download}>
                  {asset.cta}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {partners.length > 0 && (
        <section className="gp-partners-stage">
          <div className="gp-shell">
            <div className="gp-section-intro gp-section-intro--center">
              <span className="gp-section-eyebrow">Partner organisations already in the ecosystem</span>
              <h2>Real field actors already working with LandCheck</h2>
            </div>
            <div className="gp-partner-grid">
              {partners.map((partner) => (
                <article key={partner.name} className="gp-partner-card">
                  {PILOT_ORG_NAMES.has(partner.name) ? <span className="gp-partner-card__tag">Pilot</span> : null}
                  {partner.logo ? (
                    <img src={partner.logo} alt={partner.name} width="96" height="96" loading="lazy" />
                  ) : (
                    <span className="gp-partner-card__fallback">
                      {partner.name
                        .split(" ")
                        .slice(0, 2)
                        .map((word) => word[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <strong>{partner.name}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="gp-footer">
        <div className="gp-shell">
          <div className="gp-footer-panel">
            <div>
              <span className="gp-section-eyebrow">GET STARTED</span>
              <h2>Join the ecosystem.</h2>
              <p>
                Whether you are a planting partner, a corporate donor, or an online sponsor, LandCheck Green is your single source of environmental truth.
              </p>
            </div>
            <div className="gp-footer-panel__actions">
              <div className="gp-footer-buttons">
                <a className="gp-btn gp-btn--primary" href="/green-work/login">
                  Start Your Project
                </a>
                <a className="gp-btn gp-btn--secondary" href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Corporate%20Partnership">
                  Schedule a Demo
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      <footer className="gp-global-footer">
        <div className="gp-shell">
          <div className="gp-global-footer__top">
            <div className="gp-footer-brand">
              <img src="/green-logo-cropped-700.png" alt="LandCheck Green" className="gp-footer-logo" />
              <p className="gp-footer-brand-text">
                Verifiably restoring forests through cryptographic site evidence, real-time tracking, and board-ready reporting.
              </p>
              <div className="gp-footer-badges">
                <span className="gp-badge">GPS Geotagged</span>
                <span className="gp-badge">Audit-Ready</span>
              </div>
            </div>
            
            <div className="gp-footer-links-grid">
              <div className="gp-footer-col">
                <h4>Workspaces</h4>
                <ul>
                  <li><a href="/green/login/field">NGO Campaign Portal</a></li>
                  <li><a href="/green-work/login">CSR Onboarding</a></li>
                  <li><a href="/sponsor">Public Sponsorships</a></li>
                  <li><a href="/green/footprint">Footprint Calculator</a></li>
                </ul>
              </div>
              <div className="gp-footer-col">
                <h4>Solutions</h4>
                <ul>
                  <li><a href="#platform-routes">Corporate CSR Donors</a></li>
                  <li><a href="#platform-routes">Planting NGOs</a></li>
                  <li><a href="#platform-routes">Public Campaigns</a></li>
                </ul>
              </div>
              <div className="gp-footer-col">
                <h4>Resources</h4>
                <ul>
                  <li><a href="/lc-green-corporate-brochure.pdf" download>Capability Brochure</a></li>
                  <li><a href="/lc-green-csr-sample-report.pdf" download>CSR Impact Template</a></li>
                  <li><a href="/privacy">Privacy Policy</a></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="gp-global-footer__bottom">
            <p className="gp-footer-copyright">
              © {new Date().getFullYear()} LandCheck Technology Ltd. All rights reserved.
            </p>
            <div className="gp-footer-status">
              <span className="gp-status-indicator"></span>
              <span>Platform Status: Active</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
