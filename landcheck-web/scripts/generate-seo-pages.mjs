import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import routeMetadata from "../src/data/routeMetadata.json" with { type: "json" };

const SITE_ORIGIN = "https://landcheck.online";
const DIST_DIR = path.resolve(process.cwd(), "dist");
const DEFAULT_OG_IMAGE = routeMetadata["/"].ogImage || `${SITE_ORIGIN}/ecf-partnership.jpeg`;
const PUBLIC_ROUTE_CHUNK_PREFIXES = {
  "/": "LandingPage",
  "/estates": "EstateLanding",
  "/survey": "SurveyPlanLanding",
  "/survey/guides": "SurveyGuides",
  "/green-partners": "GreenPartnersLanding",
  "/sponsor": "GreenPublicSponsor",
  "/sponsor/calculator": "GreenFootprintCalculator",
  "/flood": "FloodAnalysisLanding",
  "/news": "NewsPage",
  "/career": "CareersPage",
  "/privacy": "PrivacyPolicy",
  "/feedback": "Feedback",
  "/estates/data-processing-agreement": "EstateDpaPreview",
};
const PUBLIC_ROUTE_STYLE_PREFIXES = {
  "/": ["NavBar", "LandingPage", "public-landing"],
  "/estates": ["EstateLanding", "estate-portal", "public-landing"],
  "/survey": ["SurveyPlanLanding", "public-landing"],
  "/survey/guides": ["SurveyGuides", "public-landing"],
  "/green-partners": ["NavBar", "GreenPartnersLanding", "public-landing"],
  "/sponsor": ["GreenPublicSponsor", "green-public-sponsor", "public-landing"],
  "/sponsor/calculator": ["GreenFootprintCalculator", "public-landing"],
  "/flood": ["NavBar", "FloodAnalysisLanding", "public-landing"],
  "/news": ["NewsPage", "public-landing"],
  "/career": ["CareersPage", "public-landing"],
};
const PRIVATE_SHELL_PATHS = [
  "/green/login",
  "/green/login/sponsor",
  "/green/login/field",
  "/green",
  "/green-merchant/login",
  "/green-merchant",
  "/green-work/login",
  "/green-work/forgot-password",
  "/green-work/register",
  "/green-work/email-verified",
  "/green-work",
  "/reset-password",
  "/estate-admin/accounting",
  "/estate-admin",
  "/survey/auth/verify",
  "/survey/auth/callback",
  "/estates/login",
  "/estates/register",
  "/estates/forgot-password",
  "/estates/reset-password",
  "/estates/email-verified",
  "/estates/set-new-password",
  "/estates/choose-plan",
  "/estates/billing",
  "/estates/legal",
  "/estates/workspace",
  "/estates/payments",
  "/estates/reconciliation",
  "/estates/commissions",
  "/estates/integrations",
  "/estates/documents",
  "/app/claim",
  "/dashboard",
  "/admin",
];
const SOCIAL_PROFILES = [
  "https://play.google.com/store/apps/details?id=online.landcheck.mobile",
  "https://www.instagram.com/land.check/",
  "https://www.facebook.com/landcheck/",
  "https://www.youtube.com/@LandCheckGreen",
  "https://www.tiktok.com/@landcheckgeo",
  "https://www.linkedin.com/company/landcheck-geospatial/",
];

