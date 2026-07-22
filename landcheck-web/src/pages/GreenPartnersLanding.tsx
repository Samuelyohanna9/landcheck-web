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
  "Trees tracked": "Trees Tracked.svg",
  "Delivery models": "Delivery Models.svg",
  "Partner organisations": "Partner Organisations.svg",
  "Checkout ready": "NGN + USD Checkout Ready.svg",
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
    heroLabel: "Field operations",
    heroStatement: "We Plant",
    heroSupport: "Field teams plant, capture, and maintain with live control.",
    heroImage: "/agent planting 2.JPG",
    selectorTitle: "Field control for partner teams",
    title: "Turn field operations for partner teams into live, controlled delivery.",
    summary: "Assign, capture, and track field work from one route.",
    detail: "Live task control, map capture, and survival follow-up in one route.",
    bullets: [
      "Project and task management",
      "Real-time data collection",
      "Survival monitoring",
    ],
    href: "/green/login/field",
    cta: "Explore field operations",
    desktopImage: "/screenshotlandche green 2.png",
    phoneImage: "/screenshot phone-green.jpg",
    desktopFit: "contain",
    phoneFit: "contain",
    accentLabel: "Partner route",
  },
  {
    id: "csr",
    heroLabel: "Certified transparency",
    heroStatement: "We Verify",
    heroSupport: "Corporate and donor programmes backed by evidence and premium reporting.",
    heroImage: "/ecf-partnership.jpeg",
    selectorTitle: "Verified CSR delivery",
    title: "Deliver verified corporate and donor programmes with evidence, reports, and implementation control.",
    summary: "Verified dashboards, evidence, and premium reports.",
    detail: "Verified delivery, mapped evidence, and board-ready reporting from one workspace.",
    bullets: [
      "Verified field data",
      "Impact reporting and analytics",
      "Review queue and quality control",
    ],
    href: "/green-work/login",
    cta: "See verification in action",
    desktopImage: "/Screenshot landcheck report.png",
    phoneImage: "/Screenshot landcheck report 2.png",
    desktopFit: "contain",
    phoneFit: "contain",
    accentLabel: "CSR route",
  },
  {
    id: "public",
    heroLabel: "Online supporters",
    heroStatement: "We Restore",
    heroSupport: "Supporters fund trees online and follow transparent impact as it grows.",
    heroImage: "/thumpnail_public.jpg",
    selectorTitle: "Public sponsor experience",
    title: "Let supporters fund and follow impact online with certificates, map proof, and live updates.",
    summary: "A premium supporter route with payment, proof, and updates.",
    detail: "Online sponsorship with payment, certificates, and live impact proof.",
    bullets: [
      "Sponsor trees online instantly",
      "Live impact updates",
      "Map, image, and certificate proof",
    ],
    href: "/sponsor",
    cta: "See supporter experience",
    desktopImage: "/info.png",
    phoneImage: "/sponsor-tree-app.jpeg",
    desktopFit: "contain",
    phoneFit: "cover",
    accentLabel: "Public sponsor route",
  },
];

const whyPillars = [
  {
    label: "Built for forestry and restoration projects",
    iconSrc: svgAsset("Built for forestry and restoration projects.svg"),
  },
  {
    label: "Designed for NGOs, communities, and companies",
    iconSrc: svgAsset("Designed for NGOs, communities, and companies.svg"),
  },
  {
    label: "Offline-first with smart sync",
    iconSrc: svgAsset("Offline-first with smart sync.svg"),
  },
  {
    label: "From planting to survival and impact",
    iconSrc: svgAsset("From planting to survival and impact.svg"),
  },
  {
    label: "Secure, transparent, and audit-ready",
    iconSrc: svgAsset("Secure, transparent, and audit-ready.svg"),
  },
];

const photoMoments = [
  {
    imageSrc: photoAsset("agent planting 2.JPG"),
    label: "Field delivery",
    title: "Planting work is captured where it happens.",
  },
  {
    imageSrc: photoAsset("tree_adamawa.JPG"),
    label: "Community proof",
    title: "Real teams, real seedlings, real locations.",
  },
  {
    imageSrc: photoAsset("agent planting 1.JPG"),
    label: "Protection setup",
    title: "Protection and care are part of the workflow.",
  },
];

const proofHighlights = [
  "Real field photos",
  "GPS-linked proof",
  "CSR and sponsor routes in one platform",
];

const dueDiligenceAssets = [
  {
    eyebrow: "Brochure PDF",
    title: "Download the LC Green Corporate brochure",
    detail: "A comprehensive overview of our technology stack, partnership structures, and delivery models.",
    imageSrc: "/Screenshot lndcheck work.png",
    href: BROCHURE_PDF_SRC,
    cta: "Download brochure",
    download: true,
  },
  {
    eyebrow: "Sample CSR report",
    title: "Preview a verified audit-ready impact report",
    detail: "See how we compile field photographs, coordinates, and seedling survival statistics into board-ready PDFs.",
    imageSrc: "/Screenshot landcheck report.png",
    href: "/lc-green-csr-sample-report.pdf",
    cta: "Download sample report",
    download: true,
  },
  {
    eyebrow: "Public sponsor page",
    title: "Explore the public supporter portal",
    detail: "Experience how sponsors fund trees online, download digital certificates, and track growth interactively.",
    imageSrc: "/sponsor-tree-app.jpeg",
    href: "/sponsor",
    cta: "Open public sponsor page",
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
        value: formatTreeMetric(impactSnapshot?.total_trees || null),
        label: "Trees tracked",
        note: "Across field, CSR, and sponsor workflows",
        iconSrc: svgAsset(statIconMap["Trees tracked"]),
      },
      {
        value: "3",
        label: "Delivery models",
        note: "Organisation, CSR, and public sponsor routes",
        iconSrc: svgAsset(statIconMap["Delivery models"]),
      },
      {
        value: String(Math.max(impactSnapshot?.total_organizations || 0, partners.length || 0, 1)),
        label: "Partner organisations",
        note: "Already operating inside the LandCheck ecosystem",
        iconSrc: svgAsset(statIconMap["Partner organisations"]),
      },
      {
        value: "NGN + USD",
        label: "Checkout ready",
        note: "Flexible public sponsorship payments with live tracking",
        iconSrc: svgAsset(statIconMap["Checkout ready"]),
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
              One <span>green</span> platform. Three professional delivery models.
            </h1>
            <p>
              LC Green helps teams plant, verify, and report restoration work without losing the field reality.
            </p>
            <div className="gp-hero-actions">
              <a className="gp-btn gp-btn--primary" href="/green-work/login">
                Start Your Project
              </a>
              <button type="button" className="gp-btn gp-btn--secondary" onClick={() => focusModel(activeModel.id)}>
                Explore the Platform
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
              <span className="gp-section-eyebrow">Field transparency</span>
              <h2>Real-time field validation.</h2>
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
            <span className="gp-section-eyebrow">PLATFORM RESOURCES</span>
            <h2>Explore our platform assets</h2>
            <p>Access our corporate brochures, download sample reports, or review the public checkout portal.</p>
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
              <h2>Deliver verified restoration.</h2>
              <p>
                Start tracking your restoration projects with real-time field evidence and board-ready reporting.
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
              <a className="gp-footer-link" href={BROCHURE_PDF_SRC} download>
                Download brochure (PDF)
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
