import { useEffect, useState } from "react";
import "../styles/green-partners.css";
import { fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";

type PartnerOrg = { name: string; logo: string | null };
type ShowcaseItem = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  audience: string;
  proofItems: string[];
  image: string;
  fit?: "cover" | "contain";
};

const HERO_VIDEO_SRC = "/let_the_video_be_black_nigeria.mp4";
const BROCHURE_PDF_SRC = "/lc-green-corporate-brochure.pdf";
const PILOT_ORG_NAMES = new Set(["Think Green Foundation"]);

const deliverySignals = [
  "Organisation operations",
  "CSR implementation",
  "Public tree sponsorship",
  "Evidence-rich reporting",
];

const platformRouteCards = [
  {
    eyebrow: "Organisation route",
    title: "Run field operations for partner teams",
    detail: "For NGOs, programme teams, and field supervisors managing internal capture, reviews, and maintenance work.",
    href: "/green/login/field",
    cta: "Open field login",
  },
  {
    eyebrow: "CSR route",
    title: "Deliver verified corporate programmes",
    detail: "For sustainability and CSR managers who need operational control, evidence governance, and export-ready reporting.",
    href: "/green-work/login",
    cta: "Open Work login",
  },
  {
    eyebrow: "Public sponsor route",
    title: "Let sponsors fund and follow trees online",
    detail: "For public campaigns where individuals or brands can pay online, receive certificates, and follow map-backed updates.",
    href: "/sponsor",
    cta: "Open sponsor route",
  },
] as const;

const routeSpotlights = [
  {
    eyebrow: "Organisation operations",
    title: "Field control for partner organisations",
    detail: "Give organisation teams a structured field route for tree records, maintenance work, reviews, and daily programme execution.",
    points: ["Assigned field capture and maintenance flow", "Supervisor review and evidence visibility", "Mapped programme records and export support"],
    href: "/green/login/field",
    cta: "Field route access",
    image: "/screenshot phone-green.jpg",
    fit: "contain" as const,
  },
  {
    eyebrow: "CSR and ESG delivery",
    title: "Verified implementation for corporate and donor programmes",
    detail: "Move beyond planting claims with field assignments, GPS proof, timeline visibility, and premium reports for leadership and stakeholders.",
    points: ["Implementation orders and programme controls", "Board-ready CSR and ESG reporting", "Maintenance and survival visibility after planting day"],
    href: "/green-work/login",
    cta: "Open CSR workspace",
    image: "/Screenshot landcheck report.png",
    fit: "contain" as const,
  },
  {
    eyebrow: "Public tree sponsorship",
    title: "A premium route for online supporters",
    detail: "Allow individuals and organisations to sponsor trees online, receive certificates, and follow verified updates with map and photo proof.",
    points: ["NGN and USD online sponsorship", "Guest checkout plus account route", "Certificate, GPS proof, and public storytelling"],
    href: "/sponsor",
    cta: "View sponsor experience",
    image: "/sponsor-tree-app.jpeg",
    fit: "cover" as const,
  },
] as const;

const executiveCards = [
  {
    title: "Project planning",
    detail: "Define locations, species mix, partners, implementation phases, and reporting cadence before field deployment starts.",
  },
  {
    title: "Verified implementation",
    detail: "Track who planted what, where it happened, and what proof was captured at each step of delivery.",
  },
  {
    title: "Maintenance oversight",
    detail: "Monitor follow-up field visits, tree survival, risk flags, and unresolved issues from one dashboard.",
  },
  {
    title: "Stakeholder reporting",
    detail: "Prepare board, donor, media, and sustainability updates using map proof, photos, and exportable summaries.",
  },
];

