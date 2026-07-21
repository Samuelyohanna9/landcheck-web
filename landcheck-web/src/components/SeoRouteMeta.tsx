import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type SeoConfig = {
  title: string;
  description: string;
  keywords: string;
  canonicalPath: string;
  robots: string;
  ogType?: "website" | "article";
  ogImage?: string;
  jsonLd?: object | null;
};

const SITE_ORIGIN = "https://landcheck.online";
const DEFAULT_OG_IMAGE = "https://landcheck.online/green-logo-cropped-820.png";

const APP_MOBILE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  "@id": "https://landcheck.online/#android-app",
  "name": "LandCheck Green",
  "operatingSystem": "ANDROID",
  "applicationCategory": "EnvironmentalApp",
  "downloadUrl": "https://play.google.com/store/apps/details?id=online.landcheck.mobile",
  "installUrl": "https://play.google.com/store/apps/details?id=online.landcheck.mobile",
  "identifier": "online.landcheck.mobile",
  "url": "https://landcheck.online/green-partners",
  "description":
    "Free Android app for GPS tree inventory, agricultural farm health monitoring, humanitarian relief site assessment, and program reporting. Used by NGOs and field teams in Nigeria.",
  "author": { "@id": "https://landcheck.online/#organization" },
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "NGN" },
  "featureList": [
    "GPS tree planting and inventory records",
    "Agricultural farm health monitoring with NDVI satellite analysis",
    "Humanitarian relief and recovery site assessment",
    "Photo evidence capture with GPS timestamps",
    "Offline field data collection with automatic background sync",
    "Maintenance and field visit tracking",
    "Farmer and beneficiary management",
    "Carbon reporting and donor impact reports",
  ],
};

