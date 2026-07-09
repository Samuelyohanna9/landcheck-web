// Cloudflare Pages Function — runs at the edge for every request.
//
// Why this exists: the app is a client-side React SPA. Route-specific <title>/meta/JSON-LD
// tags are injected by src/components/SeoRouteMeta.tsx AFTER JS runs. That's fine for
// Googlebot (it renders JS), but link-preview bots for Facebook, X/Twitter, LinkedIn,
// WhatsApp, Slack, Telegram, Discord etc. fetch the raw HTML and never execute JS — so they
// only ever saw the generic homepage tags baked into index.html, regardless of which page
// was actually shared. This rewrites those tags in the raw HTML response for known bot
// user-agents, per route, before the response leaves the edge.
//
// To cover another route: add an entry to ROUTE_SEO below with the same shape.

const SITE_ORIGIN = "https://landcheck.online";

const ROUTE_SEO = {
  "/sponsor": {
    title: "Sponsor a Tree Online in Nigeria — No Sign-Up, GPS-Verified | LandCheck Green",
    description:
      "Sponsor a real, GPS-verified tree in Nigeria from anywhere in the world — pay in NGN or USD, no account required. Get a digital certificate instantly, plus map proof, photo evidence, and email updates as your tree grows.",
    image: `${SITE_ORIGIN}/background-sponsor.png`,
  },
};

const BOT_USER_AGENT_PATTERN =
  /bot|facebookexternalhit|Twitterbot|Slackbot|TelegramBot|WhatsApp|LinkedInBot|Discordbot|Pinterest|redditbot|SkypeUriPreview|vkShare|Applebot|Google-InspectionTool|Googlebot|bingbot|DuckDuckBot|Baiduspider|YandexBot|Embedly|Quora Link Preview|showyoubot|outbrain|W3C_Validator/i;

// Cloudflare's HTMLRewriter binding only recognizes own-enumerable handler
// methods, so these must be plain object literals — class instances put
// `element()` on the prototype instead, which the binding can't see.
const setTextContent = (text) => ({
  element(element) {
    element.setInnerContent(text);
  },
});

const setAttribute = (attr, value) => ({
  element(element) {
    element.setAttribute(attr, value);
  },
});

const appendCanonicalLink = (href) => ({
  element(head) {
    head.append(`<link rel="canonical" href="${href}">`, { html: true });
  },
});

export const onRequest = async (context) => {
  const { request, next } = context;
  const response = await next();

  if (request.method !== "GET") return response;

  const url = new URL(request.url);
  const seo = ROUTE_SEO[url.pathname];
  if (!seo) return response;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const userAgent = request.headers.get("user-agent") || "";
  if (!BOT_USER_AGENT_PATTERN.test(userAgent)) return response;

  const canonicalUrl = `${SITE_ORIGIN}${url.pathname}`;

  return new HTMLRewriter()
    .on("title", setTextContent(seo.title))
    .on('meta[name="description"]', setAttribute("content", seo.description))
    .on('meta[property="og:title"]', setAttribute("content", seo.title))
    .on('meta[property="og:description"]', setAttribute("content", seo.description))
    .on('meta[property="og:url"]', setAttribute("content", canonicalUrl))
    .on('meta[property="og:image"]', setAttribute("content", seo.image))
    .on('meta[property="og:image:alt"]', setAttribute("content", seo.title))
    .on('meta[name="twitter:title"]', setAttribute("content", seo.title))
    .on('meta[name="twitter:description"]', setAttribute("content", seo.description))
    .on('meta[name="twitter:image"]', setAttribute("content", seo.image))
    .on('meta[name="twitter:image:alt"]', setAttribute("content", seo.title))
    .on("head", appendCanonicalLink(canonicalUrl))
    .transform(response);
};
