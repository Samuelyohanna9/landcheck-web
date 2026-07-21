import { useEffect, useMemo, useState } from "react";
import "../styles/green-partners.css";
import { fetchPublicImpactStats, fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";
import { useCookieConsent } from "../privacy/cookieConsent";

type PartnerOrg = { name: string; logo: string | null };
type ImpactSnapshot = { total_trees: number; total_organizations: number };
type MediaFit = "cover" | "contain";
type StatIcon = "tree" | "models" | "partners" | "checkout";

type GreenModel = {
  id: string;
  order: string;
  heroLabel: string;
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

const greenModels: GreenModel[] = [
  {
    id: "field",
    order: "01",
    heroLabel: "Field operations",
    selectorTitle: "Field control for partner organisations",
    title: "Turn field operations for partner teams into live, controlled delivery.",
    summary: "Assign tasks, collect field data, track maintenance, and monitor survival from one route.",
    detail:
      "Manage projects, assign tasks, collect field data, monitor progress, and roll evidence into one controlled partner workflow.",
    bullets: [
      "Project and task management",
      "Real-time data collection",
      "Interactive map workflow",
      "Maintenance reminders",
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
    order: "02",
    heroLabel: "Certified transparency",
    selectorTitle: "Verified implementation for corporate and donor programmes",
    title: "Deliver verified corporate and donor programmes with evidence, reports, and implementation control.",
    summary: "Real-time dashboards, reports, and impact metrics you can trust.",
    detail:
      "Track implementation with verified data, mapped outputs, survival monitoring, and board-ready CSR reporting from one premium workspace.",
    bullets: [
      "Verified field data",
      "Survival monitoring",
      "Impact reporting and analytics",
      "Export-ready executive reports",
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
    order: "03",
    heroLabel: "Online supporters",
    selectorTitle: "A premium route for online supporters",
    title: "Let supporters fund and follow impact online with certificates, map proof, and live updates.",
    summary: "A premium online route for donors and supporters to engage and see impact.",
    detail:
      "Give supporters a simple way to fund trees online, receive certificates, and follow verified real-world impact from payment to planting.",
    bullets: [
      "Sponsor trees online instantly",
      "Live impact updates",
      "Map, image, and certificate proof",
      "Guest checkout with NGN and USD",
      "Supporter-facing premium experience",
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
  "Built for forestry and restoration projects",
  "Designed for NGOs, communities, and companies",
  "Offline-first with smart sync",
  "From planting to survival and impact",
  "Secure, transparent, and audit-ready",
];

const budgetSignals = [
  "Clear project scope and methodology",
  "Live data and proof of implementation",
  "Survival monitoring and maintenance plan",
  "Impact metrics and reporting outputs",
  "Budget breakdown and cost visibility",
];

const dueDiligenceAssets = [
  {
    eyebrow: "Brochure PDF",
    title: "Download the LC Green Corporate brochure",
    detail:
      "A concise executive handout covering delivery scope, field control, reporting outputs, and the routes available inside LC Green.",
    href: BROCHURE_PDF_SRC,
    cta: "Download brochure",
    download: true,
  },
  {
    eyebrow: "Sample CSR report",
    title: "Show stakeholders what the reporting package looks like",
    detail:
      "Preview the type of executive-ready report LC Green can generate from verified field implementation and timeline evidence.",
    href: "/lc-green-csr-sample-report.pdf",
    cta: "Download sample report",
    download: true,
  },
  {
    eyebrow: "Public sponsor page",
    title: "See the premium public-facing sponsorship route",
    detail:
      "Explore the online supporter route where people can pay, receive certificates, and follow tree impact with map-backed updates.",
    href: "/sponsor",
    cta: "Open public sponsor page",
  },
  {
    eyebrow: "Case study",
    title: "Use the pilot story as proof of ecosystem traction",
    detail:
      "Share how LandCheck is already working with real partner organisations and building the operational systems behind verified impact.",
    href: "/news#ecf-partnership",
    cta: "Read case study",
  },
];

const workflowStages = [
  {
    step: "01",
    title: "Discover & Align",
    detail: "Understand goals, scope, locations, stakeholders, and the evidence needed before deployment starts.",
  },
  {
    step: "02",
    title: "Design & Plan",
    detail: "Define project routes, species mix, approvals, staffing model, and reporting expectations.",
  },
  {
    step: "03",
    title: "Implement & Monitor",
    detail: "Run field assignments, capture map-linked data, review evidence, and monitor progress in real time.",
  },
  {
    step: "04",
    title: "Report & Validate",
    detail: "Generate premium reports, validate outputs, and present impact with confidence to stakeholders.",
  },
  {
    step: "05",
    title: "Scale & Sustain",
    detail: "Improve survival, expand routes, and create long-term programme value from verified implementation data.",
  },
];

const expertiseCards = [
  {
    title: "How to manage corporate tree-planting projects",
    blurb: "A practical guide to scope, land rights, implementation, maintenance, and stakeholder reporting.",
    href: "/news#corporate-tree-projects",
  },
  {
    title: "CSR reporting checklist for implementation teams",
    blurb: "What a CSR manager needs before approving a field programme: maps, evidence, risks, and reporting cadence.",
    href: "/news#csr-reporting-checklist",
  },
  {
    title: "GPS verification for environmental projects",
    blurb: "Why coordinates, timestamped photos, and supervisor review are essential to project credibility.",
    href: "/news#gps-verification",
  },
  {
    title: "Environmental project monitoring made easier",
    blurb: "How to move from spreadsheets to live implementation oversight without losing field accountability.",
    href: "/news#environmental-monitoring",
  },
  {
    title: "ESG reporting made easier with field evidence",
    blurb: "Turn implementation records into reportable outcomes for boards, donors, and public stakeholders.",
    href: "/news#esg-reporting-easier",
  },
];

function formatTreeMetric(value: number | null): string {
  if (!value || value <= 0) return "Live";
  return `${value.toLocaleString()}+`;
}

function renderStatIcon(icon: StatIcon) {
  switch (icon) {
    case "tree":
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
          <path
            d="M12 21v-4m0 0c-2.6 0-4.6-1.4-5.5-3.9 1 .3 1.9.4 2.7.2C8.2 10.8 9.1 9 12 7c2.9 2 3.8 3.8 2.8 6.3.8.2 1.7.1 2.7-.2-.9 2.5-2.9 3.9-5.5 3.9Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "models":
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
          <rect x="3.5" y="4" width="7" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="4" width="7" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
          <rect x="8.5" y="14" width="7" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7 10.5v2h10v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "partners":
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
          <circle cx="8" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M4.5 18c.6-2.3 2.5-3.8 5-3.8S13.9 15.7 14.5 18M14.3 17c.4-1.7 1.8-2.8 3.7-2.8 1.7 0 3 .9 3.5 2.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "checkout":
      return (
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
          <rect x="3.5" y="6" width="17" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 14h3.2M14.5 14h1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
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
        icon: "tree" as const,
      },
      {
        value: "3",
        label: "Delivery models",
        note: "Organisation, CSR, and public sponsor routes",
        icon: "models" as const,
      },
      {
        value: String(Math.max(impactSnapshot?.total_organizations || 0, partners.length || 0, 1)),
        label: "Partner organisations",
        note: "Already operating inside the LandCheck ecosystem",
        icon: "partners" as const,
      },
      {
        value: "NGN + USD",
        label: "Checkout ready",
        note: "Flexible public sponsorship payments with live tracking",
        icon: "checkout" as const,
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
              LC Green helps organisations and communities plant, monitor, and protect trees with data,
              transparency, and purpose across partner operations, corporate programmes, and public sponsorship.
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
              <article key={model.id} className="gp-hero-route-card">
                <span className="gp-hero-route-card__eyebrow">{model.heroLabel}</span>
                <h2>{model.title}</h2>
                <p>{model.summary}</p>
                <button type="button" onClick={() => focusModel(model.id)}>
                  See how it works
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="gp-shell gp-stats-bridge">
        <div className="gp-stats-bar">
          {statCards.map((card) => (
            <article key={card.label} className="gp-stat-card">
              <span className="gp-stat-card__icon">{renderStatIcon(card.icon)}</span>
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
              Whether you are managing field teams, reporting to donors, or engaging supporters, LC Green has you
              covered with a route designed for the job.
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
                  <div>
                    <strong>{model.selectorTitle}</strong>
                    <span>{model.summary}</span>
                  </div>
                  <em>{model.order}</em>
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
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <a href={activeModel.href}>{activeModel.cta}</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="gp-story-stage">
        <div className="gp-shell">
          {greenModels.map((model, index) => (
            <article
              key={model.id}
              className={`gp-story-card${index % 2 === 1 ? " is-reversed" : ""}`}
            >
              <div className="gp-story-card__copy">
                <span className="gp-story-card__eyebrow">{model.selectorTitle}</span>
                <h3>{model.title}</h3>
                <p>{model.detail}</p>
                <ul>
                  {model.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <a href={model.href}>{model.cta}</a>
              </div>
              <div className="gp-story-card__media">
                <div className="gp-story-screen gp-story-screen--desktop">
                  <img
                    src={model.desktopImage}
                    alt={model.selectorTitle}
                    className={model.desktopFit === "contain" ? "fit-contain" : "fit-cover"}
                    width="1400"
                    height="900"
                    loading="lazy"
                  />
                </div>
                <div className="gp-story-screen gp-story-screen--phone">
                  <img
                    src={model.phoneImage}
                    alt={`${model.selectorTitle} mobile`}
                    className={model.phoneFit === "contain" ? "fit-contain" : "fit-cover"}
                    width="720"
                    height="1520"
                    loading="lazy"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="gp-strength-stage">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Why LC Green</span>
            <h2>Why LC Green feels stronger than a generic field app</h2>
          </div>
          <div className="gp-pill-grid">
            {whyPillars.map((pillar) => (
              <article key={pillar} className="gp-pill-card">
                <span className="gp-pill-card__icon" aria-hidden="true" />
                <p>{pillar}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-proof-stage">
        <div className="gp-shell gp-proof-grid">
          <article className="gp-proof-card">
            <span className="gp-section-eyebrow">Truth and transparency</span>
            <h3>Show the platform before the sales call</h3>
            <p>Let buyers see how LC Green works in action before they ask for a full demo.</p>
            <video controls preload="metadata" poster="/thumpnail_public.jpg" className="gp-demo-video">
              <source src={HERO_VIDEO_SRC} type="video/mp4" />
            </video>
          </article>

          <article className="gp-proof-card gp-proof-card--dashboard">
            <span className="gp-section-eyebrow">Platform walkthrough</span>
            <h3>Walk buyers through the trees, routes, and survival data that justify the budget.</h3>
            <p>
              Use one premium view to explain route control, implementation evidence, maintenance status, and
              export-ready reporting.
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
            <span className="gp-section-eyebrow">Before you ask for budget</span>
            <h2>Everything a CSR manager should see before you ask for budget</h2>
          </div>
          <div className="gp-budget-signal-row">
            {budgetSignals.map((signal) => (
              <span key={signal} className="gp-budget-signal">
                {signal}
              </span>
            ))}
          </div>
          <div className="gp-asset-grid">
            {dueDiligenceAssets.map((asset) => (
              <article key={asset.title} className="gp-asset-card">
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

      <section className="gp-workflow-stage">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">How the workflow is sold and delivered</span>
            <h2>From discovery to reporting, LC Green stays structured the whole way</h2>
          </div>
          <div className="gp-workflow-grid">
            {workflowStages.map((stage) => (
              <article key={stage.step} className="gp-workflow-card">
                <span className="gp-workflow-card__step">{stage.step}</span>
                <h3>{stage.title}</h3>
                <p>{stage.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-expertise-stage">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Published expertise</span>
            <h2>Use expertise content to strengthen credibility and discovery</h2>
          </div>
          <div className="gp-expertise-grid">
            {expertiseCards.map((card) => (
              <article key={card.title} className="gp-expertise-card">
                <h3>{card.title}</h3>
                <p>{card.blurb}</p>
                <a href={card.href}>Read article</a>
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
              <span className="gp-section-eyebrow">Next step</span>
              <h2>Present LC Green Corporate like a premium implementation partner.</h2>
              <p>
                Download the brochure, show the sample report, and take buyers into the operational dashboard only
                when they are ready for the deeper conversation.
              </p>
            </div>
            <div className="gp-footer-panel__actions">
              <a href={BROCHURE_PDF_SRC} download>
                Download brochure
              </a>
              <a href="/green-work/login">Open Work login</a>
              <a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Corporate%20Partnership">
                Schedule a demo
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
