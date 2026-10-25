import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import routeMetadata from "../src/data/routeMetadata.json" with { type: "json" };

const SITE_ORIGIN = "https://landcheck.online";
const DIST_DIR = path.resolve(process.cwd(), "dist");
const DEFAULT_OG_IMAGE = routeMetadata["/"].ogImage || `${SITE_ORIGIN}/ecf-partnership.jpeg`;
const SOCIAL_PROFILES = [
  "https://play.google.com/store/apps/details?id=online.landcheck.mobile",
  "https://www.instagram.com/land.check/",
  "https://www.facebook.com/landcheck/",
  "https://www.youtube.com/@LandCheckGreen",
  "https://www.tiktok.com/@landcheckgeo",
  "https://www.linkedin.com/company/landcheck-geospatial/",
];

const pages = Object.entries(routeMetadata)
  .filter(([, page]) => !String(page.robots || "").includes("noindex"))
  .map(([pagePath, page]) => ({ path: pagePath, canonicalPath: page.canonicalPath || pagePath, ...page }));

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
  const schema = JSON.stringify(buildSchema(page), null, 2).replaceAll("</", "<\\/");
  const siteSchema = JSON.stringify(buildSiteSchema(), null, 2).replaceAll("</", "<\\/");
  const robots = page.robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  let html = template
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/\s*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace("</head>", `<script type="application/ld+json" data-lc-site-schema>${siteSchema}</script>\n<script type="application/ld+json" data-lc-page-schema>${schema}</script>\n</head>`);

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
  html = html.replace("</head>", `<link rel="canonical" href="${url}" />\n<link rel="alternate" hreflang="en-ng" href="${url}" />\n<link rel="alternate" hreflang="en" href="${url}" />\n<link rel="alternate" hreflang="x-default" href="${url}" />\n</head>`);
  return html;
};

const template = await readFile(path.join(DIST_DIR, "index.html"), "utf8");
for (const page of pages) {
  const outputDir = path.join(DIST_DIR, page.path.replace(/^\//, ""));
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "index.html"), renderPage(template, page));
}

console.log(`Generated ${pages.length} SEO route shells in ${DIST_DIR}`);
