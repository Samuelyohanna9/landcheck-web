import { useEffect } from "react";
import { useLocation } from "react-router-dom";

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  ogType?: "website" | "article";
};

const SITE_ORIGIN = "https://landcheck.online";

const PUBLIC_ROUTES: Record<string, Omit<SeoConfig, "robots"> & { robots?: string }> = {
  "/": {
    title: "LandCheck | Land Intelligence and Climate Monitoring",
    description:
      "LandCheck helps teams monitor tree planting, maintenance, survival, and carbon impact with GPS evidence and audit-ready reports.",
    canonicalPath: "/",
    ogType: "website",
  },
  "/green-partners": {
    title: "LandCheck Green Partners | NGO and Program Collaboration",
    description:
      "Collaborate with LandCheck Green for transparent field monitoring, project oversight, and report-ready climate impact tracking.",
    canonicalPath: "/green-partners",
    ogType: "website",
  },
  "/hazard-analysis": {
    title: "Hazard Analysis | LandCheck",
    description:
      "Analyze land and site risks with map-based hazard tools to improve planning and resilient project execution.",
    canonicalPath: "/hazard-analysis",
    ogType: "website",
  },
  "/survey-plan": {
    title: "Survey Planning | LandCheck",
    description:
      "Plan field survey workflows, capture requirements, and prepare operations for accurate and traceable implementation.",
    canonicalPath: "/survey-plan",
    ogType: "website",
  },
  "/feedback": {
    title: "Feedback | LandCheck",
    description: "Share product feedback with the LandCheck team.",
    canonicalPath: "/feedback",
    ogType: "website",
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
  };
};

export default function SeoRouteMeta() {
  const location = useLocation();

  useEffect(() => {
    const seo = resolveSeoConfig(location.pathname);
    const canonicalUrl = `${SITE_ORIGIN}${seo.canonicalPath}`;

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

    upsertMetaByName("twitter:title", seo.title);
    upsertMetaByName("twitter:description", seo.description);
  }, [location.pathname]);

  return null;
}
