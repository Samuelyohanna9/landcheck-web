import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import routeMetadata from "../src/data/routeMetadata.json" with { type: "json" };

const SITE_ORIGIN = "https://landcheck.online";
const DIST_DIR = path.resolve(process.cwd(), "dist");
const DEFAULT_OG_IMAGE = routeMetadata["/"].ogImage || `${SITE_ORIGIN}/ecf-partnership.jpeg`;
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
];
const SOCIAL_PROFILES = [
  "https://play.google.com/store/apps/details?id=online.landcheck.mobile",
  "https://www.instagram.com/land.check/",
  "https://www.facebook.com/landcheck/",
  "https://www.youtube.com/@LandCheckGreen",
  "https://www.tiktok.com/@landcheckgeo",
  "https://www.linkedin.com/company/landcheck-geospatial/",
];

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
  let html = template
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/\s*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace("</head>", `<script type="application/ld+json" data-lc-site-schema>${siteSchema}</script>${schema ? `\n<script type="application/ld+json" data-lc-page-schema>${schema}</script>` : ""}\n</head>`);

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
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]+"[^>]*>/gi, "");
  const hreflang = String(page.robots || "").includes("noindex")
    ? ""
    : `\n<link rel="alternate" hreflang="en-ng" href="${url}" />\n<link rel="alternate" hreflang="en" href="${url}" />\n<link rel="alternate" hreflang="x-default" href="${url}" />`;
  html = html.replace("</head>", `<link rel="canonical" href="${url}" />${hreflang}\n</head>`);
  if (page.bodyHtml) {
    html = html.replace('<div id="root"></div>', `<div id="root">${page.bodyHtml}</div>`);
  }
  return html;
};

const renderSitemap = (indexablePages) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexablePages.map((page) => `  <url>\n    <loc>${escapeHtml(absoluteUrl(page.canonicalPath || canonicalPath(page.path)))}</loc>${page.lastmod ? `\n    <lastmod>${escapeHtml(page.lastmod)}</lastmod>` : ""}\n  </url>`).join("\n")}
</urlset>
`;

const template = await readFile(path.join(DIST_DIR, "index.html"), "utf8");
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