const showcaseItems: ShowcaseItem[] = [
  {
    id: "ops",
    eyebrow: "Programme control",
    title: "Implementation control board",
    blurb: "Assign planting orders, review evidence, monitor staff output, and keep programme delivery on track.",
    audience: "Best for CSR leads, programme managers, and operations teams.",
    proofItems: ["Named work orders", "Live staffing visibility", "Backlog and approval control"],
    image: "/Screenshot lndcheck work.png",
    fit: "cover",
  },
  {
    id: "reports",
    eyebrow: "Reporting outputs",
    title: "Board-ready CSR reporting",
    blurb: "Export premium reports with survival rates, evidence coverage, carbon snapshots, and implementation timelines.",
    audience: "Best for leadership, sustainability teams, donor reviews, and board updates.",
    proofItems: ["Executive summary pages", "Evidence coverage metrics", "Timeline and carbon reporting"],
    image: "/Screenshot landcheck report.png",
    fit: "contain",
  },
  {
    id: "review",
    eyebrow: "Evidence governance",
    title: "Supervisor review workflow",
    blurb: "Approve or reject planting and field submissions with the exact photos, coordinates, and implementation context attached.",
    audience: "Best for field supervisors, quality assurance, and partner oversight.",
    proofItems: ["Submission review", "GPS-linked evidence", "Clear accept or reject trace"],
    image: "/Screenshot landcheck work 2.png",
    fit: "cover",
  },
  {
    id: "field",
    eyebrow: "Field execution",
    title: "Field app execution",
    blurb: "Support field agents with guided mobile capture, QR-linked records, and live sync back to the central dashboard.",
    audience: "Best for showing how field execution becomes reporting evidence.",
    proofItems: ["Guided mobile capture", "QR-tag workflow", "Fast sync into dashboard"],
    image: "/screenshot phone-green.jpg",
    fit: "contain",
  },
];

const dueDiligenceAssets = [
  {
    eyebrow: "Brochure PDF",
    title: "One-page LC Green Corporate brochure",
    detail: "A concise executive handout covering implementation scope, controls, outputs, and contact route.",
    href: BROCHURE_PDF_SRC,
    cta: "Download brochure",
    download: true,
  },
  {
    eyebrow: "Sample CSR report",
    title: "Download a sample executive report",
    detail: "Show stakeholders the reporting package style you can produce from verified field execution, governance controls, and field evidence.",
    href: "/lc-green-csr-sample-report.pdf",
    cta: "Download sample report",
    download: true,
  },
  {
    eyebrow: "Public project page",
    title: "Sponsor and transparency experience",
    detail: "See how the public-facing experience can connect sponsorship, impact storytelling, and field proof.",
    href: "/sponsor",
    cta: "Open public project page",
  },
  {
    eyebrow: "Case study",
    title: "Pilot partnership story",
    detail: "Use an early strategic partnership story to show buyers that real organisations are already working with LandCheck.",
    href: "/news#ecf-partnership",
    cta: "Read case study",
  },
];

const deliveryFlow = [
  {
    step: "01",
    title: "Design the CSR programme",
    detail: "Define target location, land approval, species plan, field team structure, and reporting expectations.",
  },
  {
    step: "02",
    title: "Deploy and verify",
    detail: "Assign field agents, capture GPS evidence, manage QR-linked records, and review submissions centrally.",
  },
  {
    step: "03",
    title: "Maintain and monitor",
    detail: "Track survival, schedule field visits, resolve risks early, and keep the implementation register current.",
  },
  {
    step: "04",
    title: "Report to stakeholders",
    detail: "Export reports, share proof pages, and provide executive summaries for CSR, ESG, donor, or board reporting.",
  },
];

