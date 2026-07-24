import { useEffect, useRef, useState, type ReactElement } from "react";
import "../styles/green-partners.css";
import { fetchPublicPartnerOrganizations } from "../api/greenSponsor";
import NavBar from "../components/NavBar";
import FeaturedStorySpotlight from "../components/FeaturedStorySpotlight";
import { getArticleBySlug } from "../data/newsArticles";

const greenPartnersFeaturedStory = getArticleBySlug("fufore-model-school-first-trees")!;

type PartnerOrg = { name: string; logo: string | null };
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

// statIconMap removed

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
    desktopImage: "/info.png",
    phoneImage: "/sponsor-tree-app.jpeg",
    desktopFit: "contain",
    phoneFit: "cover",
    accentLabel: "Public Portal",
  },
];

// whyPillars removed

const photoEvidencePoints = [
  "GPS-tagged the moment each seedling goes into the ground",
  "QR Tag carrying the name of the tree sponsor and the seedling's unique ID",
  "Logged by named field supervisors, not stock photography",
];

const photoMoments = [
  {
    imageSrc: photoAsset("seeds.JPG"),
    label: "NURSERY STOCK",
    title: "Seedlings staged and inspected before they leave for the field.",
  },
  {
    imageSrc: photoAsset("yola south 4.JPG"),
    label: "YOLA SOUTH",
    title: "A supervisor photographs and confirms placement before planting.",
  },
  {
    imageSrc: photoAsset("yola south planting2.JPG"),
    label: "YOLA SOUTH",
    title: "Every seedling carries a scannable QR tag from the nursery onward.",
  },
  {
    imageSrc: photoAsset("yola south plantin3.JPG"),
    label: "COMMUNITY PARTNERSHIP",
    title: "Working directly with Jabbi Primary Health Care Authority in Yola South.",
  },
  {
    imageSrc: photoAsset("fufore planting-New Model school fufore1.JPG"),
    label: "FUFORE",
    title: "Principal of Model School Fufore during new trees planting in the school compound.",
  },
  {
    imageSrc: photoAsset("fufore planting-New Model school fufore2.JPG"),
    label: "FUFORE",
    title: "GPS coordinates and QR tags are captured before a tree is confirmed planted.",
  },
  {
    imageSrc: photoAsset("fufore planting-New Model school fufore3.JPG"),
    label: "FUFORE — NEW MODEL SCHOOL",
    title: "Trees planted on school grounds.",
  },
  {
    imageSrc: photoAsset("sangere girei 1.JPG"),
    label: "SANGERE, GIREI",
    title: "Community members receive a new tree in Sangere, home to Modibbo Adama University.",
  },
  {
    imageSrc: photoAsset("sabgere girei 2.JPG"),
    label: "SANGERE, GIREI",
    title: "A seedling goes into the ground minutes from one of Adamawa's busiest university communities.",
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
  const [partners, setPartners] = useState<PartnerOrg[]>([]);
  const [activeModelId, setActiveModelId] = useState(greenModels[0].id);
  const modelTrackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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

  const photoTrackRef = useRef<HTMLDivElement | null>(null);
  const photoAutoplayPausedRef = useRef(false);

  useEffect(() => {
    const track = photoTrackRef.current;
    if (!track) return;

    const mobileQuery = window.matchMedia("(max-width: 768px)");

    const pauseAutoplay = () => {
      photoAutoplayPausedRef.current = true;
    };

    const intervalId = window.setInterval(() => {
      if (photoAutoplayPausedRef.current || !mobileQuery.matches) return;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + track.clientWidth, behavior: "smooth" });
    }, 4000);

    // Only a real user gesture should permanently stop the auto-slide — our own
    // programmatic scrollTo() calls never fire pointerdown/wheel, so this can't
    // self-cancel.
    track.addEventListener("pointerdown", pauseAutoplay, { passive: true });
    track.addEventListener("wheel", pauseAutoplay, { passive: true });

    return () => {
      window.clearInterval(intervalId);
      track.removeEventListener("pointerdown", pauseAutoplay);
      track.removeEventListener("wheel", pauseAutoplay);
    };
  }, []);

  function goToPhotoOffset(offset: number) {
    const track = photoTrackRef.current;
    if (!track) return;
    photoAutoplayPausedRef.current = true;
    const maxScroll = track.scrollWidth - track.clientWidth;
    let next = track.scrollLeft + offset * track.clientWidth;
    if (next < 0) next = maxScroll;
    if (next > maxScroll) next = 0;
    track.scrollTo({ left: next, behavior: "smooth" });
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

  const activeModel = greenModels.find((model) => model.id === activeModelId) || greenModels[0];

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

      <section className="gp-new-hero" style={{ backgroundImage: `url("${photoAsset("seeds.JPG")}")` }}>
        <div className="gp-new-hero-scrim" aria-hidden="true" />
        <div className="gp-shell gp-new-hero-inner">
          <div className="gp-new-hero-copy">
            <span className="gp-new-hero-badge">CSR + ESG Verification</span>
            <h1>
              Plant Trees.<br />
              Prove Your Impact.
            </h1>
            <p className="gp-new-hero-subheadline">
              Manage every sponsored tree with GPS verification, maintenance tracking, CSR reports and live dashboards.
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
                <strong>4,000+</strong>
                <span>Trees Managed</span>
              </div>
              <div className="gp-new-hero-stat-item">
                <strong>15+</strong>
                <span>Field Agents</span>
              </div>
              <div className="gp-new-hero-stat-item">
                <strong>Live</strong>
                <span>Monitoring</span>
              </div>
              <div className="gp-new-hero-stat-item">
                <strong>GPS</strong>
                <span>Verified</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeaturedStorySpotlight article={greenPartnersFeaturedStory} />

      <section className="gp-social-proof">
        <div className="gp-shell">
          <span className="gp-social-label">USED BY LEADING ACTORS IN THE RESTORATION ECOSYSTEM</span>
          <div className="gp-social-logos">
            <div className="gp-social-logo-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gp-social-icon">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <span>CSR Teams</span>
            </div>
            
            <div className="gp-social-logo-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gp-social-icon">
                <path d="M12 2a5 5 0 0 0-5 5v3H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9h-5V7a5 5 0 0 0-5-5z" />
                <path d="M12 10V2" />
              </svg>
              <span>NGOs</span>
            </div>
            
            <div className="gp-social-logo-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gp-social-icon">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Foundations</span>
            </div>
            
            <div className="gp-social-logo-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gp-social-icon">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              <span>Government Projects</span>
            </div>
          </div>
        </div>
      </section>

      <section className="gp-six-features">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">Platform Capabilities</span>
            <h2>Everything you need to prove environmental action</h2>
            <p>Built for companies that value trust, auditability, and real-time verification.</p>
          </div>
          
          <div className="gp-features-grid">
            {/* Feature 1: Tree Management */}
            <article className="gp-feature-card gp-feature-card-illustrated">
              <div className="gp-feature-illustration-wrap">
                <svg viewBox="0 0 200 120" className="gp-illustration-svg">
                  <circle cx="100" cy="60" r="50" fill="#f0fdf4" />
                  {/* Soil Mound */}
                  <path d="M 60,95 Q 100,75 140,95 Z" fill="#b0967e" />
                  {/* Shovel stuck in ground */}
                  <line x1="130" y1="50" x2="130" y2="85" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
                  <line x1="122" y1="50" x2="138" y2="50" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
                  <path d="M 124,85 L 136,85 L 133,98 L 127,98 Z" fill="#94a3b8" />
                  {/* Growing Seedling */}
                  <path d="M 90,88 Q 90,55 90,45" stroke="#78350f" strokeWidth="3" fill="none" strokeLinecap="round" />
                  {/* Leaves */}
                  <path d="M 90,55 C 75,50 75,60 90,62 Z" fill="#22c55e" />
                  <path d="M 90,68 C 105,63 105,73 90,75 Z" fill="#4ade80" />
                  <path d="M 90,45 C 80,35 100,35 90,45 Z" fill="#15803d" />
                </svg>
              </div>
              <h3>Tree Management</h3>
              <p>Oversee every sponsored tree from initial seedling planting to full maturity.</p>
            </article>
            
            {/* Feature 2: GPS Verification */}
            <article className="gp-feature-card gp-feature-card-illustrated">
              <div className="gp-feature-illustration-wrap">
                <svg viewBox="0 0 200 120" className="gp-illustration-svg">
                  <circle cx="100" cy="60" r="50" fill="#f0fdf4" />
                  {/* Folded Map Isometric projection */}
                  <path d="M 50,75 L 85,60 L 120,75 L 150,60 L 150,85 L 120,100 L 85,85 L 50,100 Z" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
                  {/* Map lines */}
                  <line x1="85" y1="60" x2="85" y2="85" stroke="#cbd5e1" strokeWidth="1.5" />
                  <line x1="120" y1="75" x2="120" y2="100" stroke="#cbd5e1" strokeWidth="1.5" />
                  {/* Location Pin */}
                  <path d="M 100,72 C 100,55 85,55 85,42 C 85,34 92,27 100,27 C 108,27 115,34 115,42 C 115,55 100,72 100,72 Z" fill="#ef4444" />
                  <circle cx="100" cy="42" r="5" fill="#ffffff" />
                  {/* Small Green Tree on map */}
                  <circle cx="132" cy="72" r="6" fill="#22c55e" />
                  <line x1="132" y1="72" x2="132" y2="80" stroke="#78350f" strokeWidth="2" />
                </svg>
              </div>
              <h3>GPS Verification</h3>
              <p>Pinpoint the exact sub-meter satellite coordinates of each tree planted.</p>
            </article>
            
            {/* Feature 3: Photo Evidence */}
            <article className="gp-feature-card gp-feature-card-illustrated">
              <div className="gp-feature-illustration-wrap">
                <svg viewBox="0 0 200 120" className="gp-illustration-svg">
                  <circle cx="100" cy="60" r="50" fill="#f0fdf4" />
                  {/* Snapshot Photo Card */}
                  <rect x="55" y="30" width="60" height="52" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" transform="rotate(-8 85 56)" />
                  <circle cx="85" cy="52" r="16" fill="#d1fae5" transform="rotate(-8 85 56)" />
                  <path d="M 85,62 L 85,48" stroke="#15803d" strokeWidth="3" strokeLinecap="round" transform="rotate(-8 85 56)" />
                  <path d="M 85,52 C 75,48 75,56 85,58 Z" fill="#22c55e" transform="rotate(-8 85 56)" />
                  {/* Shutter Camera box body */}
                  <rect x="95" y="55" width="55" height="38" rx="6" fill="#1f8c58" stroke="#15803d" strokeWidth="1.5" />
                  <circle cx="122.5" cy="74" r="11" fill="#e2e8f0" stroke="#15803d" strokeWidth="2.5" />
                  <circle cx="122.5" cy="74" r="5" fill="#0f2017" />
                  <rect x="105" y="49" width="14" height="6" fill="#15803d" rx="2" />
                  {/* Checkmark Badge */}
                  <circle cx="150" cy="45" r="10" fill="#22c55e" />
                  <path d="M 146,45 L 149,48 L 155,42" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
              <h3>Photo Evidence</h3>
              <p>Capture high-resolution site photographs for audit-ready field proof.</p>
            </article>
            
            {/* Feature 4: CSR Reports */}
            <article className="gp-feature-card gp-feature-card-illustrated">
              <div className="gp-feature-illustration-wrap">
                <svg viewBox="0 0 200 120" className="gp-illustration-svg">
                  <circle cx="100" cy="60" r="50" fill="#f0fdf4" />
                  {/* Document Background */}
                  <rect x="65" y="25" width="70" height="76" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                  {/* Header block */}
                  <rect x="75" y="35" width="30" height="8" rx="2" fill="#d1fae5" />
                  {/* Lines */}
                  <line x1="75" y1="52" x2="125" y2="52" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
                  <line x1="75" y1="60" x2="115" y2="60" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
                  <line x1="75" y1="68" x2="120" y2="68" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
                  {/* Mini Chart */}
                  <rect x="75" y="80" width="10" height="12" fill="#22c55e" rx="1" />
                  <rect x="90" y="74" width="10" height="18" fill="#1f8c58" rx="1" />
                  <rect x="105" y="77" width="10" height="15" fill="#a7f3d0" rx="1" />
                  {/* CO2 verified leaf stamp */}
                  <rect x="110" y="32" width="22" height="14" rx="4" fill="#1f8c58" />
                  <text x="121" y="42" fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">CO₂</text>
                </svg>
              </div>
              <h3>CSR Reports</h3>
              <p>Generate clean, board-ready sustainability reports for your ESG stakeholders.</p>
            </article>
            
            {/* Feature 5: Field App */}
            <article className="gp-feature-card gp-feature-card-illustrated">
              <div className="gp-feature-illustration-wrap">
                <svg viewBox="0 0 200 120" className="gp-illustration-svg">
                  <circle cx="100" cy="60" r="50" fill="#f0fdf4" />
                  {/* Phone Shell */}
                  <rect x="65" y="24" width="48" height="80" rx="8" fill="#1e293b" />
                  {/* Phone screen */}
                  <rect x="69" y="28" width="40" height="72" rx="4" fill="#ffffff" />
                  {/* Phone map screen detail */}
                  <path d="M 69,75 L 85,68 L 100,75 L 109,68 L 109,100 L 69,100 Z" fill="#d1fae5" />
                  <circle cx="88" cy="55" r="5" fill="#22c55e" />
                  <line x1="88" y1="55" x2="88" y2="62" stroke="#78350f" strokeWidth="1.5" />
                  {/* Cloud Sync Icon */}
                  <path d="M 125,52 C 120,52 118,56 120,60 C 116,60 116,66 122,66 L 140,66 C 144,66 144,60 141,60 C 142,55 137,52 135,52 Z" fill="#94a3b8" />
                  <path d="M 130,58 L 130,68 M 126,62 L 130,58 L 134,62" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <circle cx="130" cy="60" r="12" stroke="#cbd5e1" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
                </svg>
              </div>
              <h3>Field App</h3>
              <p>Equip field teams with offline-first tracking tools that sync logs automatically.</p>
            </article>
            
            {/* Feature 6: Impact Analytics */}
            <article className="gp-feature-card gp-feature-card-illustrated">
              <div className="gp-feature-illustration-wrap">
                <svg viewBox="0 0 200 120" className="gp-illustration-svg">
                  <circle cx="100" cy="60" r="50" fill="#f0fdf4" />
                  {/* Graph backdrop grid */}
                  <rect x="55" y="30" width="90" height="66" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                  <line x1="55" y1="46" x2="145" y2="46" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="55" y1="62" x2="145" y2="62" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="55" y1="78" x2="145" y2="78" stroke="#f1f5f9" strokeWidth="1" />
                  {/* Growth Trend Line */}
                  <path d="M 60,82 Q 95,78 115,55 T 140,42" fill="none" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round" />
                  {/* Trend glowing endpoint */}
                  <circle cx="140" cy="42" r="5" fill="#1f8c58" />
                  <circle cx="140" cy="42" r="10" fill="rgba(31, 140, 88, 0.2)" />
                  {/* Mini bar widgets */}
                  <circle cx="70" cy="40" r="6" fill="#3b82f6" />
                  <rect x="80" y="37" width="22" height="6" rx="2" fill="#e2e8f0" />
                </svg>
              </div>
              <h3>Impact Analytics</h3>
              <p>Monitor tree survival rates, carbon sequestration metrics, and canopy growth.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="gp-how-it-works-saas">
        <div className="gp-shell">
          <div className="gp-section-intro gp-section-intro--center">
            <span className="gp-section-eyebrow">The Verification Cycle</span>
            <h2>Simple flow. Continuous trust.</h2>
          </div>
          
          <div className="gp-how-timeline">
            <div className="gp-timeline-step">
              <div className="gp-step-icon-wrap">
                <span className="gp-step-circle"></span>
              </div>
              <h3>Create Project</h3>
              <p>Define target planting zones, tree species, and carbon offsets inside the dashboard.</p>
            </div>
            
            <div className="gp-timeline-step">
              <div className="gp-step-icon-wrap">
                <span className="gp-step-circle"></span>
              </div>
              <h3>Assign Field Team</h3>
              <p>Delegate planting and routine care tasks to local forestry agents via the field app.</p>
            </div>
            
            <div className="gp-timeline-step">
              <div className="gp-step-icon-wrap">
                <span className="gp-step-circle"></span>
              </div>
              <h3>Plant Trees</h3>
              <p>Agents record geotags and upload high-resolution photos during physical planting.</p>
            </div>
            
            <div className="gp-timeline-step">
              <div className="gp-step-icon-wrap">
                <span className="gp-step-circle"></span>
              </div>
              <h3>Receive Reports</h3>
              <p>Access your live CSR dashboard and download audit-ready compliance summaries.</p>
            </div>
          </div>
        </div>
      </section>

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
                    <span className="gp-model-carousel__icon" aria-hidden="true">
                      {modelRouteIcons[model.id]}
                    </span>
                    <span className="gp-model-carousel__content">
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
          <div className="gp-photo-carousel">
            <button
              type="button"
              className="gp-photo-carousel__arrow gp-photo-carousel__arrow--prev"
              onClick={() => goToPhotoOffset(-1)}
              aria-label="Previous photo"
            >
              {modelCarouselPrevIcon}
            </button>

            <div className="gp-photo-grid" ref={photoTrackRef}>
              <article className="gp-photo-lead">
                <span className="gp-section-eyebrow">Field evidence</span>
                <h2>Real plantings. Real places. Real proof.</h2>
                <p>
                  Every photo below is unedited field evidence from active LandCheck Green
                  projects in Yola South, Fufore, and Girei, Adamawa State — not stock photography.
                </p>
                <ul className="gp-photo-points">
                  {photoEvidencePoints.map((point) => (
                    <li key={point}>{point}</li>
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
