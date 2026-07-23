import { useNavigate } from "react-router-dom";
import "../styles/inner-pages.css";
import "../styles/news.css";
import NavBar from "../components/NavBar";
import { newsArticles } from "../data/newsArticles";

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const sponsorStories = newsArticles.filter((article) => article.sponsored);
const insightArticles = newsArticles.filter((article) => !article.sponsored);

const articleSchema = {
  "@context": "https://schema.org",
  "@graph": newsArticles.map((article) => ({
    "@type": "BlogPosting",
    "@id": `https://landcheck.online/news/${article.slug}`,
    headline: article.title,
    datePublished: article.date,
    dateModified: article.date,
    description: article.summary,
    url: `https://landcheck.online/news/${article.slug}`,
    author: {
      "@type": "Organization",
      name: "LandCheck Geospatial Technologies Limited",
      url: "https://landcheck.online/",
    },
    publisher: {
      "@type": "Organization",
      name: "LandCheck Geospatial Technologies Limited",
      logo: {
        "@type": "ImageObject",
        url: "https://landcheck.online/green-logo-cropped-820.png",
      },
    },
    image: article.heroImage
      ? `https://landcheck.online${article.heroImage}`
      : "https://landcheck.online/green-logo-cropped-820.png",
    articleSection: article.tag,
  })),
};

export default function NewsPage() {
  const navigate = useNavigate();
  const [featured, ...secondarySponsorStories] = sponsorStories;

  return (
    <div className="ip-page np-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <NavBar activeRoute="/news" />

      <main>
        <section className="np-page-header">
          <div className="ip-container">
            <span className="ip-eyebrow">LandCheck insights</span>
            <h1>Real trees. Real places. Real stories.</h1>
            <p>
              Field stories from LandCheck Green's public sponsors, plus practical guides on running verified,
              audit-ready environmental programmes in Nigeria.
            </p>
          </div>
        </section>

        {featured ? (
          <section className="np-spotlight">
            <div className="ip-container np-spotlight-container">
              <span className="np-spotlight-eyebrow">Sponsor stories</span>
              <a className="np-spotlight-card" href={`/news/${featured.slug}`}>
                {featured.heroImage ? (
                  <div className="np-spotlight-media">
                    <img src={featured.heroImage} alt={featured.heroImageAlt || featured.title} loading="lazy" />
                  </div>
                ) : null}
                <div className="np-spotlight-copy">
                  <div className="np-article-meta">
                    <span className="np-tag">{featured.tag}</span>
                    {featured.location ? <span className="np-story-location">{featured.location}</span> : null}
                    <time dateTime={featured.date}>{formatDate(featured.date)}</time>
                  </div>
                  <h2>{featured.title}</h2>
                  <p className="np-lead">{featured.summary}</p>
                  <span className="np-inline-link">Read the full story →</span>
                </div>
              </a>

              {secondarySponsorStories.length > 0 ? (
                <div className="np-spotlight-secondary">
                  {secondarySponsorStories.map((article) => (
                    <a key={article.slug} className="np-library-card np-library-card--photo" href={`/news/${article.slug}`}>
                      {article.heroImage ? (
                        <div className="np-library-card-media">
                          <img src={article.heroImage} alt={article.heroImageAlt || article.title} loading="lazy" />
                        </div>
                      ) : null}
                      <div className="np-article-meta">
                        <span className="np-tag">{article.tag}</span>
                        <time dateTime={article.date}>{formatDate(article.date)}</time>
                      </div>
                      <h2>{article.title}</h2>
                      <p>{article.summary}</p>
                      <span className="np-inline-link">Read article</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="np-library">
          <div className="ip-container">
            <h2 className="np-library-heading">Guides &amp; reporting insights</h2>
            <div className="np-library-grid">
              {insightArticles.map((article) => (
                <a key={article.slug} className="np-library-card" href={`/news/${article.slug}`}>
                  <div className="np-article-meta">
                    <span className="np-tag">{article.tag}</span>
                    <time dateTime={article.date}>{formatDate(article.date)}</time>
                  </div>
                  <h2>{article.title}</h2>
                  <p>{article.summary}</p>
                  <span className="np-inline-link">Read article</span>
                </a>
              ))}
            </div>

            <div className="np-cta-card">
              <h3>Need the product view, not just the article?</h3>
              <p>
                See the corporate landing page, brochure, dashboard previews, and reporting proof built for CSR
                managers and programme supervisors.
              </p>
              <div className="np-cta-actions">
                <button type="button" onClick={() => navigate("/green-partners")}>
                  Open LC Green Corporate
                </button>
                <a href="/lc-green-corporate-brochure.pdf" download>
                  Download brochure
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="ip-footer">
        <div className="ip-footer-inner">
          <span>&copy; {new Date().getFullYear()} LandCheck Geospatial Technologies Limited</span>
          <div className="ip-footer-links">
            <button type="button" onClick={() => navigate("/")}>
              Home
            </button>
            <button type="button" onClick={() => navigate("/privacy")}>
              Privacy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
