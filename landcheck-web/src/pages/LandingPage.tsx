import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/landing.css";
import { fetchPublicImpactStats, fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";

type PartnerOrg = { name: string; logo: string | null };

const PILOT_ORG_NAMES = new Set(["Think Green Foundation"]);
const HERO_VIDEO_SRC = "/make_it_ro_rotate_like_a_video.mp4";
const HERO_VIDEO_CROSSFADE_MS = 900;
const HERO_VIDEO_CROSSFADE_SECONDS = 1.05;

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
  const [totalTrees, setTotalTrees] = useState<number | null>(null);
  const [heroVideoReady, setHeroVideoReady] = useState(false);
  const [visibleHeroVideoIndex, setVisibleHeroVideoIndex] = useState(0);
  const heroVideoRefs = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const activeHeroVideoIndexRef = useRef(0);
  const visibleHeroVideoIndexRef = useRef(0);
  const heroVideoCrossfadeLockRef = useRef(false);
  const heroVideoRafRef = useRef<number | null>(null);
  const heroVideoSwapTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicPartnerOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        const mapped = orgs.map((o) => ({ name: o.name, logo: o.logo_url }));
        if (mapped.length > 0) setPartners(mapped);
      })
      .catch(() => {});
    fetchPublicImpactStats()
      .then((stats) => {
        if (cancelled) return;
        setTotalTrees(stats.total_trees);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const videos = heroVideoRefs.current;
    if (videos.some((video) => !video)) return undefined;

    const playVideo = (video: HTMLVideoElement | null) => {
      if (!video) return;
      video.muted = true;
      video.defaultMuted = true;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    const resetVideo = (video: HTMLVideoElement | null) => {
      if (!video) return;
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Ignore browsers that block direct currentTime resets while buffering.
      }
    };

    const stopLoopWatch = () => {
      if (heroVideoRafRef.current !== null) {
        cancelAnimationFrame(heroVideoRafRef.current);
        heroVideoRafRef.current = null;
      }
      if (heroVideoSwapTimeoutRef.current !== null) {
        window.clearTimeout(heroVideoSwapTimeoutRef.current);
        heroVideoSwapTimeoutRef.current = null;
      }
    };

    const startLoopWatch = () => {
      stopLoopWatch();

      const tick = () => {
        const currentVideo = heroVideoRefs.current[activeHeroVideoIndexRef.current];
        if (!currentVideo) {
          heroVideoRafRef.current = requestAnimationFrame(tick);
          return;
        }

        const duration = Number(currentVideo.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
          heroVideoRafRef.current = requestAnimationFrame(tick);
          return;
        }

        const remaining = duration - currentVideo.currentTime;
        if (!heroVideoCrossfadeLockRef.current && remaining <= HERO_VIDEO_CROSSFADE_SECONDS) {
          heroVideoCrossfadeLockRef.current = true;
          const nextIndex = activeHeroVideoIndexRef.current === 0 ? 1 : 0;
          const nextVideo = heroVideoRefs.current[nextIndex];

          if (nextVideo) {
            try {
              nextVideo.currentTime = 0;
            } catch {
              // Ignore currentTime reset failures during browser buffering.
            }
            visibleHeroVideoIndexRef.current = nextIndex;
            setVisibleHeroVideoIndex(nextIndex);
            playVideo(nextVideo);
            setHeroVideoReady(true);

            heroVideoSwapTimeoutRef.current = window.setTimeout(() => {
              resetVideo(heroVideoRefs.current[activeHeroVideoIndexRef.current]);
              activeHeroVideoIndexRef.current = nextIndex;
              heroVideoCrossfadeLockRef.current = false;
              heroVideoSwapTimeoutRef.current = null;
            }, HERO_VIDEO_CROSSFADE_MS);
          } else {
            heroVideoCrossfadeLockRef.current = false;
          }
        }

        heroVideoRafRef.current = requestAnimationFrame(tick);
      };

      heroVideoRafRef.current = requestAnimationFrame(tick);
    };

    heroVideoRefs.current.forEach((video, index) => {
      if (index !== visibleHeroVideoIndexRef.current) {
        resetVideo(video);
      }
    });

    playVideo(heroVideoRefs.current[visibleHeroVideoIndexRef.current]);
    startLoopWatch();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        playVideo(heroVideoRefs.current[visibleHeroVideoIndexRef.current]);
        startLoopWatch();
      } else {
        stopLoopWatch();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopLoopWatch();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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

  const renderPartnerBadge = (
    org: PartnerOrg & { renderKey: string },
    duplicate = false,
  ) => (
    <div
      key={`${org.renderKey}${duplicate ? "-duplicate" : ""}`}
      className="lp-partner-badge"
      role="button"
      tabIndex={duplicate ? -1 : 0}
      aria-hidden={duplicate ? true : undefined}
      onClick={() => navigate("/green-partners#partners")}
      onKeyDown={(e) => e.key === "Enter" && navigate("/green-partners#partners")}
    >
      {PILOT_ORG_NAMES.has(org.name) && (
        <span className="lp-partner-pilot-tag">Pilot</span>
      )}
      {org.logo ? (
        <img src={org.logo} alt={org.name} className="lp-partner-logo" width="80" height="58" loading="lazy" />
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
  );

  return (
    <div className="landcheck-landing">
      <NavBar fixed overlay />
      <main>

      {/* Hero */}
      <section className={`lp-hero${heroVideoReady ? " lp-hero--video-ready" : ""}`}>
        <div className="lp-hero-video-wrap" aria-hidden="true">
          {[0, 1].map((index) => (
            <video
              key={index}
              ref={(node) => {
                heroVideoRefs.current[index] = node;
              }}
              className={`lp-hero-video${visibleHeroVideoIndex === index ? " lp-hero-video--active" : " lp-hero-video--inactive"}`}
              autoPlay={index === 0}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              disableRemotePlayback
              onPlaying={() => setHeroVideoReady(true)}
              onLoadedData={() => setHeroVideoReady(true)}
              onError={() => setHeroVideoReady(false)}
            >
              <source src={HERO_VIDEO_SRC} type="video/mp4" />
            </video>
          ))}
        </div>
        <div className="lp-hero-overlay" />
        <div className="lp-hero-content">
          <span className="lp-hero-kicker">LANDCHECK PLATFORM</span>
          <h1>
            Geospatial Intelligence <br />for Development Projects
          </h1>
          <p className="lp-hero-lead">
            Environmental monitoring, tree planting sponsorship, field operations, survey plans, and flood risk — all in one platform
          </p>
          <div className="lp-hero-ctas">
            <button type="button" className="lp-hero-btn-primary" onClick={() => navigate("/green-partners")}>
              LANDCHECK GREEN
            </button>
            <button type="button" className="lp-hero-btn-outline" onClick={() => navigate("/survey")}>
              SURVEY PLAN
            </button>
            <button type="button" className="lp-hero-btn-outline" onClick={() => navigate("/flood")}>
              FLOOD ANALYSIS
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

      {/* Motto Band */}
      <div className="lp-motto-band">
        <span className="lp-motto-label">Our Mission</span>
        <p className="lp-motto-text">
          From Mapping to <span className="lp-motto-accent">Impact</span>
        </p>
      </div>

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
            {totalTrees !== null && totalTrees > 0 && (
              <div className="lp-stat-card">
                <div className="lp-stat-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" width="52" height="52">
                    <path
                      d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path d="M12 15v-9M9 9l3-3 3 3M8.5 12.5L12 9l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="lp-stat-text">
                  <strong>{totalTrees.toLocaleString()}</strong>
                  <span>
                    Trees Planted
                    <br />
                    &amp; Managed
                  </span>
                </div>
              </div>
            )}
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

      {/* Sponsor a Tree */}
      <section className="lp-sponsor-section">
        <div className="lp-sponsor-inner">
          <div className="lp-sponsor-text">
            <span className="lp-sponsor-eyebrow">LANDCHECK GREEN</span>
            <h2>
              Sponsor a Tree.<br />
              Track Its Journey.
            </h2>
            <p>
              Support verified tree planting projects and monitor your environmental impact
              through GPS tracking, photo updates, maintenance records, and carbon reporting.
            </p>
            <ul className="lp-sponsor-bullets">
              <li className="lp-sponsor-bullet">
                <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5"/>
                  <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <strong>GPS Tracking</strong>
                  <span>Know exactly where your trees are planted on the map</span>
                </div>
              </li>
              <li className="lp-sponsor-bullet">
                <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5"/>
                  <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <strong>Photo Updates</strong>
                  <span>See photo evidence as your tree grows over time</span>
                </div>
              </li>
              <li className="lp-sponsor-bullet">
                <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5"/>
                  <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <strong>Maintenance Records</strong>
                  <span>Track watering, pruning, and full care history</span>
                </div>
              </li>
              <li className="lp-sponsor-bullet">
                <svg viewBox="0 0 24 24" fill="none" width="22" height="22" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="1.5"/>
                  <path d="M8 12l3 3 5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <strong>Carbon Reporting</strong>
                  <span>Measure your CO₂ offset with verified impact data</span>
                </div>
              </li>
            </ul>
            <div className="lp-sponsor-ctas">
              <button
                type="button"
                className="lp-sponsor-btn-primary"
                onClick={() => navigate("/green/login/sponsor")}
              >
                Sponsor a Tree
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <a
                href="https://play.google.com/store/apps/details?id=online.landcheck.mobile"
                target="_blank"
                rel="noopener noreferrer"
                className="lp-sponsor-playstore"
              >
                <svg viewBox="0 0 24 28" width="20" height="24" fill="none" aria-hidden="true">
                  <path d="M1.5 0.8L13.8 13 1.5 25.2V0.8z" fill="#34A853"/>
                  <path d="M1.5 0.8L13.8 13 20.5 6.5 5.2 0z" fill="#4285F4"/>
                  <path d="M1.5 25.2L13.8 13 20.5 19.5 5.2 26z" fill="#FBBC05"/>
                  <path d="M20.5 6.5L13.8 13l6.7 6.5 2.5-6.5-2.5-6.5z" fill="#EA4335"/>
                </svg>
                <div className="lp-sponsor-playstore-text">
                  <small>Get it on</small>
                  <strong>Google Play</strong>
                </div>
              </a>
            </div>
          </div>
          <div className="lp-sponsor-visual">
            <div className="lp-sponsor-phone-wrap">
              <div className="lp-sponsor-phone-frame">
                <div className="lp-sponsor-phone-screen">
                  <img
                    src="/sponsor-tree-app.jpeg"
                    alt="LandCheck Green — Sponsor a Tree app screenshot"
                    loading="lazy"
                    width="280"
                    height="560"
                  />
                </div>
              </div>
            </div>
          </div>
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
            <div className="lp-partners-marquee" aria-label="Partner organizations">
              <div className="lp-partners-track">
                <div className="lp-partners-logos">
                  {marqueePartners.map((org) => renderPartnerBadge(org))}
                </div>
                <div className="lp-partners-logos lp-partners-logos-duplicate" aria-hidden="true">
                  {marqueePartners.map((org) => renderPartnerBadge(org, true))}
                </div>
              </div>
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

      </main>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src="/logo.svg" alt="LandCheck" className="lp-footer-logo" width="100" height="34" loading="lazy" />
            <ul>
              <li>
                <a href="mailto:landchecktech@gmail.com">landchecktech@gmail.com</a>
              </li>
              <li>LandCheck Geospatial Technologies Limited</li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h3>Products</h3>
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
            <h3>Tools</h3>
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
            <h3>Company</h3>
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
              <li>
                <button type="button" onClick={() => navigate("/feedback")}>
                  Feedback
                </button>
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
