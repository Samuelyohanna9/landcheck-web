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
  "Project and task management": "project_task.svg",
  "Real-time data collection": "Real-time_data.svg",
  "Interactive map workflow": "interactive_map.svg",
  "Maintenance reminders": "maintenace_reminder.svg",
  "Survival monitoring": "Survival_monitoring.svg",
  "Verified field data": "verified_field_data.svg",
  "Impact reporting and analytics": "Impact reporting and analytics.svg",
  "Export-ready executive reports": "Export-ready executive reports.svg",
  "Review queue and quality control": "Review queue and quality control.svg",
  "Sponsor trees online instantly": "Sponsor trees online instantly.svg",
  "Live impact updates": "Live impact updates.svg",
  "Map, image, and certificate proof": "Map, image, and certificate proof.svg",
  "Guest checkout with NGN and USD": "Guest checkout with NGN and USD.svg",
  "Supporter-facing premium experience": "Supporter-facing premium experience.svg",
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
    heroLabel: "For planting partners",
    heroStatement: "Field Operations",
    heroSupport: "Empower planting teams with offline-first tracking, live mapping, and task management.",
    heroImage: "/agent planting 2.JPG",
    selectorTitle: "Forestry & Field Operations",
    title: "Empower planting teams with offline-first tools and real-time mapping.",
    summary: "Assign tasks, capture GPS evidence, and monitor field work live.",
    detail: "Manage remote forestry operations with sub-meter coordinate mapping, offline data storage, and structured survival monitoring tasks.",
    bullets: [
      "Project and task management",
      "Real-time data collection",
      "Survival monitoring",
    ],
    href: "/green/login/field",
    cta: "Access field workspace",
    desktopImage: "/screenshotlandche green 2.png",
    phoneImage: "/screenshot phone-green.jpg",
    desktopFit: "contain",
    phoneFit: "contain",
    accentLabel: "Partner Workspace",
  },
  {
    id: "csr",
    heroLabel: "For corporate CSR",
    heroStatement: "CSR Verification",
    heroSupport: "Deliver audit-ready transparency to sustainability executives with satellite-backed evidence.",
    heroImage: "/ecf-partnership.jpeg",
    selectorTitle: "Corporate CSR & ESG Verification",
    title: "Deliver auditable restoration proof to sustainability stakeholders.",
    summary: "Transparency dashboards, satellite validations, and PDF reporting.",
    detail: "Convert raw field logs into structured, board-ready impact disclosures. Access high-resolution evidence, review planting timelines, and download certified ESG summaries.",
    bullets: [
      "Verified field data",
      "Impact reporting and analytics",
      "Review queue and quality control",
    ],
    href: "/green-work/login",
    cta: "See verification tools",
    desktopImage: "/Screenshot landcheck report.png",
    phoneImage: "/Screenshot landcheck report 2.png",
    desktopFit: "contain",
    phoneFit: "contain",
    accentLabel: "CSR Dashboard",
  },
  {
    id: "public",
    heroLabel: "For public campaigns",
    heroStatement: "Supporter Portals",
    heroSupport: "Engage public sponsors with interactive maps, digital certificates, and live growth timelines.",
    heroImage: "/thumpnail_public.jpg",
    selectorTitle: "Interactive Supporter Portals",
    title: "Engage sponsors with custom checkout routes and live tracking maps.",
    summary: "Branded checkout portals, digital certificates, and growth feeds.",
    detail: "Provide corporate donors and the public with a gorgeous dashboard to purchase sponsorships, download personalized PDF certificates, and explore satellite map pins of their trees.",
    bullets: [
      "Sponsor trees online instantly",
      "Live impact updates",
      "Map, image, and certificate proof",
    ],
    href: "/sponsor",
    cta: "Preview sponsor portal",
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

const proofHighlights = [
  "High-resolution geotagged photos",
  "Secure cryptographic GPS coordinates",
  "Unified NGO and Corporate workspaces",
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
  {
    eyebrow: "Supporter Experience",
    title: "Explore the public supporter dashboard",
    detail: "See how sponsors fund restoration projects online, download certificates, and track tree growth interactively.",
    imageSrc: "/sponsor-tree-app.jpeg",
    href: "/sponsor",
    cta: "Launch demo portal",
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
                <div className="gp-device gp-device--desktop">
                  <img
                    src={activeModel.desktopImage}
                    alt={activeModel.selectorTitle}
                    className={activeModel.desktopFit === "contain" ? "fit-contain" : "fit-cover"}
                    width="1400"
                    height="900"
                    loading="lazy"
                  />
                </div>
                <div className="gp-device gp-device--phone">
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
            <article className="gp-photo-lead">
              <span className="gp-section-eyebrow">FIELDPROOF</span>
              <h2>Uncompromising verification from the soil up.</h2>
              <p>We verify every planting activity using high-precision GPS coordinates, timestamps, and physical photo validation directly from the field.</p>
              <ul className="gp-photo-points">
                {proofHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

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
        <div className="gp-shell gp-proof-grid">
          <article className="gp-proof-card">
            <span className="gp-section-eyebrow">FIELD DEMONSTRATION</span>
            <h3>See how field planting is verified</h3>
            <p>Watch how forestry operators utilize the LandCheck platform in remote areas to log coordinates and verify survival.</p>
            <video controls preload="metadata" poster="/thumpnail_public.jpg" className="gp-demo-video">
              <source src={HERO_VIDEO_SRC} type="video/mp4" />
            </video>
          </article>

          <article className="gp-proof-card gp-proof-card--dashboard">
            <span className="gp-section-eyebrow">PLATFORM WALKTHROUGH</span>
            <h3>Monitor trees, routes, and impact metrics in real time</h3>
            <p>
              View coordinates, verify high-resolution photo evidence, track maintenance logs, and generate executive-level reports.
            </p>
            <div className="gp-proof-screenshot">
              <img
                src="/Screenshot lndcheck work.png"
                alt="LandCheck Green dashboard overview"
                width="1400"
                height="900"
                loading="lazy"
              />
            </div>
            <div className="gp-proof-actions">
              <a href="/green-work/login">View full dashboard</a>
              <a href="mailto:landchecktech@gmail.com?subject=LC%20Green%20Demo">Request a demo</a>
            </div>
          </article>
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
    </div>
  );
}
