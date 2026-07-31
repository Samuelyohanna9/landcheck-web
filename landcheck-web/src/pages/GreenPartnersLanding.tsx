import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import "../styles/green-partners.css";
import { fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";
import SocialLinks from "../components/SocialLinks";
import { getArticleBySlug } from "../data/newsArticles";
import { useDeferredMount } from "../hooks/useDeferredMount";
import { useLowBandwidthMode } from "../hooks/useLowBandwidthMode";

const greenPartnersFeaturedStory = getArticleBySlug("song-school-planting-day")!;
const FeaturedStorySpotlight = lazy(() => import("../components/FeaturedStorySpotlight"));

type PartnerOrg = { name: string; logo: string | null };
type MediaFit = "cover" | "contain";
type PhotoMoment = {
  imageSrc: string;
  title: string;
  label?: string;
};

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

const INSTAGRAM_REEL_URL = "https://www.instagram.com/reels/DbPXG1RsLrY/";
const INSTAGRAM_REEL_EMBED_URL = "https://www.instagram.com/reel/DbPXG1RsLrY/embed";
const BROCHURE_PDF_SRC = "/lc-green-corporate-brochure.pdf";
const DEFERRED_SECTION_STYLE = { contentVisibility: "auto" as const, containIntrinsicSize: "960px" };

const photoAsset = (fileName: string) => encodeURI(`/${fileName}`);

const modelCarouselPrevIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

const modelCarouselNextIcon = (
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
    desktopImage: "/info_web.webp",
    phoneImage: "/sponsor-tree-app.jpeg",
    desktopFit: "contain",
    phoneFit: "contain",
    accentLabel: "Public Portal",
  },
];

// whyPillars removed

const photoEvidencePoints = [
  "Captured with GPS at the moment of planting.",
  "Each seedling carries a sponsor-linked QR identity.",
  "Reviewed by named field supervisors before approval.",
];

const photoMoments: PhotoMoment[] = [
  {
    imageSrc: photoAsset("song-4.jpeg"),
    label: "Song school planting",
    title: "Pupils in Song watched the team secure a newly planted seedling inside the school grounds.",
  },
  {
    imageSrc: photoAsset("song-3.jpeg"),
    label: "Model School Song",
    title: "The Song planting round included Model School Song as part of a multi-school field day on 27 July.",
  },
  {
    imageSrc: photoAsset("song-1.jpeg"),
    label: "School-side coordination",
    title: "Teachers, pupils, and field staff gathered at the close of the Song Local Government planting round.",
  },
  {
    imageSrc: photoAsset("seeds.JPG"),
    label: "Nursery preparation",
    title: "Seedlings staged and inspected before they leave for the field.",
  },
  {
    imageSrc: photoAsset("yola south 4.JPG"),
    label: "Supervisor verification",
    title: "A supervisor photographs and confirms placement before planting.",
  },
  {
    imageSrc: photoAsset("yola south planting2.JPG"),
    label: "QR identity",
    title: "Every seedling carries a scannable QR tag from the nursery onward.",
  },
  {
    imageSrc: photoAsset("yola south plantin3.JPG"),
    label: "Health facility planting",
    title: "Working directly with Jabbi Primary Health Care Authority in Yola South.",
  },
  {
    imageSrc: photoAsset("fufore planting-New Model school fufore1.JPG"),
    label: "School grounds",
    title: "Principal of Model School Fufore during new trees planting in the school compound.",
  },
  {
    imageSrc: photoAsset("fufore planting-New Model school fufore2.JPG"),
    label: "GPS confirmation",
    title: "GPS coordinates and QR tags are captured before a tree is confirmed planted.",
  },
  {
    imageSrc: photoAsset("fufore planting-New Model school fufore3.JPG"),
    label: "Live planting",
    title: "Trees planted on school grounds.",
  },
  {
    imageSrc: photoAsset("sangere girei 1.JPG"),
    label: "Community stewardship",
    title: "Community members receive a new tree in Sangere, home to Modibbo Adama University.",
  },
  {
    imageSrc: photoAsset("sabgere girei 2.JPG"),
    label: "University corridor",
    title: "A seedling goes into the ground minutes from one of Adamawa's busiest university communities.",
  },
];