// This is the small, real first viewport that is written into each public marketing route.
// The page components remain the source of the full experience; this data only describes the
// shared header, hero visual and first proof section that should be useful before React loads.
// Headings and introductions continue to come from routeMetadata.json so the initial page and
// the React route cannot drift into two different marketing promises.
const CRITICAL_LANDING_CONFIG = {
  "/": {
    eyebrow: "LandCheck Geospatial Technologies",
    image: "/thumpnail_public.webp",
    imageAlt: "LandCheck field and geospatial work in Nigeria",
    sectionEyebrow: "One platform, several practical tools",
    sectionTitle: "Land, property and environmental work in one connected place.",
    proof: ["Survey plans", "Estate management", "Flood and land-risk screening", "Verified tree monitoring"],
    primary: { href: "/estates/", label: "Explore LandCheck Estates" },
    secondary: { href: "/survey/", label: "Create a survey plan" },
  },
  "/estates": {
    eyebrow: "LandCheck Estates",
    image: "/estate-dashboard-map.jpg",
    imageAlt: "LandCheck Estates map showing plots and estate records",
    sectionEyebrow: "Every plot. One connected record.",
    sectionTitle: "From layout to allocation, keep the estate workflow together.",
    proof: ["Layouts and plot availability", "Customers and reservations", "Sales and instalments", "Allocations and survey documents"],
    primary: { href: "/estates/register/", label: "Start with LandCheck Estates" },
    secondary: { href: "#platform", label: "View the platform" },
  },
  "/survey": {
    eyebrow: "LandCheck Survey",
    image: "/survey%20%20plan%20preview.jpg",
    imageAlt: "LandCheck Survey plan preview with a plotted parcel and measurements",
    sectionEyebrow: "Coordinates to finished plan",
    sectionTitle: "Prepare, review and export survey work from one workspace.",
    proof: ["Coordinate and spreadsheet input", "Georeferencing and AI digitisation", "Subdivision tools", "PDF, DWG, orthophoto and topographic exports"],
    primary: { href: "/survey-plan/", label: "Create a survey plan" },
    secondary: { href: "/survey/guides/", label: "Read the Survey guides" },
  },
  "/survey/guides": {
    eyebrow: "LandCheck Survey guides",
    image: "/Digital-Land-Survey.jpg",
    imageAlt: "Digital land survey work prepared for review",
    sectionEyebrow: "Practical field and office guidance",
    sectionTitle: "Clear steps for turning land data into useful records.",
    proof: ["Coordinate preparation", "Parcel subdivision", "Scanned-plan georeferencing", "Flood, erosion and land-cover review"],
    primary: { href: "/survey/", label: "Open LandCheck Survey" },
    secondary: { href: "/flood/", label: "Explore hazard screening" },
  },
  "/green-partners": {
    eyebrow: "LandCheck Green",
    image: "/tree_adamawa.JPG",
    imageAlt: "LandCheck Green field team carrying out verified planting work",
    sectionEyebrow: "Field delivery with evidence built in",
    sectionTitle: "Plan, capture and report environmental work with confidence.",
    proof: ["GPS-verified field observations", "Tree and project records", "Maintenance and monitoring", "Export-ready reporting"],
    primary: { href: "/sponsor/", label: "See tree sponsorship" },
    secondary: { href: "/news/", label: "Read field stories" },
  },
  "/sponsor": {
    eyebrow: "LandCheck Green sponsorship",
    image: "/sponsor_landing_page.jpg",
    imageAlt: "LandCheck Green tree sponsorship experience",
    sectionEyebrow: "A clear record from planting to maintenance",
    sectionTitle: "Support verified tree projects in Nigeria and receive the evidence.",
    proof: ["Choose a public project", "Pay in NGN or USD", "Receive a certificate and map", "Follow photo and maintenance evidence"],
    primary: { href: "/sponsor/calculator/", label: "Calculate a sponsorship" },
    secondary: { href: "/green-partners/", label: "See the Green platform" },
  },
  "/sponsor/calculator": {
    eyebrow: "LandCheck Green",
    image: "/info_web.webp",
    imageAlt: "LandCheck Green information and sponsorship planning",
    sectionEyebrow: "Plan the right sponsorship quantity",
    sectionTitle: "Estimate the trees that fit your climate project or footprint.",
    proof: ["A quick estimate", "Clear assumptions", "Works for projects and organisations", "Continue to a verified sponsorship"],
    primary: { href: "/sponsor/", label: "Choose a sponsorship project" },
    secondary: { href: "/green-partners/", label: "Explore LandCheck Green" },
  },
  "/flood": {
    eyebrow: "LandCheck Hazard Analysis",
    image: "/flood-background.jpg",
    imageAlt: "Land hazard analysis map background for a Nigerian site",
    sectionEyebrow: "Screen the site before you commit",
    sectionTitle: "Understand flood, erosion, soil and land-cover risk for a Nigerian parcel.",
    proof: ["Flood exposure screening", "Erosion and soil stability", "Land-use and land-cover context", "Downloadable site report"],
    primary: { href: "/hazard-analysis/", label: "Run a site screening" },
    secondary: { href: "/survey/", label: "Create a survey plan" },
  },
  "/career": {
    eyebrow: "LandCheck careers",
    image: "/green-work-dasbord.jpg",
    imageAlt: "LandCheck geospatial operations workspace",
    sectionEyebrow: "Useful technology for Nigeria",
    sectionTitle: "Help build practical tools for land, survey and environmental work.",
    proof: ["Geospatial products", "Field operations", "Land and estate workflows", "A team solving practical problems"],
    primary: { href: "/feedback/", label: "Contact LandCheck" },
    secondary: { href: "/", label: "Learn about LandCheck" },
  },
  "/news": {
    eyebrow: "LandCheck insights",
    image: "/ecf-partnership.jpeg",
    imageAlt: "LandCheck environmental project partnership",
    sectionEyebrow: "Practical field and product notes",
    sectionTitle: "Stories and guidance on land, surveys and verified environmental programmes.",
    proof: ["CSR and ESG workflows", "GPS verification", "Environmental monitoring", "Land and survey practice"],
    primary: { href: "/green-partners/", label: "Explore LandCheck Green" },
    secondary: { href: "/sponsor/", label: "Sponsor a verified tree" },
  },
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const replaceMeta = (html, attribute, key, value) => {
  const pattern = new RegExp(`<meta\\s+${attribute}="${escapeRegExp(key)}"[^>]*>`, "i");
  return html.replace(pattern, `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`);
};

const removeMeta = (html, attribute, key) => {
  const pattern = new RegExp(`\\s*<meta\\s+${attribute}="${escapeRegExp(key)}"[^>]*>`, "ig");
  return html.replace(pattern, "");
};

const absoluteUrl = (pagePath) => `${SITE_ORIGIN}${pagePath === "/" ? "/" : pagePath}`;

const canonicalPath = (pagePath) => {
  if (!pagePath || pagePath === "/") return "/";
  return `/${String(pagePath).replace(/^\/+|\/+$/g, "")}/`;
};

const loadNewsArticles = async () => {
  const source = await readFile(path.resolve(process.cwd(), "src/data/newsArticles.ts"), "utf8");
  const { code } = await esbuild.transform(source, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return module.newsArticles;
};

const renderArticleBody = (article) => {
  const sections = article.sections
    .map((section) => {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
      const paragraphs = section.paragraphs
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("\n");
      return `<section>${heading}${paragraphs}</section>`;
    })
    .join("\n");
  const productLinks = [
    `<a href="/green-partners/">See LandCheck Green for organisations</a>`,
    article.sponsored ? `<a href="/sponsor/">Sponsor a verified tree</a>` : "",
  ].filter(Boolean).join(" &middot; ");

  return `<article class="np-story np-story--seo">
  <div class="ip-container np-story-container">
    <a class="np-back-link" href="/news/">&larr; All stories</a>
    <div class="np-story-meta">
      <span class="np-tag">${escapeHtml(article.tag)}</span>
      ${article.location ? `<span class="np-story-location">${escapeHtml(article.location)}</span>` : ""}
      <time dateTime="${escapeHtml(article.date)}">${escapeHtml(article.date)}</time>
      <span class="np-story-readtime">${escapeHtml(article.readMinutes)} min read</span>
    </div>
    <h1>${escapeHtml(article.title)}</h1>
    <p class="np-lead">${escapeHtml(article.summary)}</p>
  </div>
  ${article.heroImage ? `<figure class="np-story-hero"><img src="${escapeHtml(article.heroImage)}" alt="${escapeHtml(article.heroImageAlt || article.title)}" /></figure>` : ""}
  <div class="ip-container np-story-container">
    <div class="np-body">${sections}</div>
    <aside class="np-cta-card"><h2>Explore LandCheck</h2><p>${productLinks}</p></aside>
  </div>
</article>`;
};

const buildArticlePages = (articles) => articles.map((article) => {
  const articlePath = `/news/${article.slug}`;
  const articleCanonical = canonicalPath(articlePath);
  const articleUrl = absoluteUrl(articleCanonical);
  const dateModified = article.dateModified || article.date;
  return {
    path: articlePath,
    canonicalPath: articleCanonical,
    title: `${article.title} | LandCheck Insights`,
    description: article.summary,
    keywords: `${article.tag}, LandCheck, Nigeria, ${article.location || "geospatial intelligence"}`,
    robots: "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    ogType: "article",
    ogImage: article.heroImage ? absoluteUrl(article.heroImage) : DEFAULT_OG_IMAGE,
    bodyHtml: renderArticleBody(article),
    lastmod: dateModified,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${articleUrl}#article`,
      url: articleUrl,
      mainEntityOfPage: { "@type": "WebPage", "@id": `${articleUrl}#page` },
      headline: article.title,
      description: article.summary,
      datePublished: article.date,
      dateModified,
      author: {
        "@type": "Organization",
        name: "LandCheck Geospatial Technologies Limited",
        url: `${SITE_ORIGIN}/`,
      },
      publisher: {
        "@type": "Organization",
        name: "LandCheck Geospatial Technologies Limited",
        logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/logo-icon-512.png` },
      },
      image: article.heroImage ? absoluteUrl(article.heroImage) : `${SITE_ORIGIN}/logo-icon-512.png`,
      articleSection: article.tag,
      inLanguage: "en-NG",
    },
  };
});

const buildPrivatePages = () => PRIVATE_SHELL_PATHS.map((privatePath) => ({
  path: privatePath,
  canonicalPath: canonicalPath(privatePath),
  title: "LandCheck workspace",
  description: "Private LandCheck workspace. Sign in to continue.",
  keywords: "",
  robots: "noindex,nofollow,noarchive",
  ogType: "website",
  ogImage: DEFAULT_OG_IMAGE,
  jsonLd: null,
}));

const buildSchema = (page) => {
  if (page.jsonLd) return page.jsonLd;
  const url = absoluteUrl(page.canonicalPath || page.path);
  const graph = [{
    "@type": "WebPage",
    "@id": `${url}#page`,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    about: { "@id": `${SITE_ORIGIN}/#organization` },
    inLanguage: "en-NG",
  }];
  if (page.path !== "/") {
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: page.title.split("|")[0].trim(), item: url },
      ],
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
};

const renderSeoShell = (page) => {
  const shell = page.seoShell || {};
  const heading = shell.heading || String(page.title || "LandCheck").split("|")[0].trim();
  const intro = shell.intro || page.description || "LandCheck geospatial tools for Nigeria.";
  const links = Array.isArray(shell.links) ? shell.links : [];
  const linkHtml = links
    .filter((link) => link && link.href && link.label)
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('<span aria-hidden="true">&middot;</span>');

  return `<main class="lc-seo-shell" data-lc-seo-shell="true" aria-labelledby="lc-seo-shell-heading">
  <div class="lc-seo-shell__inner">
    <p class="lc-seo-shell__eyebrow">LandCheck Geospatial Technologies</p>
    <h1 id="lc-seo-shell-heading">${escapeHtml(heading)}</h1>
    <p class="lc-seo-shell__intro">${escapeHtml(intro)}</p>
    ${linkHtml ? `<nav class="lc-seo-shell__links" aria-label="Related LandCheck pages">${linkHtml}</nav>` : ""}
  </div>
</main>`;
};

// Public shells use the same class names and first-viewport structure as the React pages. The
// shell is not a second landing page: React replaces this exact root content on mount, while the
// browser can paint the real branded header, hero and first section before JavaScript arrives.
const STATIC_FIRST_PAINT_STYLE = `<style data-lc-static-style>
  html { background: #fff; }
  body { margin: 0; }
  .lc-static-image { display: block; width: 100%; height: auto; }
  .lc-static-link { text-decoration: none; }
</style>`;

const renderSharedNav = ({ fixed = false, activeRoute = "", ctaHref = "/estates/register/", ctaLabel = "Get started" } = {}) => `<header class="lc-nav lc-nav--light${fixed ? " lc-nav--fixed" : ""}">
  <a class="lc-nav-brand" href="/" aria-label="LandCheck home"><img src="/logo-wordmark-web.png" width="182" height="58" alt="LandCheck" /></a>
  <nav class="lc-nav-desktop" aria-label="Main navigation">
    <a class="lc-nav-link${activeRoute === "/estates" ? " lc-nav-item-active" : ""}" href="/estates/">Products</a>
    <a class="lc-nav-link${activeRoute === "/career" ? " lc-nav-item-active" : ""}" href="/career/">Company</a>
    <a class="lc-nav-link" href="mailto:support@landcheck.online?subject=LandCheck%20Support">Support</a>
    <a class="lc-nav-cta lc-static-link" href="${escapeHtml(ctaHref)}">${escapeHtml(ctaLabel)}</a>
  </nav>
</header>`;

const renderHomeLanding = () => `<div class="landcheck-landing public-landing">
  ${renderSharedNav({ ctaHref: "/estates/register/" })}
  <main>
    <section class="lp-hero" style="background-image:url('/thumpnail_public.webp')" aria-labelledby="lp-static-title">
      <div class="lp-hero-video-wrap" aria-hidden="true" style="background-image:url('/thumpnail_public.webp');background-size:cover;background-position:center;opacity:1"></div>
      <div class="lp-hero-overlay"></div>
      <div class="lp-hero-content">
        <h1 id="lp-static-title">Geospatial Intelligence <br />for Development Projects</h1>
        <p class="lp-hero-lead">Environmental monitoring, tree planting sponsorship, field operations, survey plans, and flood risk in one platform.</p>
        <div class="lp-hero-ctas">
          <a class="lp-hero-btn-primary lc-static-link" href="#products">Our products</a>
          <a class="lp-hero-btn-outline lc-static-link" href="/sponsor/">Sponsor a tree planting</a>
        </div>
      </div>
      <a href="#landcheck-intro" class="lp-scroll-indicator" aria-label="Scroll to content">⌄</a>
    </section>
    <section id="landcheck-intro" class="lp-intro-section">
      <div class="lp-intro-inner">
        <span class="lp-intro-kicker">From Mapping to <span class="lp-motto-accent">Impact</span></span>
        <h2>We are <strong>LandCheck</strong></h2>
        <div class="lp-intro-lead-wrap"><p>LandCheck develops web and mobile tools for land documentation, flood hazard analysis, and environmental field monitoring, providing practical tools for surveyors, land owners, NGOs, and government agencies across Nigeria.</p></div>
      </div>
    </section>
  </main>
</div>`;

const renderEstateLanding = () => `<main class="estate-portal public-landing">
  <header class="estate-portal-nav">
    <a href="/estates/" class="estate-brand" aria-label="LandCheck Estates home"><img src="/logo-wordmark-web.png" alt="LandCheck" width="182" height="58" /><span>ESTATES</span></a>
    <nav class="estate-portal-nav-links" aria-label="Estate product navigation">
      <a href="#platform">Platform</a><a href="#overview-video">Watch overview</a><a href="#solutions">Solutions</a><a href="#pricing">Pricing</a>
      <a href="/agents/login/">For property agents</a><a href="/estates/login/" class="estate-nav-login">Sign in</a><a href="/feedback/" class="estate-nav-cta">Request a demo</a>
    </nav>
  </header>
  <section class="estate-hero" aria-labelledby="estate-intro-title">
    <p class="estate-kicker estate-hero-kicker">LandCheck Estates</p>
    <h1 id="estate-intro-title">Run your estate from layout to allocation.</h1>
    <p class="estate-hero-summary">LandCheck Estates connects layouts, plots, customers, reservations, sales, instalments, allocations and survey documents for Nigerian real estate developers.</p>
    <div class="estate-intro-actions estate-intro-actions--centered"><a class="estate-button" href="/feedback/">Request a demo</a><a class="estate-button estate-button--outline-light" href="#platform">View platform</a></div>
    <p class="estate-hero-caption">Every plot. One connected record.</p>
  </section>
  <section class="estate-video-section" id="overview-video" aria-labelledby="estate-video-title">
    <div class="estate-video-copy"><p class="estate-kicker">See it in action</p><h2 id="estate-video-title">One connected workspace for every plot.</h2><p>See how LandCheck Estates connects estate layouts, plot availability, customer records, reservations, payments, allocations and survey documents.</p></div>
    <div class="estate-video-frame"><img class="lc-static-image" src="/estate-dashboard-map.jpg" width="1200" height="675" alt="LandCheck Estates dashboard showing an estate map, plots and activity" loading="eager" fetchpriority="high" /></div>
  </section>
</main>`;

const renderSurveyLanding = () => `<div class="spl-page public-landing">
  <header class="spl-nav"><a href="/" class="spl-brand" aria-label="LandCheck home"><img src="/logo-wordmark-web.png" alt="LandCheck" width="182" height="58" /><span class="spl-brand-product">Survey</span></a><nav class="spl-nav-links" aria-label="Survey navigation"><a href="/survey/guides/">Guides</a><a href="/estates/">Estates</a><a href="/flood/">Hazard analysis</a><a href="/survey-plan/" class="spl-nav-workspace">Open workspace</a></nav></header>
  <main><section class="spl-hero" aria-labelledby="spl-hero-title"><div class="spl-hero-device" aria-hidden="true"><img class="spl-hero-laptop" src="/survey-laptop-hand.webp" alt="" loading="eager" fetchpriority="high" /></div><div class="spl-hero-screen" aria-hidden="true"><img src="/survey%20%20plan%20preview.jpg" alt="" loading="eager" fetchpriority="high" /></div><div class="spl-hero-shade"></div><div class="spl-shell spl-hero-shell"><div class="spl-hero-copy"><p class="spl-kicker">LandCheck Survey</p><h1 id="spl-hero-title">Professional survey plans. Ready in minutes.</h1><p class="spl-hero-summary">Convert coordinates or scanned layouts into accurate, export-ready survey plans - from one connected workspace.</p><div class="spl-hero-actions"><a class="spl-hero-btn-primary lc-static-link" href="/survey-plan/">Open survey workspace</a><a href="#workflow" class="spl-hero-btn-outline">See how it works</a></div><div class="spl-hero-stats"><div class="spl-hero-stat"><strong>Faster</strong><span>from data to plan</span></div></div></div></div></section><section id="features" class="spl-section spl-features"><div class="spl-shell spl-features-grid"><div class="spl-feature-card"><h3>Coordinate input</h3><p>Bring in coordinates or scanned layouts and prepare them for review.</p></div><div class="spl-feature-card"><h3>Professional exports</h3><p>Review and export a polished survey plan from one workspace.</p></div><div class="spl-feature-card"><h3>Geospatial tools</h3><p>Use georeferencing, subdivision and map tools as your work develops.</p></div></div></section></main>
</div>`;

const renderGreenPartnersLanding = () => `<div class="green-partners-page public-landing">
  ${renderSharedNav({ ctaHref: "/green-work/login/", ctaLabel: "Get Started" })}
  <section class="gp-new-hero" style="background-image:url('/seeds.JPG')"><div class="gp-new-hero-scrim" aria-hidden="true"></div><div class="gp-shell gp-new-hero-inner"><div class="gp-new-hero-copy"><h1>Tree programmes with proof built in.</h1><p class="gp-new-hero-subheadline">LandCheck Green gives NGOs, CSR teams, and sponsors one verified system for field delivery, GPS evidence, maintenance tracking, and export-ready reporting.</p><div class="gp-new-hero-actions"><a class="gp-btn gp-btn--primary" href="/green-work/login/">Manage your Green Programme</a><a class="gp-btn gp-btn--secondary" href="/sponsor/">Sponsor a Tree</a></div><div class="gp-new-hero-stats gp-new-hero-stats--single"><div class="gp-new-hero-stat-item"><strong>Live</strong><span>Registered partner organisations</span></div></div></div></div></section>
  <section class="gp-workflow-stage"><div class="gp-shell"><div class="gp-section-intro gp-section-intro--center"><span class="gp-section-eyebrow">Operating flow</span><h2>From programme design to board-ready reporting</h2><p>A short operating sequence with clear review gates and evidence you can defend.</p></div></div></section>
</div>`;

const renderSponsorLanding = () => `<div class="gps-page public-landing">
  <header class="gps-topbar"><a href="/" class="gps-topbar-brand"><span class="gps-topbar-logo-badge"><img src="/logo-wordmark-web.png" alt="LandCheck" width="182" height="58" /></span><span class="gps-topbar-product">GREEN</span></a><nav class="gps-topbar-links" aria-label="Sponsor navigation"><a href="#gps-projects">Shop Projects</a><a href="#gps-projects">Track Order</a><a href="/green-partners/">For Organizations</a></nav><div class="gps-topbar-icons"><a href="/green/login/sponsor/" class="gps-topbar-icon-btn" aria-label="Sign in to my account">Sign in</a></div></header>
  <section class="lp-sponsor-section"><div class="lp-sponsor-inner"><div class="lp-sponsor-text"><span class="lp-sponsor-eyebrow">LANDCHECK GREEN</span><h1>Sponsor a Tree.<br />Track Its Journey.</h1><p>Support verified tree planting projects and monitor your environmental impact through GPS tracking, photo updates, maintenance records, and carbon reporting.</p><ul class="lp-sponsor-bullets"><li class="lp-sponsor-bullet"><strong>GPS Tracking</strong><span>Know exactly where your trees are planted on the map</span></li><li class="lp-sponsor-bullet"><strong>Photo Updates</strong><span>See photo evidence as your tree grows over time</span></li><li class="lp-sponsor-bullet"><strong>Maintenance Records</strong><span>Track watering, pruning, and full care history</span></li><li class="lp-sponsor-bullet"><strong>Carbon Reporting</strong><span>Measure your CO2 offset with verified impact data</span></li></ul><div class="lp-sponsor-ctas"><a class="lp-sponsor-btn-primary lc-static-link" href="#gps-projects">Sponsor</a><a class="lp-sponsor-playstore lc-static-link" href="https://play.google.com/store/apps/details?id=online.landcheck.mobile">Get the Android app</a></div></div><div class="lp-sponsor-visual"><div class="lp-sponsor-phone-wrap"><div class="lp-sponsor-phone-frame"><div class="lp-sponsor-phone-screen"><img src="/sponsor-tree-app.jpeg" alt="LandCheck Green Sponsor a Tree app" width="280" height="560" loading="eager" fetchpriority="high" /></div></div></div></div></div></section>
  <main class="gps-main"><section class="gps-projects-section" id="gps-projects"><h2 class="gps-public-page-title">Choose the project you want to support</h2><p class="gps-section-sub">Every project below is field-managed, GPS-linked, and built to give you certificate delivery, map proof, and follow-up updates after payment.</p><p class="gps-loading">Loading current sponsorship projects...</p></section></main>
</div>`;

const renderFloodLanding = () => `<div class="fal-page public-landing">
  ${renderSharedNav({ fixed: true, ctaHref: "/hazard-analysis/", ctaLabel: "Run Analysis" })}
  <main><section class="fal-hero"><div class="fal-hero-overlay"></div><div class="fal-hero-content"><span class="fal-hero-eyebrow">LANDCHECK FLOOD RISK</span><h1>Land Hazard Screening<br />for Any Site in Nigeria</h1><p>Instant flood risk assessment, erosion analysis, soil stability, and land use / land cover classification - with a downloadable PDF for any Nigerian land parcel.</p><div class="fal-hero-ctas"><a class="fal-hero-btn-primary lc-static-link" href="/hazard-analysis/">Run Flood Analysis</a><a href="#features" class="fal-hero-btn-outline">See Features</a></div></div></section><section id="features" class="fal-features-section"><div class="fal-features-inner"><div class="fal-section-head"><span class="fal-eyebrow">WHAT WE SCREEN FOR</span><h2>Comprehensive Land Risk Analysis</h2><p>Everything you need to assess hazard risk before buying, building, or financing land in Nigeria.</p></div></div></section></main>
</div>`;

const renderInformationalLanding = (page) => {
  const config = CRITICAL_LANDING_CONFIG[page.path];
  const shell = page.seoShell || {};
  const heading = shell.heading || String(page.title || "LandCheck").split("|")[0].trim();
  const intro = shell.intro || page.description || "LandCheck geospatial tools for Nigeria.";
  return `<main class="public-landing lc-public-first-paint"><header class="lc-nav lc-nav--light"><a class="lc-nav-brand" href="/"><img src="/logo-wordmark-web.png" width="182" height="58" alt="LandCheck" /></a></header><section class="lc-public-first-paint__content"><p>${escapeHtml(config?.eyebrow || "LandCheck Geospatial Technologies")}</p><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(intro)}</p><a href="${escapeHtml(config?.primary?.href || "/")}">${escapeHtml(config?.primary?.label || "Explore LandCheck")}</a></section></main>`;
};

const renderCriticalLanding = (page) => {
  switch (page.path) {
    case "/": return renderHomeLanding();
    case "/estates": return renderEstateLanding();
    case "/survey": return renderSurveyLanding();
    case "/green-partners": return renderGreenPartnersLanding();
    case "/sponsor": return renderSponsorLanding();
    case "/flood": return renderFloodLanding();
    default: return renderInformationalLanding(page);
  }
};

const buildSiteSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_ORIGIN}/#organization`,
  name: "LandCheck Geospatial Technologies Limited",
  alternateName: "LandCheck",
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/logo-icon-512.png`,
  description: "Geospatial intelligence tools for land, property, surveys, hazard analysis, and verified environmental field programmes in Nigeria.",
  areaServed: { "@type": "Country", name: "Nigeria" },
  sameAs: SOCIAL_PROFILES,
});

const renderPage = (template, page) => {
  const url = absoluteUrl(page.canonicalPath || page.path);
  const image = String(page.ogImage || DEFAULT_OG_IMAGE);
  const imageType = image.toLowerCase().endsWith(".png") ? "image/png"
    : image.toLowerCase().endsWith(".webp") ? "image/webp"
      : "image/jpeg";
  const pageSchema = String(page.robots || "").includes("noindex") ? null : buildSchema(page);
  const schema = pageSchema ? JSON.stringify(pageSchema, null, 2).replaceAll("</", "<\\/") : "";
  const siteSchema = JSON.stringify(buildSiteSchema(), null, 2).replaceAll("</", "<\\/");
  const robots = page.robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  const routeChunk = routeChunkHref(page.path);
  const routePreload = routeChunk
    ? `<link rel="modulepreload" crossorigin href="${routeChunk}">`
    : "";
  const routeStyles = routeStyleHrefs(page.path)
    .map((href) => `<link rel="stylesheet" crossorigin href="${href}">`)
    .join("\n");
  let html = template
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/\s*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace("</head>", `${routePreload}\n<script type="application/ld+json" data-lc-site-schema>${siteSchema}</script>${schema ? `\n<script type="application/ld+json" data-lc-page-schema>${schema}</script>` : ""}\n</head>`);

  html = replaceMeta(html, "name", "description", page.description);
  html = replaceMeta(html, "name", "keywords", page.keywords || "");
  html = replaceMeta(html, "name", "robots", robots);
  html = replaceMeta(html, "name", "googlebot", robots);
  html = replaceMeta(html, "property", "og:type", page.ogType || "website");
  html = replaceMeta(html, "property", "og:title", page.title);
  html = replaceMeta(html, "property", "og:description", page.description);
  html = replaceMeta(html, "property", "og:url", url);
  html = replaceMeta(html, "property", "og:image", image);
  html = replaceMeta(html, "property", "og:image:type", imageType);
  html = replaceMeta(html, "property", "og:image:alt", page.title);
  html = replaceMeta(html, "name", "twitter:title", page.title);
  html = replaceMeta(html, "name", "twitter:description", page.description);
  html = replaceMeta(html, "name", "twitter:image", image);
  html = replaceMeta(html, "name", "twitter:image:alt", page.title);
  html = image === DEFAULT_OG_IMAGE
    ? replaceMeta(replaceMeta(html, "property", "og:image:width", "1280"), "property", "og:image:height", "720")
    : removeMeta(removeMeta(html, "property", "og:image:width"), "property", "og:image:height");

  html = html.replace(/\s*<link rel="canonical"[^>]*>/gi, "");
  // LandCheck currently publishes one English/Nigeria version of each public page. Keep the
  // generated HTML free of stale or unsupported hreflang alternates until distinct locale pages
  // exist and can link to one another reciprocally.
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]+"[^>]*>/gi, "");
  const isNoIndex = String(page.robots || "").includes("noindex");
  const isSelfCanonical = canonicalPath(page.path) === page.canonicalPath;
  const canonicalTag = !isNoIndex || !isSelfCanonical ? `<link rel="canonical" href="${url}" />` : "";
  html = html.replace("</head>", `${canonicalTag}\n</head>`);
  const isCriticalLanding = Boolean(CRITICAL_LANDING_CONFIG[page.path] && !isNoIndex);
  if (isCriticalLanding) html = html.replace("</head>", `${STATIC_FIRST_PAINT_STYLE}\n${routeStyles}\n</head>`);
  const bodyHtml = page.bodyHtml || (
    isCriticalLanding
      ? renderCriticalLanding(page)
      : (!isNoIndex ? renderSeoShell(page) : "")
  );
  if (bodyHtml) {
    html = html.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
    // Critical landing markup is the actual first viewport, so it must remain visible while the
    // route chunk loads. Older document/article shells retain the guarded hand-off behavior.
    if (!isCriticalLanding) {
      html = html.replace(
        "</head>",
        `<script>document.documentElement.classList.add("landcheck-seo-shell-boot");</script>\n</head>`,
      );
    }
  }
  // dist/index.html (page.path === "/") is also the SPA's catch-all fallback (public/_redirects:
  // "/* /index.html 200") for every private, dynamically-ID'd app route that has no generated
  // page of its own (e.g. /estates/42/construction/measure/17) - so this exact file gets served,
  // unmodified, for those URLs too. Without this guard, a hard refresh on one of them would
  // paint the home page's baked-in <main class="lc-seo-shell"> heading for an instant before
  // React mounted and replaced it with that route's own loading state. This inline script runs
  // synchronously as the parser reaches it, immediately after the div it is guarding and before
  // anything else on the page, so it clears that content before the browser gets a chance to
  // paint it for any URL other than the real "/".
  if (bodyHtml && page.path === "/") {
    html = html.replace(
      `<div id="root">${bodyHtml}</div>`,
      `<div id="root">${bodyHtml}</div>\n    <script>if (location.pathname !== "/") document.getElementById("root").textContent = "";</script>`,
    );
  }
  return html;
};

const renderSitemap = (indexablePages) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexablePages.map((page) => `  <url>\n    <loc>${escapeHtml(absoluteUrl(page.canonicalPath || canonicalPath(page.path)))}</loc>${page.lastmod ? `\n    <lastmod>${escapeHtml(page.lastmod)}</lastmod>` : ""}\n  </url>`).join("\n")}
</urlset>
`;

const template = await readFile(path.join(DIST_DIR, "index.html"), "utf8");
const assetFiles = await readdir(path.join(DIST_DIR, "assets"));
const routeChunkHref = (pagePath) => {
  const prefix = pagePath.startsWith("/news/")
    ? "NewsArticlePage"
    : PUBLIC_ROUTE_CHUNK_PREFIXES[pagePath];
  const file = prefix && assetFiles.find((entry) => entry.startsWith(`${prefix}-`) && entry.endsWith(".js"));
  return file ? `/assets/${file}` : null;
};
const routeStyleHrefs = (pagePath) => {
  const prefixes = PUBLIC_ROUTE_STYLE_PREFIXES[pagePath] || (pagePath.startsWith("/news/") ? ["NewsArticlePage", "news", "public-landing"] : []);
  return prefixes
    .map((prefix) => assetFiles.find((entry) => entry.startsWith(`${prefix}-`) && entry.endsWith(".css")))
    .filter(Boolean)
    .map((file) => `/assets/${file}`);
};
const articles = await loadNewsArticles();
const routePages = Object.entries(routeMetadata)
  .map(([pagePath, page]) => ({ path: pagePath, canonicalPath: canonicalPath(page.canonicalPath || pagePath), ...page }));
const privatePages = buildPrivatePages();
const articlePages = buildArticlePages(articles);
const pages = [...routePages, ...privatePages, ...articlePages];
const indexablePages = pages.filter((page) => !String(page.robots || "").includes("noindex"));
const uniqueIndexablePages = [...new Map(indexablePages.map((page) => [page.canonicalPath, page])).values()];

for (const page of pages) {
  const outputDir = path.join(DIST_DIR, page.path.replace(/^\//, ""));
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "index.html"), renderPage(template, page));
}

await writeFile(path.join(DIST_DIR, "sitemap.xml"), renderSitemap(uniqueIndexablePages));

const existingRedirects = await readFile(path.join(DIST_DIR, "_redirects"), "utf8").catch(() => "");
const articleRedirects = articlePages
  .map((page) => `${page.path} ${page.canonicalPath} 301`)
  .join("\n");
await writeFile(path.join(DIST_DIR, "_redirects"), `${articleRedirects}\n${existingRedirects}`);

console.log(`Generated ${pages.length} SEO shells (${articlePages.length} article shells) and ${uniqueIndexablePages.length} sitemap URLs in ${DIST_DIR}`);
