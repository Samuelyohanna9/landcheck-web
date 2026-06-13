import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  ogType?: "website" | "article";
  ogImage?: string;
};

const SITE_ORIGIN = "https://landcheck.online";
const DEFAULT_OG_IMAGE = "https://landcheck.online/green-logo-cropped-820.png";

const PUBLIC_ROUTES: Record<string, Omit<SeoConfig, "robots"> & { robots?: string }> = {
  "/": {
    title: "LandCheck Nigeria | Survey Plan, Flood Risk, and Tree Monitoring",
    description:
      "LandCheck is a Nigeria-focused platform for survey plan production, flood risk analysis, and tree monitoring with GPS evidence and audit-ready reports.",
    canonicalPath: "/",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  },
  "/green-partners": {
    title: "LandCheck Green Nigeria | Tree Monitoring App, Agric & Relief Programs",
    description:
      "Download LandCheck Green on Google Play or sponsor trees online. Tree inventory, agricultural monitoring, humanitarian relief site assessment, and program reporting for NGOs and partners in Nigeria.",
    canonicalPath: "/green-partners",
    ogType: "website",
    ogImage: "https://landcheck.online/background-sponsor.png",
  },
  "/privacy": {
    title: "Privacy Policy | LandCheck",
    description: "LandCheck privacy policy covering data collection, usage, and user rights.",
    canonicalPath: "/privacy",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  },
  "/flood": {
    title: "Flood Risk & Land Hazard Analysis Nigeria | LandCheck",
    description:
      "Screen any Nigerian land parcel for flood risk, erosion, and soil stability. Instant PDF risk report. Free for any location in Nigeria.",
    canonicalPath: "/flood",
    ogType: "website",
    ogImage: "https://landcheck.online/flood-background.jpg",
  },
  "/hazard-analysis": {
    title: "Flood Risk Hazard Analysis Nigeria | LandCheck",
    description:
      "Analyze land and site flood risks across Nigeria with map-based hazard tools for better planning and resilient project execution.",
    canonicalPath: "/hazard-analysis",
    ogType: "website",
    ogImage: "https://landcheck.online/flood-background.jpg",
  },
  "/survey": {
    title: "Survey Plan Production Nigeria | LandCheck",
    description:
      "Generate true-scale professional survey plans in Nigeria from coordinate input. PDF, DWG, orthophoto, computation sheets, and topographic maps. No CAD required.",
    canonicalPath: "/survey",
    ogType: "website",
    ogImage: "https://landcheck.online/Digital-Land-Survey.jpg",
  },
  "/survey-plan": {
    title: "Survey Plan Tool | LandCheck",
    description:
      "Create professional survey plans for Nigeria from coordinate input with map editing and export-ready outputs.",
    canonicalPath: "/survey-plan",
    ogType: "website",
    ogImage: "https://landcheck.online/Digital-Land-Survey.jpg",
  },
  "/feedback": {
    title: "Feedback | LandCheck",
    description: "Share product feedback with the LandCheck team.",
    canonicalPath: "/feedback",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  },
  "/career": {
    title: "Careers | LandCheck",
    description: "Join LandCheck Geospatial Technologies. We hire engineers, GIS specialists, product designers, and partnership professionals working on land intelligence tools for Nigeria.",
    canonicalPath: "/career",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  },
  "/news": {
    title: "News | LandCheck",
    description: "News and updates from LandCheck Geospatial Technologies — partnerships, product launches, and platform milestones.",
    canonicalPath: "/news",
    ogType: "article",
    ogImage: "https://landcheck.online/ecf-partnership.jpeg",
  },
};

const PRIVATE_ROUTE_PREFIXES = ["/green", "/green-work", "/dashboard", "/admin"];

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

const resolveSeoConfig = (pathname: string): SeoConfig => {
  const normalizedPath = normalizePath(pathname);
  const isPrivate = PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );

  if (isPrivate) {
    return {
      title: "LandCheck Workspace",
      description: "Operational workspace for LandCheck Green projects.",
      canonicalPath: "/",
      robots: "noindex,nofollow,noarchive",
      ogType: "website",
      ogImage: DEFAULT_OG_IMAGE,
    };
  }

  const publicRoute = PUBLIC_ROUTES[normalizedPath];
  if (publicRoute) {
    return {
      ...publicRoute,
      robots: publicRoute.robots || "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    };
  }

  return {
    title: "LandCheck",
    description: "Land intelligence and climate monitoring platform.",
    canonicalPath: "/",
    robots: "noindex,nofollow,noarchive",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
  };
};

export default function SeoRouteMeta() {
  const location = useLocation();

  useEffect(() => {
    const seo = resolveSeoConfig(location.pathname);
    const canonicalUrl = `${SITE_ORIGIN}${seo.canonicalPath}`;
    const ogImage = seo.ogImage || DEFAULT_OG_IMAGE;

    document.title = seo.title;
    document.documentElement.setAttribute("lang", "en");

    upsertMetaByName("description", seo.description);
    upsertMetaByName("robots", seo.robots);
    upsertMetaByName("googlebot", seo.robots);
    upsertCanonical(canonicalUrl);

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
  }, [location.pathname]);

  return null;
}