const PUBLIC_ROUTES: Record<string, Omit<SeoConfig, "robots"> & { robots?: string }> = {
  "/": {
    title: "LandCheck Nigeria | Survey Plan, Flood Risk & Tree Monitoring Platform",
    description:
      "LandCheck is Nigeria's geospatial intelligence platform for survey plan production, flood risk analysis, and GPS tree monitoring with audit-ready reports.",
    keywords:
      "survey plan Nigeria, flood risk analysis Nigeria, tree monitoring app Nigeria, geospatial platform Nigeria, LandCheck Nigeria, land survey Nigeria, GPS monitoring Nigeria",
    canonicalPath: "/",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "LandCheck Products",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "LandCheck Green — Free Tree & Agric Monitoring App",
          "url": "https://landcheck.online/green-partners",
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Survey Plan Production Nigeria",
          "url": "https://landcheck.online/survey",
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Flood Risk & Land Hazard Analysis Nigeria",
          "url": "https://landcheck.online/flood",
        },
      ],
    },
  },

  "/green-partners": {
    title: "CSR Tree Planting Software Nigeria | ESG Reporting Dashboard | LandCheck Green Corporate",
    description:
      "LandCheck Green Corporate helps CSR, ESG, donor, and sustainability teams plan tree-planting programmes, deploy field agents, verify GPS evidence, monitor maintenance, and export stakeholder-ready reports in Nigeria.",
    keywords:
      "CSR tree planting software Nigeria, ESG reporting dashboard Nigeria, tree planting CSR reporting, environmental project monitoring software, GPS verification tree planting, CSR implementation dashboard, sustainability reporting tree projects, NGO monitoring dashboard Nigeria",
    canonicalPath: "/green-partners",
    ogType: "website",
    ogImage: "https://landcheck.online/background-sponsor.png",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        APP_MOBILE_JSON_LD,
        {
          "@type": "SoftwareApplication",
          "@id": "https://landcheck.online/green-partners#csr-software",
          "name": "LandCheck Green Corporate",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web, Android",
          "url": "https://landcheck.online/green-partners",
          "description":
            "Corporate CSR and ESG implementation dashboard for project planning, GPS field verification, maintenance monitoring, stakeholder reporting, and public impact visibility.",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "NGN"
          },
          "featureList": [
            "CSR programme planning and implementation control",
            "GPS evidence capture and review",
            "QR-coded field workflow support",
            "Maintenance and field visit monitoring",
            "Board-ready PDF and CSV reporting exports",
            "Public sponsorship and transparency experience"
          ]
        },
        {
          "@type": "FAQPage",
          "@id": "https://landcheck.online/green-partners#faq",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What does LandCheck Green Corporate help CSR managers do?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "It helps CSR managers design programmes, assign field work, verify GPS and photo evidence, monitor maintenance, and prepare stakeholder-ready reporting from one dashboard."
              }
            },
            {
              "@type": "Question",
              "name": "Is this only for tree planting?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "The platform is strongest for verified tree-planting and environmental programmes, but the same monitoring model also supports agricultural and field implementation workflows."
              }
            },
            {
              "@type": "Question",
              "name": "Can LandCheck support ESG and sustainability reporting workflows?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. LandCheck helps teams keep structured field evidence, implementation progress, and reporting exports that can support internal ESG, CSR, donor, and board reporting processes."
              }
            }
          ]
        }
      ]
    },
  },

  "/sponsor": {
    title: "Sponsor a Tree Online in Nigeria — No Sign-Up, GPS-Verified | LandCheck Green",
    description:
      "Sponsor a real, GPS-verified tree in Nigeria from anywhere in the world — pay in NGN or USD, no account required. Get a digital certificate instantly, plus map proof, photo evidence, and email updates as your tree grows.",
    keywords:
      "sponsor a tree online, sponsor a tree Nigeria, plant a tree online Nigeria, tree sponsorship no signup, donate trees Nigeria, adopt a tree Africa, carbon offset Nigeria, gift a tree, plant trees for climate change, verified tree planting donation, diaspora tree donation Nigeria",
    canonicalPath: "/sponsor",
    ogType: "website",
    ogImage: "https://landcheck.online/background-sponsor.png",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          "@id": "https://landcheck.online/sponsor#service",
          "name": "Tree Sponsorship — LandCheck Green",
          "serviceType": "Tree Planting Sponsorship",
          "provider": { "@id": "https://landcheck.online/#organization" },
          "areaServed": { "@type": "Country", "name": "Nigeria" },
          "audience": { "@type": "Audience", "audienceType": "Global donors and diaspora" },
          "description":
            "Sponsor a GPS-verified tree planted and maintained in Nigeria by LandCheck field agents. No account required — pay online in NGN or USD and receive a digital certificate, GPS map location, and photo evidence by email.",
          "url": "https://landcheck.online/sponsor",
          "offers": {
            "@type": "Offer",
            "priceCurrency": "NGN",
            "availability": "https://schema.org/InStock",
            "url": "https://landcheck.online/sponsor",
          },
        },
        {
          "@type": "FAQPage",
          "@id": "https://landcheck.online/sponsor#faq",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Do I need to create an account to sponsor a tree?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "No. You can sponsor a tree as a guest with just your name, email, and phone number. You can optionally set up an account afterward to track your trees over time.",
              },
            },
            {
              "@type": "Question",
              "name": "How does my certificate and tracking work?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "The moment your payment is confirmed, you receive a digital sponsorship certificate by email. As your tree is planted and cared for, you get its GPS map location, photo evidence, and maintenance updates — no account required to check on it.",
              },
            },
            {
              "@type": "Question",
              "name": "What is the climate impact of sponsoring a tree?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Each sponsored tree absorbs roughly 21 kg of CO2 per year and helps retain around 120 liters of water, adding up to measurable climate impact over time.",
              },
            },
            {
              "@type": "Question",
              "name": "Are the tree planting sites approved and monitored?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Every project has full land-rights and planting approval on record, and LandCheck field agents are on the ground to plant and maintain the trees.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I sponsor a tree from outside Nigeria?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. LandCheck Green accepts payment in NGN or USD, so donors and diaspora anywhere in the world can sponsor a verified tree in Nigeria online.",
              },
            },
          ],
        },
      ],
    },
  },

  "/sponsor/calculator": {
    title: "CO2 Footprint Calculator — How Many Trees Should You Sponsor? | LandCheck Green",
    description:
      "Estimate your annual carbon footprint from travel, home energy, and diet, and find out how many verified trees in Nigeria would offset it. Free, quick, works for anyone worldwide.",
    keywords:
      "carbon footprint calculator, CO2 calculator trees, how many trees to offset carbon, tree offset calculator, personal carbon footprint, climate calculator",
    canonicalPath: "/sponsor/calculator",
    ogType: "website",
    ogImage: "https://landcheck.online/background-sponsor.png",
  },

  "/privacy": {
    title: "Privacy Policy | LandCheck Geospatial Technologies",
    description:
      "LandCheck privacy policy — how we collect, use, and protect your personal data across our survey plan, flood risk, and tree monitoring services in Nigeria.",
    keywords: "LandCheck privacy policy, data protection Nigeria, LandCheck data policy",
    canonicalPath: "/privacy",
    robots: "index,follow",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  },

  "/flood": {
    title: "Flood Risk & Land Hazard Analysis Nigeria | Free Report | LandCheck",
    description:
      "Screen any Nigerian land parcel for flood risk, erosion hazard, and soil stability. Instant free PDF risk report with site-specific analysis for any location in Nigeria.",
    keywords:
      "flood risk analysis Nigeria, land hazard screening Nigeria, flood risk map Nigeria, erosion risk Nigeria, soil stability analysis Nigeria, flood PDF report, land hazard Nigeria, free flood risk report",
    canonicalPath: "/flood",
    ogType: "website",
    ogImage: "https://landcheck.online/flood-background.jpg",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": "https://landcheck.online/flood#service",
      "name": "Flood Risk & Land Hazard Analysis",
      "serviceType": "Land Hazard Screening",
      "provider": { "@id": "https://landcheck.online/#organization" },
      "areaServed": { "@type": "Country", "name": "Nigeria" },
      "description":
        "Instant flood risk, erosion, and soil stability screening for any land parcel in Nigeria. Generates a professional PDF hazard report.",
      "url": "https://landcheck.online/flood",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "NGN" },
    },
  },

  "/hazard-analysis": {
    title: "Flood Risk Hazard Analysis Tool | LandCheck",
    description:
      "Analyze land and site flood risks across Nigeria with map-based hazard tools for better planning and resilient project execution.",
    keywords: "hazard analysis tool Nigeria, flood analysis tool",
    canonicalPath: "/flood",
    robots: "noindex,follow",
    ogType: "website",
    ogImage: "https://landcheck.online/flood-background.jpg",
  },

  "/survey": {
    title: "Survey Plan Production Nigeria | Professional Survey Plans Online | LandCheck",
    description:
      "Generate true-scale professional survey plans in Nigeria from coordinate input. Export PDF, DWG, orthophoto, computation sheets, and topographic maps. No CAD software required.",
    keywords:
      "survey plan Nigeria, survey plan production Nigeria, digital survey plan Nigeria, online survey plan generator, professional survey plan PDF Nigeria, DWG survey plan Nigeria, survey plan coordinates",
    canonicalPath: "/survey",
    ogType: "website",
    ogImage: "https://landcheck.online/Digital-Land-Survey.jpg",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": "https://landcheck.online/survey#service",
      "name": "Survey Plan Production",
      "serviceType": "Geospatial Survey Planning",
      "provider": { "@id": "https://landcheck.online/#organization" },
      "areaServed": { "@type": "Country", "name": "Nigeria" },
      "description":
        "Professional survey plan production for Nigeria. Generate true-scale PDF, DWG, orthophoto, and computation sheets from coordinate input. No CAD required.",
      "url": "https://landcheck.online/survey",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "NGN" },
    },
  },

  "/survey-plan": {
    title: "Survey Plan Tool | LandCheck",
    description:
      "Create professional survey plans for Nigeria from coordinate input with map editing and export-ready outputs.",
    keywords: "survey plan tool Nigeria",
    canonicalPath: "/survey",
    robots: "noindex,follow",
    ogType: "website",
    ogImage: "https://landcheck.online/Digital-Land-Survey.jpg",
  },

  "/feedback": {
    title: "Feedback | LandCheck",
    description: "Share product feedback with the LandCheck team.",
    keywords: "LandCheck feedback",
    canonicalPath: "/feedback",
    robots: "noindex,nofollow",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  },

  "/career": {
    title: "Careers at LandCheck | Geospatial & Tech Jobs in Nigeria",
    description:
      "Join LandCheck Geospatial Technologies. We hire engineers, GIS specialists, product designers, and partnership professionals building land intelligence tools for Nigeria.",
    keywords:
      "LandCheck careers, geospatial jobs Nigeria, GIS jobs Nigeria, tech jobs Nigeria, LandCheck Geospatial Technologies careers, remote sensing jobs Nigeria",
    canonicalPath: "/career",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": "https://landcheck.online/career#page",
      "name": "Careers at LandCheck",
      "description":
        "Job openings and career opportunities at LandCheck Geospatial Technologies Limited in Nigeria.",
      "url": "https://landcheck.online/career",
      "isPartOf": { "@id": "https://landcheck.online/#website" },
    },
  },

  "/news": {
    title: "CSR Reporting, ESG & Environmental Monitoring Insights | LandCheck",
    description:
      "Read LandCheck insights on CSR reporting, GPS verification, environmental project monitoring, ESG workflow support, and tree-planting programme delivery in Nigeria.",
    keywords:
      "CSR reporting checklist, ESG reporting Nigeria, GPS verification environmental projects, tree planting project management, environmental monitoring software, LandCheck insights",
    canonicalPath: "/news",
    ogType: "article",
    ogImage: "https://landcheck.online/ecf-partnership.jpeg",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      "@id": "https://landcheck.online/news#blog",
      "name": "LandCheck Insights",
      "description":
        "Articles and updates about CSR reporting, ESG workflows, GPS verification, and environmental project monitoring from LandCheck.",
      "url": "https://landcheck.online/news",
      "publisher": { "@id": "https://landcheck.online/#organization" },
    },
  },
};