const insightArticles = [
  {
    title: "How to manage corporate tree-planting projects",
    blurb: "A practical guide to scope, land rights, field delivery, maintenance, and stakeholder reporting.",
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

const trustPillars = [
  {
    title: "Useful for GRI-style reporting inputs",
    detail: "Capture implementation evidence and material programme updates in a format CSR teams can reuse in sustainability narratives.",
  },
  {
    title: "Supportive of IFRS S1/S2-style disclosure workflows",
    detail: "Keep traceable records around climate action delivery, field controls, and programme progress for internal reporting teams.",
  },
  {
    title: "Built for Nigerian field realities",
    detail: "Works across partner organisations, field agents, CSR programmes, and public sponsorship models in the same ecosystem.",
  },
];

export default function GreenPartnersLanding() {
  const [partners, setPartners] = useState<PartnerOrg[]>([]);
  const [activeShowcaseId, setActiveShowcaseId] = useState(showcaseItems[0]?.id || "ops");

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

  const activeShowcase = showcaseItems.find((item) => item.id === activeShowcaseId) || showcaseItems[0];

  return (
    <div className="green-partners-page">
      <NavBar
        fixed
        overlay
        logoBadge
        logoSrc="/green-logo-cropped-700.png"
        activeRoute="/green-partners"
        ctaLabel="Open Work Login"
        ctaRoute="/green-work/login"
      />

      <section className="gp-corporate-hero">
        <div className="gp-corporate-hero-media" aria-hidden="true">
          <video autoPlay muted loop playsInline preload="auto">
            <source src={HERO_VIDEO_SRC} type="video/mp4" />
          </video>
          <div className="gp-corporate-hero-overlay" />
        </div>
        <div className="gp-corporate-hero-inner">
          <div className="gp-corporate-copy">
            <span className="gp-corporate-eyebrow">LandCheck Green Platform</span>
            <h1>One green platform. Three professional delivery models.</h1>
            <p>
              LandCheck Green supports partner organisation field work, corporate CSR and ESG implementation, and
              public tree sponsorship from one evidence-first ecosystem built for Nigeria.
            </p>
            <div className="gp-corporate-signal-row">
              {deliverySignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
            <div className="gp-corporate-actions">
              <a className="gp-corporate-btn gp-corporate-btn--primary" href="#platform-routes">
                Compare the routes
              </a>
              <a className="gp-corporate-btn gp-corporate-btn--secondary" href="/sponsor">
                Open sponsor route
              </a>
              <a
                className="gp-corporate-btn gp-corporate-btn--ghost"
                href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Corporate%20Demo"
              >
                Request platform demo
              </a>
            </div>
          </div>

          <div className="gp-platform-route-stack" aria-label="LandCheck Green route summary">
            {platformRouteCards.map((item) => (
              <article key={item.title} className="gp-platform-route-card">
                <span className="gp-platform-route-eyebrow">{item.eyebrow}</span>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
                <a href={item.href}>{item.cta}</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform-routes" className="gp-route-stage">
        <div className="gp-shell">
          <div className="gp-section-head">
            <span className="gp-section-eyebrow">Platform routes</span>
            <h2>Choose the LC Green model that matches how you work</h2>
            <p>
              Whether you are coordinating internal field teams, running a branded CSR programme, or opening tree
              sponsorship to the public, the platform should feel intentional and premium at every route.
            </p>
          </div>
          <div className="gp-route-grid">
            {routeSpotlights.map((item) => (
              <article key={item.title} className="gp-route-card">
                <div className="gp-route-card-copy">
                  <span className="gp-route-card-eyebrow">{item.eyebrow}</span>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <ul>
                    {item.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <a href={item.href}>{item.cta}</a>
                </div>
                <div className="gp-route-card-media">
                  <img
                    src={item.image}
                    alt={item.title}
                    className={item.fit === "contain" ? "fit-contain" : "fit-cover"}
                    width="960"
                    height="720"
                    loading="lazy"
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-executive-strip">
        <div className="gp-shell">
          <div className="gp-section-head">
            <span className="gp-section-eyebrow">Executive value</span>
            <h2>Why LC Green feels stronger than a generic field app</h2>
            <p>
              The product becomes more credible when every route feels intentionally designed for its user: field
              teams, corporate managers, and public sponsors.
            </p>
          </div>
          <div className="gp-executive-grid">
            {executiveCards.map((item) => (
              <article key={item.title} className="gp-executive-card">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-proof-stage">
        <div className="gp-shell gp-proof-grid">
          <article className="gp-panel gp-video-panel">
            <div className="gp-panel-head">
              <span className="gp-section-eyebrow">Demo video</span>
              <h2>Show the platform before the sales call</h2>
            </div>
            <video controls preload="metadata" poster="/thumpnail_public.jpg" className="gp-demo-video">
              <source src={HERO_VIDEO_SRC} type="video/mp4" />
            </video>
            <p className="gp-panel-note">
              Use a short walkthrough to introduce the dashboard, field capture flow, reporting outputs, and the
              public-facing proof experience.
            </p>
          </article>

          <article className="gp-panel gp-showcase-panel">
            <div className="gp-panel-head">
              <span className="gp-section-eyebrow">Interactive screenshots</span>
              <h2>Walk buyers through the exact working surfaces that justify the budget</h2>
            </div>
            <div className="gp-showcase-main">
              <img
                src={activeShowcase.image}
                alt={activeShowcase.title}
                className={activeShowcase.fit === "contain" ? "fit-contain" : "fit-cover"}
                width="1280"
                height="720"
                loading="lazy"
              />
            </div>
            <div className="gp-showcase-copy">
              <div className="gp-showcase-metadata">
                <span>{activeShowcase.eyebrow}</span>
                <strong>{activeShowcase.audience}</strong>
              </div>
              <h3>{activeShowcase.title}</h3>
              <p>{activeShowcase.blurb}</p>
              <ul className="gp-showcase-proof-list">
                {activeShowcase.proofItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="gp-showcase-tabs">
              {showcaseItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === activeShowcase.id ? "is-active" : ""}
                  onClick={() => setActiveShowcaseId(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="gp-assets-stage">
        <div className="gp-shell">
          <div className="gp-section-head gp-section-head--center">
            <span className="gp-section-eyebrow">Credibility assets</span>
            <h2>Everything a CSR manager should see before you ask for budget</h2>
            <p>
              Put the brochure, report preview, public-facing example, and pilot proof in one place so the product
              feels purchase-ready.
            </p>
          </div>
          <div className="gp-assets-grid">
            {dueDiligenceAssets.map((asset) => (
              <article key={asset.title} className="gp-asset-card">
                <span className="gp-asset-eyebrow">{asset.eyebrow}</span>
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

      <section className="gp-delivery-stage">
        <div className="gp-shell">
          <div className="gp-section-head">
            <span className="gp-section-eyebrow">Delivery model</span>
            <h2>How the LC Green Corporate workflow is sold and delivered</h2>
            <p>
              Use the same field ecosystem, but let the corporate buyer experience it as a verified CSR implementation
              service rather than a generic software tool.
            </p>
          </div>
          <div className="gp-delivery-flow">
            {deliveryFlow.map((item) => (
              <article key={item.step} className="gp-delivery-card">
                <span className="gp-delivery-step">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-trust-stage">
        <div className="gp-shell gp-trust-layout">
          <div className="gp-trust-copy">
            <span className="gp-section-eyebrow">Reporting confidence</span>
            <h2>Built for reporting teams, not just field teams</h2>
            <p>
              The platform helps sustainability, CSR, donor, and communications teams reuse verified implementation
              records in a more credible reporting workflow.
            </p>
          </div>
          <div className="gp-trust-grid">
            {trustPillars.map((item) => (
              <article key={item.title} className="gp-trust-card">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gp-insights-stage">
        <div className="gp-shell">
          <div className="gp-section-head">
            <span className="gp-section-eyebrow">Search visibility</span>
            <h2>Publish expertise that helps companies discover you</h2>
            <p>
              These article topics position LandCheck as the implementation and reporting partner behind serious field
              programmes.
            </p>
          </div>
          <div className="gp-insights-grid">
            {insightArticles.map((article) => (
              <article key={article.title} className="gp-insight-card">
                <h3>{article.title}</h3>
                <p>{article.blurb}</p>
                <a href={article.href}>Read article</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {partners.length > 0 && (
        <section id="partners" className="gp-partners-stage">
          <div className="gp-shell">
            <div className="gp-section-head gp-section-head--center">
              <span className="gp-section-eyebrow">Trusted relationships</span>
              <h2>Partner organisations already in the ecosystem</h2>
              <p>Show buyers that LandCheck is building with real field actors, not just a concept deck.</p>
            </div>
            <div className="gp-partners-grid">
              {partners.map((org) => (
                <div key={org.name} className="gp-partner-card">
                  {PILOT_ORG_NAMES.has(org.name) ? <span className="gp-partner-tag">Pilot programme</span> : null}
                  {org.logo ? (
                    <img src={org.logo} alt={org.name} width="88" height="88" loading="lazy" />
                  ) : (
                    <span className="gp-partner-fallback">
                      {org.name
                        .split(" ")
                        .slice(0, 2)
                        .map((word) => word[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <strong>{org.name}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="gp-footer">
        <div className="gp-shell gp-footer-inner">
          <div>
            <span className="gp-section-eyebrow">Next step</span>
            <h2>Present LC Green Corporate like a premium implementation partner.</h2>
            <p>
              Use the brochure, video, article content, and dashboard proof to move from interest to serious CSR
              procurement conversations.
            </p>
          </div>
          <div className="gp-footer-actions">
            <a href={BROCHURE_PDF_SRC} download>
              Download brochure
            </a>
            <a href="/green-work/login">Open Work login</a>
            <a href="mailto:landchecktech@gmail.com?subject=LandCheck%20Green%20Corporate%20Partnership">
              Contact LandCheck
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
