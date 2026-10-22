import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_ORIGIN = "https://landcheck.online";
const DIST_DIR = path.resolve(process.cwd(), "dist");
const DEFAULT_IMAGE = `${SITE_ORIGIN}/logo-icon-512.png`;
const SOCIAL_PROFILES = [
  "https://play.google.com/store/apps/details?id=online.landcheck.mobile",
  "https://www.instagram.com/land.check/",
  "https://www.facebook.com/landcheck/",
  "https://www.youtube.com/@LandCheckGreen",
  "https://www.tiktok.com/@landcheckgeo",
  "https://www.linkedin.com/company/landcheck-geospatial/",
];

const pages = [
  {
    path: "/",
    title: "LandCheck Nigeria | Survey Plans, Estate Management & Flood Risk",
    description:
      "LandCheck brings together survey plan production, estate planning and plot management, flood and erosion analysis, and GPS-verified environmental monitoring for teams in Nigeria.",
    keywords:
      "survey plan Nigeria, estate management software Nigeria, real estate development software Nigeria, flood risk analysis Nigeria, tree monitoring app Nigeria, geospatial platform Nigeria",
    image: DEFAULT_IMAGE,
    type: "website",
    entity: null,
  },
  {
    path: "/estates",
    title: "LandCheck Estates | Estate Management & Plot Sales Software Nigeria",
    description:
      "Plan layouts, manage plots and buyers, track payments, run flood and erosion screening, and market property developments from one estate workspace in Nigeria.",
    keywords:
      "estate management software Nigeria, plot management software, estate layout design Nigeria, real estate marketing software Nigeria, land development platform Nigeria",
    image: `${SITE_ORIGIN}/estates.jpg`,
    type: "website",
    entity: {
      type: "SoftwareApplication",
      idSuffix: "software",
      category: "BusinessApplication",
      name: "LandCheck Estates",
    },
  },
  {
    path: "/green-partners",
    title: "LandCheck Green | GPS Field Monitoring & CSR Reporting Nigeria",
    description:
      "Manage tree planting, environmental field work, CSR delivery, GPS evidence, maintenance, and stakeholder reporting with LandCheck Green.",
    keywords:
      "tree monitoring software Nigeria, CSR reporting software Nigeria, ESG field monitoring, GPS tree planting verification, NGO monitoring platform Nigeria",
    image: `${SITE_ORIGIN}/background-sponsor.png`,
    type: "website",
    entity: {
      type: "SoftwareApplication",
      idSuffix: "software",
      category: "BusinessApplication",
      name: "LandCheck Green",
    },
  },
  {
    path: "/sponsor",
    title: "Sponsor a Tree in Nigeria | GPS-Verified Tree Sponsorship | LandCheck",
    description:
      "Sponsor a real tree planted and monitored in Nigeria. Pay online in NGN or USD and receive a digital certificate, GPS proof, photos, and progress updates.",
    keywords:
      "sponsor a tree Nigeria, plant a tree online Nigeria, verified tree planting, tree sponsorship, donate trees Nigeria, diaspora tree donation",
    image: `${SITE_ORIGIN}/background-sponsor.png`,
    type: "website",
    entity: { type: "Service", idSuffix: "service", category: "Tree Planting Sponsorship", name: "LandCheck Tree Sponsorship" },
  },
  {
    path: "/sponsor/calculator",
    title: "Carbon Footprint Calculator | Estimate Trees to Sponsor | LandCheck",
    description:
      "Estimate your annual carbon footprint and see how many GPS-verified trees in Nigeria you could sponsor. Free online calculator for people anywhere in the world.",
    keywords: "carbon footprint calculator, tree sponsorship calculator, CO2 calculator, how many trees to offset carbon",
    image: `${SITE_ORIGIN}/background-sponsor.png`,
    type: "website",
    entity: null,
  },
  {
    path: "/flood",
    title: "Flood Risk & Land Hazard Analysis Nigeria | LandCheck",
    description:
      "Screen Nigerian land for flood exposure, erosion, soil stability, and land use and land cover with map evidence and a downloadable hazard report.",
    keywords:
      "flood risk analysis Nigeria, land hazard screening Nigeria, flood risk map Nigeria, erosion risk Nigeria, land use land cover Nigeria",
    image: `${SITE_ORIGIN}/flood-background.jpg`,
    type: "website",
    entity: { type: "Service", idSuffix: "service", category: "Land Hazard Screening", name: "LandCheck Flood and Land Hazard Analysis" },
  },
  {
    path: "/survey",
    title: "Survey Plan Production Nigeria | Professional Plans Online | LandCheck",
    description:
      "Create professional survey plans in Nigeria from coordinates or parcel data. Export PDF, DWG, GIS, orthophoto, and computation outputs without CAD software.",
    keywords:
      "survey plan Nigeria, survey plan production Nigeria, digital survey plan, online survey plan generator, DWG survey plan Nigeria",
    image: `${SITE_ORIGIN}/Digital-Land-Survey.jpg`,
    type: "website",
    entity: { type: "Service", idSuffix: "service", category: "Geospatial Survey Planning", name: "LandCheck Survey Plan Production" },
  },
  {
    path: "/survey/guides",
    title: "Survey Plan & Land Analysis Guides Nigeria | LandCheck",
    description:
      "Learn how to create survey plans, subdivide parcels, georeference scanned layouts, digitise boundaries, and review flood, erosion, and land-cover analysis.",
    keywords:
      "survey plan guide Nigeria, land subdivision guide, georeference scanned plan, digitise estate layout, flood analysis guide Nigeria",
    image: `${SITE_ORIGIN}/Digital-Land-Survey.jpg`,
    type: "article",
    entity: { type: "TechArticle", idSuffix: "article", category: "Survey and land analysis guide", name: "LandCheck Survey and Land Analysis Guides" },
  },
  {
    path: "/news",
    title: "LandCheck Insights | CSR, ESG & Environmental Monitoring in Nigeria",
    description:
      "Read practical insights on CSR reporting, GPS verification, environmental field monitoring, tree planting, and land intelligence in Nigeria.",
    keywords: "CSR reporting Nigeria, ESG monitoring Nigeria, environmental monitoring, GPS verification, tree planting project management",
    image: `${SITE_ORIGIN}/ecf-partnership.jpeg`,
    type: "article",
    entity: { type: "Blog", idSuffix: "blog", category: "LandCheck Insights", name: "LandCheck Insights" },
  },
  {
    path: "/career",
    title: "Careers at LandCheck | Geospatial & Technology Jobs in Nigeria",
    description:
      "Explore careers at LandCheck Geospatial Technologies and help build survey, land intelligence, environmental monitoring, and field operations tools for Nigeria.",
    keywords: "LandCheck careers, GIS jobs Nigeria, geospatial jobs Nigeria, remote sensing jobs Nigeria, technology jobs Nigeria",
    image: DEFAULT_IMAGE,
    type: "website",
    entity: null,
  },
  {
    path: "/privacy",
    title: "Privacy Policy | LandCheck Geospatial Technologies",
    description: "Read how LandCheck collects, uses, and protects personal data across its survey, estate, hazard, and environmental monitoring services.",
    keywords: "LandCheck privacy policy, data protection Nigeria, LandCheck data policy",
    image: DEFAULT_IMAGE,
    type: "website",
    entity: null,
  },
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

const absoluteUrl = (pagePath) => `${SITE_ORIGIN}${pagePath === "/" ? "/" : pagePath}`;

const buildSchema = (page) => {
  const url = absoluteUrl(page.path);
  const graph = [
    {
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      about: { "@id": `${SITE_ORIGIN}/#organization` },
      inLanguage: "en-NG",
    },
  ];

  if (page.entity) {
    const entityUrl = `${url}#${page.entity.idSuffix}`;
    const entity = {
      "@type": page.entity.type,
      "@id": entityUrl,
      name: page.entity.name,
      description: page.description,
      url,
      provider: { "@id": `${SITE_ORIGIN}/#organization` },
      areaServed: { "@type": "Country", name: "Nigeria" },
    };
    if (page.entity.category) {
      if (page.entity.type === "SoftwareApplication") entity.applicationCategory = page.entity.category;
      else if (page.entity.type === "Service") entity.serviceType = page.entity.category;
      else if (["Blog", "TechArticle"].includes(page.entity.type)) entity.articleSection = page.entity.category;
    }
    if (["Service", "SoftwareApplication"].includes(page.entity.type)) {
      entity.offers = { "@type": "Offer", price: "0", priceCurrency: "NGN" };
    }
    graph.push(entity);
  }

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
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: "LandCheck Geospatial Technologies Limited",
      alternateName: ["LandCheck", "LandCheck Nigeria"],
      url: `${SITE_ORIGIN}/`,
      logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/logo-icon-512.png` },
      areaServed: { "@type": "Country", name: "Nigeria" },
      sameAs: SOCIAL_PROFILES,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: "LandCheck",
      url: `${SITE_ORIGIN}/`,
      inLanguage: "en-NG",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
  ],
});

const renderPage = (template, page) => {
  const url = absoluteUrl(page.path);
  const imageType = page.image.toLowerCase().endsWith(".jpg")
    ? "image/jpeg"
    : page.image.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/png";
  const schema = JSON.stringify(buildSchema(page), null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll("</script>", "<\\/script>");
  const siteSchema = JSON.stringify(buildSiteSchema(), null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll("</script>", "<\\/script>");
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  for (const [name, value] of [["description", page.description], ["keywords", page.keywords], ["robots", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"], ["googlebot", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"]]) {
    html = replaceMeta(html, "name", name, value);
  }
  for (const [property, value] of [["og:type", page.type], ["og:title", page.title], ["og:description", page.description], ["og:url", url], ["og:image", page.image], ["og:image:type", imageType], ["og:image:alt", page.title]]) {
    html = replaceMeta(html, "property", property, value);
  }
  for (const [name, value] of [["twitter:title", page.title], ["twitter:description", page.description], ["twitter:image", page.image], ["twitter:image:alt", page.title]]) {
    html = replaceMeta(html, "name", name, value);
  }

  html = html.replace(/\s*<link rel="canonical"[^>]*>/gi, "");
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]+"[^>]*>/gi, "");
  const alternateLinks = ["en-ng", "en", "x-default"]
    .map((language) => `<link rel="alternate" hreflang="${language}" href="${url}" />`)
    .join("\n    ");
  const seoLinks = `<link rel="canonical" href="${url}" />\n    ${alternateLinks}`;
  html = html.replace(/\s*<link rel="sitemap"[^>]*>/i, `\n    ${seoLinks}\n    <link rel="sitemap" type="application/xml" href="${SITE_ORIGIN}/sitemap.xml" />`);
  html = html.replace(/\s*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(
    "</head>",
    `    <script type="application/ld+json" data-lc-site-schema="1">${siteSchema}</script>\n    <script type="application/ld+json" data-lc-page-schema="1">${schema}</script>\n  </head>`,
  );
  return html;
};

const template = await readFile(path.join(DIST_DIR, "index.html"), "utf8");
for (const page of pages) {
  const outputDirectory = page.path === "/"
    ? DIST_DIR
    : path.join(DIST_DIR, ...page.path.split("/").filter(Boolean));
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "index.html"), renderPage(template, page), "utf8");
}

console.log(`Generated ${pages.length} SEO route shells in ${DIST_DIR}`);
