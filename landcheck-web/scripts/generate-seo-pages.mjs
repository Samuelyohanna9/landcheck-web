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

const CRITICAL_LANDING_STYLE = `<style data-lc-critical-style>
  .lc-critical-page {
    min-height: 100vh;
    background: #f7f7f2;
    color: #102a27;
    font-family: Aptos, "Segoe UI", Arial, sans-serif;
  }
  .lc-critical-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    min-height: 74px;
    padding: 0.75rem clamp(1rem, 4vw, 4.5rem);
    border-bottom: 1px solid rgba(16, 42, 39, 0.12);
    background: rgba(255, 255, 255, 0.96);
  }
  .lc-critical-header__brand { display: inline-flex; align-items: center; flex: 0 0 auto; }
  .lc-critical-header__brand img { display: block; width: 158px; height: auto; }
  .lc-critical-header__nav { display: flex; align-items: center; gap: clamp(0.75rem, 2vw, 2rem); }
  .lc-critical-header__nav a,
  .lc-critical-header__cta { color: #24423d; font-size: 0.88rem; font-weight: 600; text-decoration: none; }
  .lc-critical-header__nav a:hover,
  .lc-critical-header__nav a:focus-visible { color: #16816e; }
  .lc-critical-header__cta { padding: 0.65rem 0.9rem; border: 1px solid #16816e; border-radius: 2px; color: #0d6d5a; }
  .lc-critical-main { width: min(1180px, calc(100% - 2rem)); margin: 0 auto; padding: clamp(2.5rem, 7vw, 6rem) 0 clamp(3rem, 8vw, 7rem); }
  .lc-critical-hero { display: grid; grid-template-columns: minmax(0, 0.94fr) minmax(300px, 1.06fr); gap: clamp(2rem, 6vw, 6rem); align-items: center; }
  .lc-critical-eyebrow,
  .lc-critical-proof__eyebrow { margin: 0 0 1rem; color: #16816e; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
  .lc-critical-hero h1 { max-width: 14ch; margin: 0; font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif; font-size: clamp(2.5rem, 6vw, 5.25rem); font-weight: 500; line-height: 0.99; letter-spacing: -0.045em; }
  .lc-critical-hero__intro { max-width: 58ch; margin: 1.35rem 0 0; color: #536963; font-size: clamp(1rem, 1.8vw, 1.18rem); line-height: 1.65; }
  .lc-critical-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.75rem; }
  .lc-critical-actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0.7rem 1rem; border-radius: 2px; font-size: 0.86rem; font-weight: 700; text-decoration: none; }
  .lc-critical-actions__primary { background: #168f67; color: #fff; }
  .lc-critical-actions__secondary { border: 1px solid rgba(16, 42, 39, 0.25); color: #123c34; background: #fff; }
  .lc-critical-visual { min-height: 300px; overflow: hidden; border-radius: 0.35rem; background: #dfe9e4; box-shadow: 0 18px 44px rgba(16, 42, 39, 0.13); }
  .lc-critical-visual img { display: block; width: 100%; height: clamp(300px, 42vw, 500px); object-fit: cover; }
  .lc-critical-proof { margin-top: clamp(3.5rem, 9vw, 8rem); padding-top: 1.4rem; border-top: 1px solid rgba(16, 42, 39, 0.15); }
  .lc-critical-proof h2 { max-width: 22ch; margin: 0; font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif; font-size: clamp(1.8rem, 3.4vw, 3.2rem); font-weight: 500; line-height: 1.04; letter-spacing: -0.035em; }
  .lc-critical-proof__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin-top: 2rem; }
  .lc-critical-proof__item { padding-top: 0.8rem; border-top: 2px solid #168f67; color: #3f5751; font-size: 0.9rem; line-height: 1.45; }
  @media (max-width: 760px) {
    .lc-critical-header { align-items: flex-start; padding-top: 0.8rem; padding-bottom: 0.8rem; }
    .lc-critical-header__brand img { width: 132px; }
    .lc-critical-header__nav { gap: 0.65rem; }
    .lc-critical-header__nav a:not(:last-child) { display: none; }
    .lc-critical-header__nav a, .lc-critical-header__cta { font-size: 0.76rem; }
    .lc-critical-main { width: min(100% - 1.5rem, 620px); padding-top: 2.5rem; }
    .lc-critical-hero { grid-template-columns: 1fr; gap: 2rem; }
    .lc-critical-hero h1 { max-width: 16ch; font-size: clamp(2.55rem, 13vw, 4.25rem); }
    .lc-critical-visual { min-height: 220px; }
    .lc-critical-visual img { height: min(68vw, 330px); }
    .lc-critical-proof__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (prefers-reduced-motion: reduce) { .lc-critical-page * { scroll-behavior: auto !important; } }
</style>`;

const renderCriticalHeader = () => `<header class="lc-critical-header">
  <a class="lc-critical-header__brand" href="/" aria-label="LandCheck home"><img src="/logo-wordmark-web.png" width="158" height="50" alt="LandCheck" /></a>
  <nav class="lc-critical-header__nav" aria-label="Main navigation">
    <a href="/estates/">Products</a>
    <a href="/career/">Company</a>
    <a href="/feedback/">Support</a>
    <a class="lc-critical-header__cta" href="/estates/register/">Get started</a>
  </nav>
</header>`;

const renderCriticalLanding = (page) => {
  const config = CRITICAL_LANDING_CONFIG[page.path];
  if (!config) return "";
  const shell = page.seoShell || {};
  const heading = shell.heading || String(page.title || "LandCheck").split("|")[0].trim();
  const intro = shell.intro || page.description || "LandCheck geospatial tools for Nigeria.";
  const proof = config.proof.map((item) => `<li class="lc-critical-proof__item">${escapeHtml(item)}</li>`).join("");
  return `<div class="lc-critical-page" data-lc-critical-page="true">
  ${renderCriticalHeader()}
  <main class="lc-critical-main">
    <section class="lc-critical-hero" aria-labelledby="lc-critical-heading">
      <div class="lc-critical-copy">
        <p class="lc-critical-eyebrow">${escapeHtml(config.eyebrow)}</p>
        <h1 id="lc-critical-heading">${escapeHtml(heading)}</h1>
        <p class="lc-critical-hero__intro">${escapeHtml(intro)}</p>
        <div class="lc-critical-actions">
          <a class="lc-critical-actions__primary" href="${escapeHtml(config.primary.href)}">${escapeHtml(config.primary.label)}</a>
          <a class="lc-critical-actions__secondary" href="${escapeHtml(config.secondary.href)}">${escapeHtml(config.secondary.label)}</a>
        </div>
      </div>
      <div class="lc-critical-visual"><img src="${escapeHtml(config.image)}" width="1200" height="760" alt="${escapeHtml(config.imageAlt)}" loading="eager" fetchpriority="high" decoding="async" /></div>
    </section>
    <section class="lc-critical-proof" aria-labelledby="lc-critical-proof-heading">
      <p class="lc-critical-proof__eyebrow">${escapeHtml(config.sectionEyebrow)}</p>
      <h2 id="lc-critical-proof-heading">${escapeHtml(config.sectionTitle)}</h2>
      <ul class="lc-critical-proof__grid">${proof}</ul>
    </section>
  </main>
</div>`;
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
  if (isCriticalLanding) html = html.replace("</head>", `${CRITICAL_LANDING_STYLE}\n</head>`);
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