const premiumProofCards = [
  {
    eyebrow: "Partner organisations",
    title: "Field delivery",
    summary: "Assign work, capture field evidence, and keep planting operations disciplined from one route.",
    imageSrc: photoAsset("agent planting 1.JPG"),
    href: "/green/login/field",
    cta: "Explore route",
  },
  {
    eyebrow: "Corporate reporting",
    title: "Verified reporting",
    summary: "Give donor and CSR teams clean review control, live dashboards, and board-ready records.",
    imageSrc: "/ecf-partnership.jpeg",
    href: "/green-work/login",
    cta: "Explore route",
  },
  {
    eyebrow: "Public sponsorship",
    title: "Sponsor journeys",
    summary: "Let supporters fund real trees online and follow credible field proof as each record grows.",
    imageSrc: "/thumpnail_public.jpg",
    href: "/sponsor",
    cta: "Explore route",
  },
] as const;

const workflowSteps = [
  {
    step: "Plan",
    title: "Design the programme",
    body: "Define the site, species mix, delivery targets, and reporting scope before planting starts.",
  },
  {
    step: "Deploy",
    title: "Deploy field teams",
    body: "Assign trained agents, push work to mobile, and keep capture structured even when connectivity is weak.",
  },
  {
    step: "Verify",
    title: "Verify and review",
    body: "Check geotagged photos, mapped evidence, and supervisor approvals before records count toward impact.",
  },
  {
    step: "Report",
    title: "Report with confidence",
    body: "Share premium dashboards, export clean PDFs, and present evidence that boards and donors can trust.",
  },
] as const;


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



