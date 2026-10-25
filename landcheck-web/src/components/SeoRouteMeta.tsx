import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getArticleBySlug } from "../data/newsArticles";
import routeMetadata from "../data/routeMetadata.json";

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
const DEFAULT_OG_IMAGE = String((routeMetadata["/"] as { ogImage?: string }).ogImage || "https://landcheck.online/ecf-partnership.jpeg");

type SharedSeoConfig = Omit<SeoConfig, "robots"> & { robots?: string | null };

const PUBLIC_ROUTES = routeMetadata as Record<string, SharedSeoConfig>;

const PRIVATE_ROUTE_PREFIXES = ["/green", "/green-work", "/dashboard", "/admin"];
const IMPACT_ROUTE_PREFIX = "/impact/";

const normalizePath = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "/";
  const noTrailing = trimmed.replace(/\/+$/, "");
  return noTrailing || "/";
};

const publicCanonicalPath = (path: string) => (path === "/" ? "/" : `${path}/`);

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

const removeMetaByProperty = (property: string) => {
  document.head.querySelector(`meta[property="${property}"]`)?.remove();
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

const upsertAlternateLinks = (href: string) => {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((link) => link.remove());
  for (const hreflang of ["en-ng", "en", "x-default"]) {
    const link = document.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", hreflang);
    link.setAttribute("href", href);
    document.head.appendChild(link);
  }
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

  // /impact/:orgSlug - public shareable donor impact page
  if (normalizedPath.startsWith(IMPACT_ROUTE_PREFIX) || normalizedPath === "/impact") {
    const orgSlug = normalizedPath.replace(/^\/impact\/?/, "") || "organisation";
    const orgName = orgSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `${orgName} - Programme Impact Report | LandCheck`,
      description: `View the verified programme impact report for ${orgName} - field activities, evidence photos, GPS maps, and supervisor-approved outcomes. Powered by LandCheck.`,
      keywords: `${orgName} impact report, LandCheck impact, programme report Nigeria, field monitoring impact, NGO transparency`,
      canonicalPath: publicCanonicalPath(normalizedPath),
      robots: "index,follow,max-image-preview:large,max-snippet:-1",
      ogType: "website",
      ogImage: DEFAULT_OG_IMAGE,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Report",
        "name": `${orgName} Programme Impact Report`,
        "description": `Supervisor-verified field monitoring impact report for ${orgName}. Powered by LandCheck Geospatial Technologies.`,
        "url": `${SITE_ORIGIN}/impact/${orgSlug}/`,
        "publisher": { "@id": `${SITE_ORIGIN}/#organization` },
        "inLanguage": "en-NG",
      },
    };
  }

  // /news/:slug - individual story page
  if (normalizedPath.startsWith("/news/")) {
    const slug = normalizedPath.replace(/^\/news\/?/, "");
    const article = getArticleBySlug(slug);
    if (article) {
      return {
        title: `${article.title} | LandCheck Insights`,
        description: article.summary,
        keywords: `${article.tag}, LandCheck, ${article.location || "tree planting Nigeria"}`,
        canonicalPath: publicCanonicalPath(normalizedPath),
        robots: "index,follow,max-image-preview:large,max-snippet:-1",
        ogType: "article",
        ogImage: article.heroImage ? `${SITE_ORIGIN}${article.heroImage}` : DEFAULT_OG_IMAGE,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "@id": `${SITE_ORIGIN}/news/${article.slug}/`,
          headline: article.title,
          datePublished: article.date,
          dateModified: article.date,
          description: article.summary,
          url: `${SITE_ORIGIN}/news/${article.slug}/`,
          author: { "@type": "Organization", name: "LandCheck Geospatial Technologies Limited", url: SITE_ORIGIN },
          publisher: {
            "@type": "Organization",
            name: "LandCheck Geospatial Technologies Limited",
            logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/logo-icon-512.png` },
          },
          image: article.heroImage ? `${SITE_ORIGIN}${article.heroImage}` : `${SITE_ORIGIN}/logo-icon-512.png`,
          articleSection: article.tag,
        },
      };
    }
  }

  // Public estate marketing pages are intended to be discoverable. Reservation, verification,
  // buyer, agent, inspection, and workspace routes do not match this exact one-segment pattern
  // and remain noindex through the fallback below.
  const publicEstateMatch = normalizedPath.match(/^\/estates\/public\/([^/]+)$/);
  if (publicEstateMatch) {
    const estateName = publicEstateMatch[1]
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
    return {
      title: `${estateName} | Estate Plots, Location & Verification | LandCheck`,
      description:
        `Explore ${estateName}: view the public estate layout, plot information, location, and buyer verification details on LandCheck.`,
      keywords: `${estateName}, estate plots Nigeria, land for sale Nigeria, verify estate plot, LandCheck estate`,
      canonicalPath: publicCanonicalPath(normalizedPath),
      robots: "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
      ogType: "website",
      ogImage: "https://landcheck.online/estates.jpg",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `https://landcheck.online${publicCanonicalPath(normalizedPath)}#page`,
        "name": `${estateName} Estate`,
        "description":
          `Public estate information, plot availability, location, and buyer verification for ${estateName}.`,
        "url": `https://landcheck.online${publicCanonicalPath(normalizedPath)}`,
        "isPartOf": { "@id": "https://landcheck.online/#website" },
        "about": { "@id": "https://landcheck.online/#organization" },
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

  // Everything else: an authenticated app page this map doesn't need to know about (it sets its
  // own document.title, e.g. EstateShell), or a genuine 404. Either way it must never carry a
  // canonical pointing at the homepage - self-canonical + noindex correctly removes the canonical
  // tag below, instead of every one of these unrelated pages claiming to canonicalize to "/".
  return {
    title: "LandCheck Nigeria | Geospatial Intelligence Platform",
    description:
      "LandCheck - Nigeria's platform for survey plans, flood risk analysis, and tree monitoring.",
    keywords: "LandCheck Nigeria, geospatial Nigeria",
    canonicalPath: normalizedPath,
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
    upsertAlternateLinks(canonicalUrl);

    upsertMetaByProperty("og:locale", "en_NG");
    upsertMetaByProperty("og:title", seo.title);
    upsertMetaByProperty("og:description", seo.description);
    upsertMetaByProperty("og:type", seo.ogType || "website");
    upsertMetaByProperty("og:url", canonicalUrl);
    upsertMetaByProperty("og:image", ogImage);
    if (ogImage === DEFAULT_OG_IMAGE) {
      upsertMetaByProperty("og:image:width", "1280");
      upsertMetaByProperty("og:image:height", "720");
    } else {
      removeMetaByProperty("og:image:width");
      removeMetaByProperty("og:image:height");
    }
    upsertMetaByProperty("og:image:alt", seo.title);

    upsertMetaByName("twitter:title", seo.title);
    upsertMetaByName("twitter:description", seo.description);
    upsertMetaByName("twitter:image", ogImage);
    upsertMetaByName("twitter:image:alt", seo.title);

    upsertPageJsonLd(seo.jsonLd ?? null);
  }, [location.pathname]);

  return null;
}
