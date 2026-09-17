import { Suspense, useEffect, useMemo, useState } from "react";
import "../styles/green-partners.css";
import "../styles/public-landing.css";
import { fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";
import SocialLinks from "../components/SocialLinks";
import { getArticleBySlug } from "../data/newsArticles";
import { useDeferredMount } from "../hooks/useDeferredMount";
import { useLowBandwidthMode } from "../hooks/useLowBandwidthMode";
import { lazyWithChunkRecovery } from "../utils/lazyWithChunkRecovery";

const greenPartnersFeaturedStory = getArticleBySlug("song-school-planting-day")!;
const FeaturedStorySpotlight = lazyWithChunkRecovery(() => import("../components/FeaturedStorySpotlight"));

type PartnerOrg = { name: string; logo: string | null };
type PhotoMoment = {
  imageSrc: string;
  title: string;
  label?: string;
};

const INSTAGRAM_REEL_URL = "https://www.instagram.com/reels/DbPXG1RsLrY/";
const INSTAGRAM_REEL_EMBED_URL = "https://www.instagram.com/reel/DbPXG1RsLrY/embed";
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

const photoMoments: PhotoMoment[] = [
  {
    imageSrc: photoAsset("tree_adamawa.JPG"),
    label: "Live field delivery in Adamawa",
    title: "Real planting work, disciplined capture, and verified reporting in one system.",
  },
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
    imageSrc: photoAsset("yola south planting 1.JPG"),
    label: "Yola South planting",
    title: "Field agents plant trees across a Yola South project site.",
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
    imageSrc: photoAsset("fufore.JPG"),
    label: "Fufore campus",
    title: "First trees planted at the new Fufore school campus.",
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

const deliveryRoutes = [
  {
    eyebrow: "Partner organisations",
    title: "Field delivery",
    summary: "Assign work and capture GPS-verified field evidence.",
    imageSrc: photoAsset("agent planting 1.JPG"),
    href: "/green/login/field",
    cta: "Explore route",
  },
  {
    eyebrow: "Corporate reporting",
    title: "Verified reporting",
    summary: "Live dashboards and board-ready records for donors.",
    imageSrc: "/ecf-partnership.jpeg",
    href: "/green-work/login",
    cta: "Explore route",
  },
  {
    eyebrow: "Public sponsorship",
    title: "Sponsor journeys",
    summary: "Fund a real tree online and follow its proof.",
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
    body: "AI flags duplicate or mismatched photos and screens tree health, then named supervisors approve before records count toward impact.",
  },
  {
    step: "Report",
    title: "Report with confidence",
    body: "Share premium dashboards, export clean PDFs, and present evidence that boards and donors can trust.",
  },
] as const;


export default function GreenPartnersLanding() {
  const { isLowBandwidth } = useLowBandwidthMode();
  const showFeaturedStory = useDeferredMount(900);
  const [partners, setPartners] = useState<PartnerOrg[]>([]);
  const [photoStartIndex, setPhotoStartIndex] = useState(0);
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
    <div className="green-partners-page public-landing">
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
                <strong>{deliveryRoutes.length}</strong>
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
            <span className="gp-section-eyebrow">Choose your route</span>
            <h2>Three ways to work with LandCheck Green</h2>
          </div>

          <div className="gp-route-grid">
            {deliveryRoutes.map((route) => (
              <article key={route.title} className="gp-route-card">
                <img src={route.imageSrc} alt={route.title} loading="lazy" decoding="async" />
                <span className="gp-route-card__eyebrow">{route.eyebrow}</span>
                <h3>{route.title}</h3>
                <p>{route.summary}</p>
                <a href={route.href}>{route.cta}</a>
              </article>
            ))}
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
          </div>
        </div>
      </footer>
    </div>
  );
}