export default function GreenPartnersLanding() {
  const { isLowBandwidth } = useLowBandwidthMode();
  const showFeaturedStory = useDeferredMount(900);
  const [partners, setPartners] = useState<PartnerOrg[]>([]);
  const [activeModelId, setActiveModelId] = useState(greenModels[0].id);
  const [photoStartIndex, setPhotoStartIndex] = useState(0);
  const modelTrackRef = useRef<HTMLDivElement | null>(null);
  const isInitialModelScrollRef = useRef(true);
  const availablePhotoMoments = useMemo(
    () => (isLowBandwidth ? photoMoments.slice(0, 4) : photoMoments),
    [isLowBandwidth],
  );
  const visiblePhotoMoments = useMemo(() => {
    if (availablePhotoMoments.length <= 4) return availablePhotoMoments;
    return Array.from(
      { length: 4 },
      (_, index) => availablePhotoMoments[(photoStartIndex + index) % availablePhotoMoments.length],
    );
  }, [availablePhotoMoments, photoStartIndex]);

  useEffect(() => {
    // This effect also fires once on initial mount (not just on user-driven selection changes).
    // `block: "nearest"` then scrolls the whole page down to reveal this carousel - which sits
    // mid-page - fighting the route-change scroll-to-top and leaving new visitors mid-page
    // instead of at the top. Skip the very first run; only scroll on an actual selection change.
    if (isInitialModelScrollRef.current) {
      isInitialModelScrollRef.current = false;
      return;
    }
    const track = modelTrackRef.current;
    if (!track) return;
    const activeCard = track.querySelector<HTMLElement>(`[data-model-id="${activeModelId}"]`);
    activeCard?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeModelId]);

  function goToModelOffset(offset: number) {
    const currentIndex = greenModels.findIndex((model) => model.id === activeModelId);
    const nextIndex = (currentIndex + offset + greenModels.length) % greenModels.length;
    setActiveModelId(greenModels[nextIndex].id);
  }

  useEffect(() => {
    setPhotoStartIndex(0);
  }, [availablePhotoMoments.length]);

  function goToPhotoOffset(offset: number) {
    if (availablePhotoMoments.length <= 4) return;
    setPhotoStartIndex((current) => {
      const total = availablePhotoMoments.length;
      const next = current + offset;
      return ((next % total) + total) % total;
    });
  }

  useEffect(() => {
    let cancelled = false;

    fetchPublicPartnerOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        const mapped = orgs.map((org) => ({ name: org.name, logo: org.logo_url }));
        setPartners(mapped);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const marqueePartners = useMemo(() => {
    if (partners.length === 0) return [];
    const minimumCardsPerLoop = 6;
    const repeatCount = Math.max(1, Math.ceil(minimumCardsPerLoop / partners.length));
    return Array.from({ length: repeatCount }, (_, repeatIndex) =>
      partners.map((org, partnerIndex) => ({
        ...org,
        renderKey: `${org.name}-${repeatIndex}-${partnerIndex}`,
      })),
    ).flat();
  }, [partners]);

  const activeModel = greenModels.find((model) => model.id === activeModelId) || greenModels[0];
  const featuredPhotoMoment = visiblePhotoMoments[0];
  const supportingPhotoMoments = visiblePhotoMoments.slice(1);

  const renderPartnerLogo = (
    org: PartnerOrg & { renderKey: string },
    duplicate = false,
  ) => (
    <div
      key={`${org.renderKey}${duplicate ? "-duplicate" : ""}`}
      className="gp-partner-logo-item"
      aria-hidden={duplicate ? true : undefined}
      aria-label={duplicate ? undefined : org.name}
      title={org.name}
    >
      {org.logo ? (
        <img src={org.logo} alt={org.name} width="132" height="88" loading="lazy" decoding="async" />
      ) : (
        <span className="gp-partner-logo-fallback">
          {org.name
            .split(" ")
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase()}
        </span>
      )}
    </div>
  );

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

      <section className="gp-new-hero" style={{ backgroundImage: `url("${isLowBandwidth ? "/thumpnail_public.webp" : photoAsset("seeds.JPG")}")` }}>
        <div className="gp-new-hero-scrim" aria-hidden="true" />
        <div className="gp-shell gp-new-hero-inner">
          <div className="gp-new-hero-copy">
            <h1>
              Tree programmes with proof built in.
            </h1>
            <p className="gp-new-hero-subheadline">
              LandCheck Green gives NGOs, CSR teams, and sponsors one verified system for field delivery, GPS evidence, maintenance tracking, and export-ready reporting.
            </p>
            <div className="gp-new-hero-actions">
              <a className="gp-btn gp-btn--primary" href="/green-work/login">
                Launch Your CSR Project
              </a>
              <a className="gp-btn gp-btn--secondary" href="/sponsor">
                Sponsor a Tree
              </a>
            </div>

            <div className="gp-new-hero-stats">
              <div className="gp-new-hero-stat-item">
                <strong>{greenModels.length}</strong>
                <span>Delivery models</span>
              </div>
              <div className="gp-new-hero-stat-item">
                <strong>{partners.length > 0 ? partners.length.toLocaleString() : "Live"}</strong>
                <span>Partner organisations</span>
              </div>
              <div className="gp-new-hero-stat-item">
                <strong>Offline-first</strong>
                <span>Field capture</span>
              </div>
              <div className="gp-new-hero-stat-item">
                <strong>NGN + USD</strong>
                <span>Checkout ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showFeaturedStory ? (
        <Suspense fallback={null}>
          <FeaturedStorySpotlight article={greenPartnersFeaturedStory} />
        </Suspense>
      ) : null}

      <section className="gp-premium-proof-stage" style={DEFERRED_SECTION_STYLE}>
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Three delivery routes</span>
            <h2>One platform. Three clear ways to deliver impact.</h2>
            <p>Each route is built around a real operating need, with less dashboard noise and more usable evidence.</p>
          </div>

          <div className="gp-premium-proof-editorial">
            <figure className="gp-premium-proof-feature">
              <img
                src={photoAsset("tree_adamawa.JPG")}
                alt="LandCheck Green field planting work in Adamawa"
                loading="lazy"
                decoding="async"
              />
              <figcaption>
                <span className="gp-premium-proof-feature-kicker">Live field delivery in Adamawa</span>
                <p>
                  Real planting work, disciplined capture, and verified reporting in one operating system for NGOs,
                  corporate programmes, and public supporters.
                </p>
              </figcaption>
            </figure>

            <div className="gp-premium-proof-list">
              {premiumProofCards.map((card) => (
                <article key={card.title} className="gp-premium-proof-item">
                  <span className="gp-premium-proof-item-eyebrow">{card.eyebrow}</span>
                  <h3>{card.title}</h3>
                  <p>{card.summary}</p>
                  <a href={card.href}>{card.cta}</a>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="gp-workflow-stage" style={DEFERRED_SECTION_STYLE}>
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Operating flow</span>
            <h2>From programme design to board-ready reporting</h2>
            <p>A short operating sequence with clear review gates and evidence you can defend.</p>
          </div>

          <div className="gp-workflow-grid">
            {workflowSteps.map((step) => (
              <article key={step.step} className="gp-workflow-card">
                <span className="gp-workflow-step">{step.step}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform-routes" className="gp-model-stage" style={DEFERRED_SECTION_STYLE}>
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Choose your model</span>
            <h2>Choose the LC Green model that matches how you work</h2>
            <p>
              One platform, three routes, each designed for a specific operating job.
            </p>
          </div>

          <div className="gp-model-grid">
            <div className="gp-model-carousel">
              <button
                type="button"
                className="gp-model-carousel__arrow gp-model-carousel__arrow--prev"
                onClick={() => goToModelOffset(-1)}
                aria-label="Previous route"
              >
                {modelCarouselPrevIcon}
              </button>

              <div className="gp-model-carousel__track" ref={modelTrackRef}>
                {greenModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    data-model-id={model.id}
                    className={`gp-model-carousel__card${model.id === activeModel.id ? " is-active" : ""}`}
                    style={{ backgroundImage: `url("${model.heroImage}")` }}
                    onClick={() => setActiveModelId(model.id)}
                  >
                    <span className="gp-model-carousel__overlay" aria-hidden="true" />
                    <span className="gp-model-carousel__content">
                      <span className="gp-model-carousel__eyebrow">{model.heroLabel}</span>
                      <strong>{model.heroStatement}</strong>
                      <span className="gp-model-carousel__rule" aria-hidden="true" />
                      <span className="gp-model-carousel__desc">{model.heroSupport}</span>
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="gp-model-carousel__arrow gp-model-carousel__arrow--next"
                onClick={() => goToModelOffset(1)}
                aria-label="Next route"
              >
                {modelCarouselNextIcon}
              </button>
            </div>

            <div className="gp-model-showcase">
              <div className="gp-model-showcase__header">
                <span className="gp-model-accent">{activeModel.accentLabel}</span>
                <h3>{activeModel.selectorTitle}</h3>
                <p>{activeModel.detail}</p>
              </div>

              <div className="gp-device-stage">
                {/* Safari-style Browser Mockup */}
                <div className="gp-browser-frame">
                  <div className="gp-browser-header">
                    <span className="gp-browser-dots">
                      <span className="gp-dot gp-dot--red"></span>
                      <span className="gp-dot gp-dot--yellow"></span>
                      <span className="gp-dot gp-dot--green"></span>
                    </span>
                    <span className="gp-browser-address">
                      landcheck.online/green/{activeModel.id}-workspace
                    </span>
                  </div>
                  <div className="gp-browser-content">
                    <div className={`gp-device gp-device--desktop gp-device--desktop-${activeModel.id}`}>
                      <img
                        src={activeModel.desktopImage}
                        alt={activeModel.selectorTitle}
                        className={activeModel.desktopFit === "contain" ? "fit-contain" : "fit-cover"}
                        width="1400"
                        height="900"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </div>
                </div>

                {/* iPhone-style Mobile Mockup */}
                <div className="gp-phone-frame">
                  <div className="gp-phone-notch"></div>
                  <div className="gp-phone-screen">
                    <div className={`gp-device gp-device--phone gp-device--phone-${activeModel.id}`}>
                      <img
                        src={activeModel.phoneImage}
                        alt={`${activeModel.selectorTitle} mobile preview`}
                        className={activeModel.phoneFit === "contain" ? "fit-contain" : "fit-cover"}
                        width="720"
                        height="1520"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </div>
                  <div className="gp-phone-home-indicator"></div>
                </div>
              </div>

              <div className="gp-model-showcase__footer">
                <ul>
                  {activeModel.bullets.map((bullet) => (
                    <li key={bullet}>
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

      <section className="gp-photo-stage" style={DEFERRED_SECTION_STYLE}>
        <div className="gp-shell">
          <div className="gp-photo-stage-shell">
            <div className="gp-photo-stage-head">
              <article className="gp-photo-lead">
                <span className="gp-section-eyebrow">Field evidence</span>
                <h2>Real plantings. Real places. Real proof.</h2>
                <p>
                  Every image below comes from active LandCheck Green planting work in Song, Yola South, Fufore, and
                  Girei, Adamawa State.
                </p>
                <ul className="gp-photo-points">
                  {photoEvidencePoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>

              <div className="gp-photo-stage-controls">
                <button
                  type="button"
                  className="gp-photo-carousel__arrow gp-photo-carousel__arrow--prev"
                  onClick={() => goToPhotoOffset(-1)}
                  aria-label="Previous photo"
                >
                  {modelCarouselPrevIcon}
                </button>

                <button
                  type="button"
                  className="gp-photo-carousel__arrow gp-photo-carousel__arrow--next"
                  onClick={() => goToPhotoOffset(1)}
                  aria-label="Next photo"
                >
                  {modelCarouselNextIcon}
                </button>
              </div>
            </div>

            <div className="gp-photo-editorial">
              {featuredPhotoMoment ? (
                <figure className="gp-photo-feature">
                  <img src={featuredPhotoMoment.imageSrc} alt={featuredPhotoMoment.title} loading="lazy" decoding="async" />
                  <figcaption>
                    {featuredPhotoMoment.label ? <span>{featuredPhotoMoment.label}</span> : null}
                    <h3>{featuredPhotoMoment.title}</h3>
                  </figcaption>
                </figure>
              ) : null}

              <div className="gp-photo-side-grid">
                {supportingPhotoMoments.map((moment) => (
                  <article key={moment.title} className="gp-photo-side-card">
                    <img src={moment.imageSrc} alt={moment.title} loading="lazy" decoding="async" />
                    <div className="gp-photo-side-card__overlay" />
                    <div className="gp-photo-side-card__body">
                      {moment.label ? <span>{moment.label}</span> : null}
                      <h3>{moment.title}</h3>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="gp-proof-stage" style={DEFERRED_SECTION_STYLE}>
        <div className="gp-shell">
          <div className="gp-proof-showcase">
            <div className="gp-proof-content">
              <span className="gp-section-eyebrow">Field demonstration</span>
              <h2>See how planting records are verified</h2>
              <p>
                Watch how field teams use LC Green mobile to log GPS coordinates, upload evidence, and submit records for review.
              </p>
              <div className="gp-proof-actions">
                <a href="/green-work/login" className="gp-btn gp-btn--primary">
                  Try the Workspace
                </a>
              </div>
            </div>
            <div className="gp-proof-media">
              {isLowBandwidth ? (
                <div className="gp-demo-fallback">
                  <img
                    src="/thumpnail_public.jpg"
                    alt="LandCheck Green field verification preview"
                    className="gp-demo-poster"
                    loading="lazy"
                    decoding="async"
                  />
                  <a href={INSTAGRAM_REEL_URL} target="_blank" rel="noreferrer" className="gp-demo-linkout">
                    Watch on Instagram
                  </a>
                </div>
              ) : (
                <div className="gp-demo-embed">
                  <iframe
                    src={INSTAGRAM_REEL_EMBED_URL}
                    title="LandCheck Green field verification reel"
                    className="gp-demo-iframe"
                    loading="lazy"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                  />
                  <a href={INSTAGRAM_REEL_URL} target="_blank" rel="noreferrer" className="gp-demo-linkout">
                    Open on Instagram
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="gp-budget-stage" style={DEFERRED_SECTION_STYLE}>
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Documentation and demos</span>
            <h2>Evaluate the LandCheck platform</h2>
            <p>Review the core materials a partner, donor, or CSR manager needs before onboarding.</p>
          </div>
          <div className="gp-asset-grid">
            {dueDiligenceAssets.map((asset) => (
              <article key={asset.title} className="gp-asset-card">
                {"imageSrc" in asset ? (
                  <div className="gp-asset-card__media">
                      <img src={asset.imageSrc} alt={asset.title} loading="lazy" decoding="async" />
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
          <section id="partners" className="gp-partners-stage" style={DEFERRED_SECTION_STYLE}>
          <div className="gp-shell">
            <div className="gp-section-intro gp-section-intro--center">
              <span className="gp-section-eyebrow">Partner organisations already in the ecosystem</span>
              <h2>Real field actors already working with LandCheck</h2>
            </div>
            <div className="gp-partners-marquee" aria-label="Partner organisations">
              <div className="gp-partners-track">
                <div className="gp-partners-logos">
                  {marqueePartners.map((partner) => renderPartnerLogo(partner))}
                </div>
                <div className="gp-partners-logos gp-partners-logos-duplicate" aria-hidden="true">
                  {marqueePartners.map((partner) => renderPartnerLogo(partner, true))}
                </div>
              </div>
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
              <img src="/green-logo-cropped-700.png" alt="LandCheck Green" className="gp-footer-logo" loading="lazy" decoding="async" />
              <p className="gp-footer-brand-text">
                Verifiably restoring forests through cryptographic site evidence, real-time tracking, and board-ready reporting.
              </p>
              <div className="gp-footer-badges">
                <span className="gp-badge">GPS Geotagged</span>
                <span className="gp-badge">Audit-Ready</span>
              </div>
              <SocialLinks className="gp-footer-social" />
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