const PRIVATE_ROUTE_PREFIXES = ["/green", "/green-work", "/dashboard", "/admin"];
const IMPACT_ROUTE_PREFIX = "/impact/";

const normalizePath = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "/";
  const noTrailing = trimmed.replace(/\/+$/, "");
  return noTrailing || "/";
};

const upsertMetaByName = (name: string, content: string) => {
  let tag = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

const upsertMetaByProperty = (property: string, content: string) => {
  let tag = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

const upsertCanonical = (href: string) => {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
};

const removeCanonical = () => {
  const link = document.head.querySelector('link[rel="canonical"]');
  if (link) link.remove();
};

const upsertPageJsonLd = (data: object | null) => {
  const existing = document.head.querySelector('script[data-lc-page-schema]') as HTMLScriptElement | null;
  if (!data) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    existing.textContent = JSON.stringify(data, null, 2);
  } else {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.setAttribute("data-lc-page-schema", "1");
    script.textContent = JSON.stringify(data, null, 2);
    document.head.appendChild(script);
  }
};

const resolveSeoConfig = (pathname: string): SeoConfig => {
  const normalizedPath = normalizePath(pathname);

  // /impact/:orgSlug — public shareable donor impact page
  if (normalizedPath.startsWith(IMPACT_ROUTE_PREFIX) || normalizedPath === "/impact") {
    const orgSlug = normalizedPath.replace(/^\/impact\/?/, "") || "organisation";
    const orgName = orgSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `${orgName} — Programme Impact Report | LandCheck`,
      description: `View the verified programme impact report for ${orgName} — field activities, evidence photos, GPS maps, and supervisor-approved outcomes. Powered by LandCheck.`,
      keywords: `${orgName} impact report, LandCheck impact, programme report Nigeria, field monitoring impact, NGO transparency`,
      canonicalPath: normalizedPath,
      robots: "index,follow,max-image-preview:large,max-snippet:-1",
      ogType: "website",
      ogImage: DEFAULT_OG_IMAGE,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Report",
        "name": `${orgName} Programme Impact Report`,
        "description": `Supervisor-verified field monitoring impact report for ${orgName}. Powered by LandCheck Geospatial Technologies.`,
        "url": `${SITE_ORIGIN}/impact/${orgSlug}`,
        "publisher": { "@id": `${SITE_ORIGIN}/#organization` },
        "inLanguage": "en-NG",
      },
    };
  }

  const isPrivate = PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );

  if (isPrivate) {
    return {
      title: "LandCheck Workspace",
      description: "Operational workspace for LandCheck Green projects.",
      keywords: "",
      canonicalPath: normalizedPath,
      robots: "noindex,nofollow,noarchive",
      ogType: "website",
      ogImage: DEFAULT_OG_IMAGE,
      jsonLd: null,
    };
  }

  const publicRoute = PUBLIC_ROUTES[normalizedPath];
  if (publicRoute) {
    return {
      ...publicRoute,
      keywords: publicRoute.keywords || "",
      robots:
        publicRoute.robots ||
        "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
      jsonLd: publicRoute.jsonLd ?? null,
    };
  }

  return {
    title: "LandCheck Nigeria | Geospatial Intelligence Platform",
    description:
      "LandCheck — Nigeria's platform for survey plans, flood risk analysis, and tree monitoring.",
    keywords: "LandCheck Nigeria, geospatial Nigeria",
    canonicalPath: "/",
    robots: "noindex,nofollow,noarchive",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: null,
  };
};

export default function SeoRouteMeta() {
  const location = useLocation();

  useEffect(() => {
    const seo = resolveSeoConfig(location.pathname);
    const canonicalUrl = `${SITE_ORIGIN}${seo.canonicalPath}`;
    const ogImage = seo.ogImage || DEFAULT_OG_IMAGE;
    const isNoIndex = seo.robots.includes("noindex");

    document.title = seo.title;
    document.documentElement.setAttribute("lang", "en");

    upsertMetaByName("description", seo.description);
    upsertMetaByName("robots", seo.robots);
    upsertMetaByName("googlebot", seo.robots);
    if (seo.keywords) {
      upsertMetaByName("keywords", seo.keywords);
    }

    if (isNoIndex && seo.canonicalPath === normalizePath(location.pathname)) {
      removeCanonical();
    } else {
      upsertCanonical(canonicalUrl);
    }

    upsertMetaByProperty("og:locale", "en_NG");
    upsertMetaByProperty("og:title", seo.title);
    upsertMetaByProperty("og:description", seo.description);
    upsertMetaByProperty("og:type", seo.ogType || "website");
    upsertMetaByProperty("og:url", canonicalUrl);
    upsertMetaByProperty("og:image", ogImage);
    upsertMetaByProperty("og:image:width", "1200");
    upsertMetaByProperty("og:image:height", "630");
    upsertMetaByProperty("og:image:alt", seo.title);

    upsertMetaByName("twitter:title", seo.title);
    upsertMetaByName("twitter:description", seo.description);
    upsertMetaByName("twitter:image", ogImage);
    upsertMetaByName("twitter:image:alt", seo.title);

    upsertPageJsonLd(seo.jsonLd ?? null);
  }, [location.pathname]);

  return null;
}
